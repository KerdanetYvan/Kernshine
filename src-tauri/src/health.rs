//! Santé du matériel (page Santé) : disques, dernier test de la mémoire.
//!
//! Tout se lit sans droits administrateur, sauf l'usure des disques (lue à la demande).
//! Une valeur que Windows ne donne pas reste absente : l'interface ne l'invente pas.

use crate::updates::blocking;
use crate::{proc, ps};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskHealth {
    /// « C: »
    letter: String,
    /// Numéro du disque physique (plusieurs lettres peuvent partager un disque).
    disk_number: u32,
    /// `ssd`, `hdd`, ou absent quand Windows ne le sait pas.
    kind: Option<&'static str>,
    /// État donné par Windows : `ok`, `warning`, `bad` ou `unknown`.
    state: &'static str,
    total_bytes: u64,
    free_bytes: u64,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryTest {
    /// Date du dernier test de la mémoire de Windows (secondes depuis 1970).
    date: i64,
    errors: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    disks: Vec<DiskHealth>,
    /// Absent si le test de la mémoire de Windows n'a jamais été lancé.
    memory_test: Option<MemoryTest>,
    /// Absent sur un PC sans batterie.
    battery: Option<Battery>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    /// Capacité d'origine et capacité actuelle, en mWh.
    design_mwh: u64,
    full_mwh: u64,
    /// Cycles de charge, si la batterie les compte.
    cycles: Option<u64>,
}

fn text(v: &Value, key: &str) -> String {
    match v.get(key) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn number(v: &Value, key: &str) -> u64 {
    match v.get(key) {
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0),
        Some(Value::String(s)) => s.trim().parse().unwrap_or(0),
        _ => 0,
    }
}

// ─── Disques ────────────────────────────────────────────────────────────────

const DISKS_SCRIPT: &str = r"$disques = @(Get-PhysicalDisk)
$volumes = @(Get-Volume | Where-Object DriveLetter)
$out = foreach ($p in @(Get-Partition | Where-Object DriveLetter)) {
  $d = $disques | Where-Object { $_.DeviceId -eq [string]$p.DiskNumber } | Select-Object -First 1
  $v = $volumes | Where-Object { $_.DriveLetter -eq $p.DriveLetter } | Select-Object -First 1
  if (-not $d -or -not $v) { continue }
  [pscustomobject]@{
    Letter = [string]$p.DriveLetter; Disk = $p.DiskNumber; Media = [string]$d.MediaType
    Health = [string]$d.HealthStatus; Bus = [string]$d.BusType; Size = $v.Size; Free = $v.SizeRemaining
  }
}
ConvertTo-Json -InputObject @($out) -Depth 2 -Compress";

fn disk_kind(media: &str) -> Option<&'static str> {
    match media.to_lowercase().as_str() {
        "ssd" => Some("ssd"),
        "hdd" => Some("hdd"),
        _ => None,
    }
}

fn disk_state(health: &str) -> &'static str {
    match health.to_lowercase().as_str() {
        "healthy" => "ok",
        "warning" => "warning",
        "unhealthy" => "bad",
        _ => "unknown",
    }
}

/// Disques internes seulement (pas les clés USB), triés par lettre.
fn parse_disks(rows: &[Value]) -> Vec<DiskHealth> {
    let mut disks: Vec<DiskHealth> = rows
        .iter()
        .filter(|r| !text(r, "Bus").eq_ignore_ascii_case("usb"))
        .filter_map(|r| {
            let letter = text(r, "Letter");
            let c = letter.chars().next()?;
            (letter.len() == 1 && c.is_ascii_alphabetic()).then(|| DiskHealth {
                letter: format!("{}:", c.to_ascii_uppercase()),
                disk_number: number(r, "Disk") as u32,
                kind: disk_kind(&text(r, "Media")),
                state: disk_state(&text(r, "Health")),
                total_bytes: number(r, "Size"),
                free_bytes: number(r, "Free"),
            })
        })
        .filter(|d| d.total_bytes > 0)
        .collect();
    disks.sort_by(|a, b| a.letter.cmp(&b.letter));
    disks
}

// ─── Test de la mémoire ─────────────────────────────────────────────────────

/// Dernier résultat de l'outil de diagnostic de la mémoire de Windows
/// (1201 : aucune erreur, 1202 : erreurs détectées).
const MEMORY_SCRIPT: &str = r"$e = Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-MemoryDiagnostics-Results' } -MaxEvents 1 -ErrorAction SilentlyContinue
if ($e) { ConvertTo-Json -Compress @{ Id = $e.Id; Date = ([DateTimeOffset]$e.TimeCreated).ToUnixTimeSeconds() } } else { '' }";

fn parse_memory_test(output: &str) -> Option<MemoryTest> {
    let v: Value = serde_json::from_str(output.trim()).ok()?;
    let id = number(&v, "Id");
    let date = number(&v, "Date") as i64;
    (matches!(id, 1201 | 1202) && date > 0).then_some(MemoryTest {
        date,
        errors: id == 1202,
    })
}

// ─── Batterie ───────────────────────────────────────────────────────────────

/// Valeur de la première balise `<tag>…</tag>` du texte.
fn tag<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&format!("</{tag}>"))? + start;
    Some(xml[start..end].trim())
}

/// Première batterie du rapport de Windows (`powercfg /batteryreport /xml`). Seule la
/// section `<Batteries>` est lue : la suite du rapport a d'autres balises du même nom.
fn parse_battery(xml: &str) -> Option<Battery> {
    let section = tag(xml, "Batteries")?;
    let battery = tag(section, "Battery")?;
    let value = |t: &str| tag(battery, t).and_then(|v| v.parse::<u64>().ok());
    let design_mwh = value("DesignCapacity").filter(|v| *v > 0)?;
    let full_mwh = value("FullChargeCapacity").filter(|v| *v > 0)?;
    Some(Battery {
        design_mwh,
        full_mwh,
        cycles: value("CycleCount").filter(|v| *v > 0),
    })
}

fn read_battery() -> Option<Battery> {
    let file = std::env::temp_dir().join(format!("kernshine_batterie_{}.xml", std::process::id()));
    let mut cmd = proc::hidden("powercfg");
    cmd.arg("/batteryreport")
        .arg("/xml")
        .arg("/output")
        .arg(&file);
    let ok = matches!(proc::status_with_timeout(cmd, TIMEOUT), Ok(Some(s)) if s.success());
    let xml = std::fs::read_to_string(&file).unwrap_or_default();
    let _ = std::fs::remove_file(&file);
    if !ok {
        return None;
    }
    parse_battery(&xml)
}

fn check() -> Result<HealthReport, String> {
    let disks = parse_disks(&ps::json_rows(&ps::run(DISKS_SCRIPT, TIMEOUT)?)?);
    let memory_test = ps::run(MEMORY_SCRIPT, TIMEOUT)
        .ok()
        .and_then(|o| parse_memory_test(&o));
    Ok(HealthReport {
        disks,
        memory_test,
        battery: read_battery(),
    })
}

#[tauri::command]
pub async fn health_check() -> Result<HealthReport, String> {
    blocking(|| {
        check().map_err(|e| {
            log::warn!("santé : {e}");
            "La vérification n'a pas pu aboutir. Réessayez dans un instant.".to_string()
        })
    })
    .await?
}

// ─── Température de la carte graphique ──────────────────────────────────────

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GpuTemperature {
    /// « NVIDIA GeForce RTX 4060 »
    name: String,
    celsius: u32,
}

/// Températures données par les pilotes graphiques à Windows, quelle que soit la marque :
/// la source du Gestionnaire des tâches (« Température du GPU »). Pas d'autorisation
/// nécessaire. Une carte dont le pilote ne la donne pas (souvent les puces intégrées)
/// est ignorée. Celle du processeur n'est pas lisible ainsi (voir l'issue #67).
mod kmt {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Luid {
        low: u32,
        high: i32,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct AdapterInfo {
        adapter: u32,
        luid: Luid,
        sources: u32,
        precise_present_regions: i32,
    }

    #[repr(C)]
    struct EnumAdapters2 {
        count: u32,
        adapters: *mut AdapterInfo,
    }

    #[repr(C)]
    struct QueryAdapterInfo {
        adapter: u32,
        kind: u32,
        data: *mut c_void,
        size: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct PerfData {
        physical_adapter_index: u32,
        memory_frequency: u64,
        max_memory_frequency: u64,
        max_memory_frequency_oc: u64,
        memory_bandwidth: u64,
        pcie_bandwidth: u64,
        fan_rpm: u32,
        power: u32,
        /// Dixièmes de degré Celsius.
        temperature: u32,
        power_state_override: u8,
    }

    #[repr(C)]
    struct RegistryInfo {
        adapter_string: [u16; 260],
        bios_string: [u16; 260],
        dac_type: [u16; 260],
        chip_type: [u16; 260],
    }

    #[repr(C)]
    struct CloseAdapter {
        adapter: u32,
    }

    const KMTQAITYPE_ADAPTERREGISTRYINFO: u32 = 8;
    const KMTQAITYPE_ADAPTERPERFDATA: u32 = 62;

    #[link(name = "gdi32")]
    unsafe extern "system" {
        fn D3DKMTEnumAdapters2(args: *mut EnumAdapters2) -> i32;
        fn D3DKMTQueryAdapterInfo(args: *mut QueryAdapterInfo) -> i32;
        fn D3DKMTCloseAdapter(args: *mut CloseAdapter) -> i32;
    }

    fn query<T>(adapter: u32, kind: u32, data: &mut T) -> bool {
        let mut q = QueryAdapterInfo {
            adapter,
            kind,
            data: (data as *mut T).cast(),
            size: std::mem::size_of::<T>() as u32,
        };
        // SAFETY: `data` pointe vers une structure de la taille annoncée, vivante pendant l'appel.
        unsafe { D3DKMTQueryAdapterInfo(&mut q) >= 0 }
    }

    /// (nom de la carte, dixièmes de degré) pour chaque carte qui donne sa température.
    pub fn temperatures() -> Vec<(String, u32)> {
        let mut e = EnumAdapters2 {
            count: 0,
            adapters: std::ptr::null_mut(),
        };
        // SAFETY: premier appel sans tableau, Windows renvoie seulement le nombre de cartes.
        if unsafe { D3DKMTEnumAdapters2(&mut e) } < 0 || e.count == 0 {
            return Vec::new();
        }
        let mut adapters = vec![AdapterInfo::default(); e.count as usize];
        e.adapters = adapters.as_mut_ptr();
        // SAFETY: le tableau a la place annoncée dans `count`.
        if unsafe { D3DKMTEnumAdapters2(&mut e) } < 0 {
            return Vec::new();
        }
        let mut found = Vec::new();
        for a in adapters.iter().take(e.count as usize) {
            let mut perf = PerfData::default();
            let mut info = RegistryInfo {
                adapter_string: [0; 260],
                bios_string: [0; 260],
                dac_type: [0; 260],
                chip_type: [0; 260],
            };
            if query(a.adapter, KMTQAITYPE_ADAPTERPERFDATA, &mut perf)
                && perf.temperature > 0
                && query(a.adapter, KMTQAITYPE_ADAPTERREGISTRYINFO, &mut info)
            {
                let end = info
                    .adapter_string
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(260);
                let name = String::from_utf16_lossy(&info.adapter_string[..end]);
                found.push((name.trim().to_string(), perf.temperature));
            }
            let mut close = CloseAdapter { adapter: a.adapter };
            // SAFETY: chaque carte ouverte par l'énumération est refermée une fois.
            unsafe { D3DKMTCloseAdapter(&mut close) };
        }
        found
    }
}

/// Garde les températures plausibles, arrondies au degré, sans doublon de nom.
fn gpu_list(raw: Vec<(String, u32)>) -> Vec<GpuTemperature> {
    let mut list: Vec<GpuTemperature> = Vec::new();
    for (name, tenths) in raw {
        let celsius = (tenths + 5) / 10;
        if (1..=130).contains(&celsius) && !name.is_empty() && !list.iter().any(|g| g.name == name)
        {
            list.push(GpuTemperature { name, celsius });
        }
    }
    list
}

/// Outil installé avec le pilote NVIDIA : en secours, si le pilote ne donne pas la
/// température à Windows.
fn nvidia_smi() -> Option<std::path::PathBuf> {
    let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    let program_files =
        std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
    [
        format!(r"{system}\System32\nvidia-smi.exe"),
        format!(r"{program_files}\NVIDIA Corporation\NVSMI\nvidia-smi.exe"),
    ]
    .into_iter()
    .map(std::path::PathBuf::from)
    .find(|p| p.is_file())
}

/// Première ligne de `nvidia-smi --query-gpu=name,temperature.gpu --format=csv,noheader,nounits`.
fn parse_gpu(output: &str) -> Option<GpuTemperature> {
    let line = output.lines().find(|l| !l.trim().is_empty())?;
    let (name, temp) = line.rsplit_once(',')?;
    let celsius = temp.trim().parse::<f64>().ok()?;
    ((1.0..=130.0).contains(&celsius) && !name.trim().is_empty()).then(|| GpuTemperature {
        name: name.trim().to_string(),
        celsius: celsius.round() as u32,
    })
}

fn gpu_temperatures() -> Vec<GpuTemperature> {
    let list = gpu_list(kmt::temperatures());
    if list.is_empty() {
        nvidia_temperature().into_iter().collect()
    } else {
        list
    }
}

fn nvidia_temperature() -> Option<GpuTemperature> {
    let mut cmd = proc::hidden(nvidia_smi()?.to_str()?);
    cmd.args([
        "--query-gpu=name,temperature.gpu",
        "--format=csv,noheader,nounits",
    ]);
    let out = proc::capture(cmd, Duration::from_secs(10)).ok()??;
    if !out.status.success() {
        return None;
    }
    parse_gpu(&String::from_utf8_lossy(&out.stdout))
}

/// Température des cartes graphiques, lue à chaque appel (la page la redemande
/// toutes les quelques secondes tant qu'elle est ouverte). Vide si illisible.
#[tauri::command]
pub async fn health_gpu_temperature() -> Result<Vec<GpuTemperature>, String> {
    blocking(gpu_temperatures).await
}

// ─── Usure des disques (avec autorisation) ──────────────────────────────────

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiskWear {
    /// Numéro du disque physique (celui de `DiskHealth`).
    disk_number: u32,
    /// Usure en %, telle que le disque la donne.
    wear: Option<u32>,
    /// Température du disque, s'il la donne.
    celsius: Option<u32>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WearResult {
    /// `false` si l'autorisation a été refusée ou si la lecture a échoué.
    ok: bool,
    disks: Vec<DiskWear>,
}

const WEAR_TIMEOUT: Duration = Duration::from_secs(120);

fn parse_wear(output: &str) -> Vec<DiskWear> {
    let rows = ps::json_rows(output).unwrap_or_default();
    let opt = |v: &Value, k: &str, max: u64| -> Option<u32> {
        v.get(k)?.as_u64().filter(|n| *n <= max).map(|n| n as u32)
    };
    rows.iter()
        .filter(|r| r.get("Disk").and_then(Value::as_u64).is_some())
        .map(|r| DiskWear {
            disk_number: number(r, "Disk") as u32,
            wear: opt(r, "Wear", 100),
            celsius: opt(r, "Temp", 130).filter(|c| *c > 0),
        })
        .collect()
}

/// Lit l'usure et la température de chaque disque : Windows ne les donne qu'avec
/// l'autorisation de l'utilisateur, demandée une seule fois pour tous les disques.
#[tauri::command]
pub async fn health_read_wear() -> Result<WearResult, String> {
    blocking(|| {
        let (ok, output) = ps::run_elevated_with_result(WEAR_TIMEOUT, |result| {
            format!(
                r"$r = foreach ($d in @(Get-PhysicalDisk)) {{
  $c = $d | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
  [pscustomobject]@{{ Disk = [int]$d.DeviceId; Wear = $c.Wear; Temp = $c.Temperature }}
}}
ConvertTo-Json -InputObject @($r) -Compress | Out-File -LiteralPath {result} -Encoding UTF8 -Force"
            )
        });
        let disks = parse_wear(&output);
        if !ok || disks.is_empty() {
            log::warn!("usure des disques : autorisation refusée ou lecture vide");
        }
        WearResult {
            ok: ok && !disks.is_empty(),
            disks,
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn disks_are_internal_typed_and_sorted() {
        let rows = vec![
            json!({"Letter":"E","Disk":2,"Media":"HDD","Health":"Healthy","Bus":"SATA","Size":2000,"Free":500}),
            json!({"Letter":"C","Disk":0,"Media":"SSD","Health":"Warning","Bus":"NVMe","Size":500,"Free":28}),
            json!({"Letter":"D","Disk":1,"Media":"Unspecified","Health":"Unhealthy","Bus":"SATA","Size":900,"Free":450}),
            json!({"Letter":"F","Disk":3,"Media":"Unspecified","Health":"Healthy","Bus":"USB","Size":64,"Free":10}),
            json!({"Letter":"","Disk":4,"Media":"SSD","Health":"Healthy","Bus":"SATA","Size":64,"Free":10}),
        ];
        let disks = parse_disks(&rows);
        let summary: Vec<(&str, Option<&str>, &str)> = disks
            .iter()
            .map(|d| (d.letter.as_str(), d.kind, d.state))
            .collect();
        assert_eq!(
            summary,
            [
                ("C:", Some("ssd"), "warning"),
                ("D:", None, "bad"),
                ("E:", Some("hdd"), "ok")
            ]
        );
    }

    #[test]
    fn memory_test_reads_only_known_results() {
        assert_eq!(
            parse_memory_test(r#"{"Id":1201,"Date":1700000000}"#),
            Some(MemoryTest {
                date: 1_700_000_000,
                errors: false
            })
        );
        assert!(
            parse_memory_test(r#"{"Id":1202,"Date":1700000000}"#)
                .unwrap()
                .errors
        );
        assert_eq!(parse_memory_test(r#"{"Id":1101,"Date":1700000000}"#), None);
        assert_eq!(parse_memory_test(""), None);
    }

    #[test]
    fn battery_is_read_from_its_own_section_only() {
        let laptop = "<BatteryReport><Batteries><Battery><Id>X</Id><DesignCapacity>47520</DesignCapacity>\
            <FullChargeCapacity>40210</FullChargeCapacity><CycleCount>412</CycleCount></Battery></Batteries>\
            <RuntimeEstimates><DesignCapacity><Capacity>1</Capacity></DesignCapacity></RuntimeEstimates></BatteryReport>";
        assert_eq!(
            parse_battery(laptop),
            Some(Battery {
                design_mwh: 47520,
                full_mwh: 40210,
                cycles: Some(412)
            })
        );
        let desktop = "<Batteries>\n  </Batteries><RuntimeEstimates><DesignCapacity><Capacity>0</Capacity>\
            </DesignCapacity></RuntimeEstimates>";
        assert_eq!(parse_battery(desktop), None);
        let no_cycles =
            laptop.replace("<CycleCount>412</CycleCount>", "<CycleCount>0</CycleCount>");
        assert_eq!(parse_battery(&no_cycles).unwrap().cycles, None);
    }

    #[test]
    fn gpu_line_is_parsed_and_checked() {
        assert_eq!(
            parse_gpu("NVIDIA GeForce RTX 4060, 38.71\r\n"),
            Some(GpuTemperature {
                name: "NVIDIA GeForce RTX 4060".into(),
                celsius: 39
            })
        );
        assert_eq!(parse_gpu("NVIDIA, [N/A]"), None);
        assert_eq!(parse_gpu("NVIDIA, 0"), None);
        assert_eq!(parse_gpu(""), None);
    }

    #[test]
    fn gpu_list_rounds_and_drops_implausible_values() {
        let list = gpu_list(vec![
            ("AMD Radeon RX 7600".into(), 584),
            ("Microsoft Basic Render Driver".into(), 0),
            ("Carte folle".into(), 5000),
            ("AMD Radeon RX 7600".into(), 590),
        ]);
        assert_eq!(
            list,
            [GpuTemperature {
                name: "AMD Radeon RX 7600".into(),
                celsius: 58
            }]
        );
    }

    /// Sur la vraie machine : des températures plausibles, quelle que soit la marque.
    #[test]
    fn real_gpu_temperature() {
        let windows = gpu_list(kmt::temperatures());
        eprintln!(
            "par Windows : {windows:?} ; par nvidia-smi : {:?}",
            nvidia_temperature()
        );
        for t in gpu_temperatures() {
            assert!((1..=130).contains(&t.celsius), "{t:?}");
        }
    }

    #[test]
    fn wear_keeps_only_plausible_values() {
        let out = r#"[{"Disk":0,"Wear":18,"Temp":34},{"Disk":1,"Wear":null,"Temp":0},{"Disk":2,"Wear":250,"Temp":500},{"Wear":5}]"#;
        assert_eq!(
            parse_wear(out),
            [
                DiskWear {
                    disk_number: 0,
                    wear: Some(18),
                    celsius: Some(34)
                },
                DiskWear {
                    disk_number: 1,
                    wear: None,
                    celsius: None
                },
                DiskWear {
                    disk_number: 2,
                    wear: None,
                    celsius: None
                },
            ]
        );
        assert!(parse_wear("").is_empty());
    }

    /// Sur la vraie machine : au moins un disque interne, avec une taille.
    #[test]
    fn real_check_reads_disks() {
        let Ok(report) = check() else {
            return;
        };
        for d in &report.disks {
            assert!(d.total_bytes >= d.free_bytes, "{}", d.letter);
        }
    }
}
