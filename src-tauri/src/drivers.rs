//! Pilotes : recherche et installation par Windows Update, un pilote à la fois, après un
//! point de restauration.
//!
//! L'installation demande une seule autorisation : le script administrateur écrit son
//! avancement dans un fichier que Kernshine lit au fil de l'eau, et s'arrête entre deux
//! pilotes si un fichier « stop » apparaît.

use crate::updates::{blocking, data_dir, hidden_change};
use crate::{hidden, ps};
use regex::Regex;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::ipc::Channel;

const SCAN_TIMEOUT: Duration = Duration::from_secs(120);
/// Par pilote : un gros pilote graphique se télécharge et s'installe lentement.
const INSTALL_TIMEOUT_PER_DRIVER: Duration = Duration::from_secs(15 * 60);
/// Laisse le temps d'accepter la demande d'autorisation et de créer le point de restauration.
const INSTALL_TIMEOUT_BASE: Duration = Duration::from_secs(5 * 60);
const SCAN_ERROR: &str = "La recherche des pilotes n'a pas abouti. Réessayez dans un instant.";

// ─── Recherche ──────────────────────────────────────────────────────────────

/// Un pilote proposé par Windows Update.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Driver {
    /// Identifiant Windows Update, seul envoyé pour l'installation.
    id: String,
    /// Clé pour « Ne plus proposer » : reste la même quand une nouvelle version arrive.
    key: String,
    /// Nom simple : « Carte graphique NVIDIA ».
    name: String,
    current_version: Option<String>,
    new_version: Option<String>,
    /// Date du nouveau pilote (AAAA-MM-JJ), quand la version n'est pas lisible.
    date: Option<String>,
    size_bytes: u64,
    /// Windows annonce un redémarrage après l'installation.
    needs_restart: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverScan {
    ok: bool,
    data: Vec<Driver>,
    /// Pilotes que l'utilisateur ne veut plus voir.
    hidden_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

const SCAN_SCRIPT: &str = r#"$ErrorActionPreference = 'SilentlyContinue'
try {
  $installed = @{}
  foreach ($d in (Get-CimInstance Win32_PnPSignedDriver)) {
    if ($d.HardWareID -and $d.DriverVersion) { $installed[$d.HardWareID.ToLower()] = $d.DriverVersion }
  }
  $session = New-Object -ComObject Microsoft.Update.Session
  $result  = $session.CreateUpdateSearcher().Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
  $list = @()
  foreach ($u in $result.Updates) {
    $hw = "$($u.DriverHardwareID)"
    $list += [PSCustomObject]@{
      id      = $u.Identity.UpdateID
      title   = $u.Title
      size    = [int64]$u.MaxDownloadSize
      reboot  = [int]$u.InstallationBehavior.RebootBehavior
      cls     = "$($u.DriverClass)"
      maker   = "$($u.DriverManufacturer)"
      model   = "$($u.DriverModel)"
      hw      = $hw
      date    = $(if ($u.DriverVerDate) { ([datetime]$u.DriverVerDate).ToString('yyyy-MM-dd') } else { '' })
      current = $(if ($hw) { $installed[$hw.ToLower()] } else { $null })
    }
  }
  if ($list.Count -eq 0) { '[]' } else { $list | ConvertTo-Json -Depth 2 }
} catch {
  'ERREUR'
}"#;

/// Fabricants connus, écrits comme les gens les connaissent.
const MAKERS: &[(&str, &str)] = &[
    ("nvidia", "NVIDIA"),
    ("advanced micro", "AMD"),
    ("amd", "AMD"),
    ("intel", "Intel"),
    ("realtek", "Realtek"),
    ("qualcomm", "Qualcomm"),
    ("mediatek", "MediaTek"),
    ("broadcom", "Broadcom"),
    ("synaptics", "Synaptics"),
    ("elan", "ELAN"),
    ("logitech", "Logitech"),
    ("microsoft", "Microsoft"),
    ("lenovo", "Lenovo"),
    ("dell", "Dell"),
    ("hp ", "HP"),
    ("hewlett", "HP"),
    ("asus", "ASUS"),
    ("acer", "Acer"),
    ("conexant", "Conexant"),
    ("killer", "Killer"),
];

fn short_maker(maker: &str) -> String {
    let lower = format!("{} ", maker.to_lowercase());
    if let Some((_, name)) = MAKERS.iter().find(|(word, _)| lower.contains(word)) {
        return (*name).into();
    }
    maker
        .split(|c: char| c.is_whitespace() || c == ',')
        .find(|w| !w.is_empty())
        .unwrap_or_default()
        .into()
}

/// Ce que fait le composant, d'après la classe du pilote (et son modèle quand la classe
/// est trop large, comme « Net » pour le Wi-Fi et l'Ethernet).
fn component(class: &str, model: &str) -> Option<&'static str> {
    let model = model.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| model.contains(w));
    Some(match class.to_lowercase().as_str() {
        "display" => "Carte graphique",
        "net" if has(&["wi-fi", "wifi", "wireless", "wlan", "802.11"]) => "Wi-Fi",
        "net" if has(&["bluetooth"]) => "Bluetooth",
        "net" => "Réseau",
        "bluetooth" => "Bluetooth",
        "media" | "audioendpoint" | "audioprocessingobject" => "Son",
        "hidclass" | "mouse"
            if has(&[
                "touchpad",
                "touch pad",
                "pavé",
                "synaptics",
                "elan",
                "precision",
            ]) =>
        {
            "Pavé tactile"
        }
        "hidclass" | "mouse" | "keyboard" => "Clavier et souris",
        "camera" | "image" => "Caméra",
        "printer" | "printqueue" => "Imprimante",
        "biometric" => "Lecteur d'empreintes",
        "sensor" => "Capteurs",
        "usb" | "usbdevice" => "Ports USB",
        "diskdrive" | "scsiadapter" | "hdc" => "Stockage",
        "firmware" => "Logiciel interne",
        "system" => "Composant du système",
        "extension" | "softwarecomponent" => "Complément de pilote",
        _ => return None,
    })
}

/// Nom affiché : « Carte graphique NVIDIA », sinon le modèle, sinon le titre de Windows Update.
fn friendly_name(class: &str, maker: &str, model: &str, title: &str) -> String {
    let maker = short_maker(maker);
    match component(class, model) {
        Some(c) if !maker.is_empty() => format!("{c} {maker}"),
        Some(c) => c.into(),
        None if !model.is_empty() => model.into(),
        None => title.into(),
    }
}

/// Version en fin de titre : « Intel - Display - 31.0.101.5186 » → « 31.0.101.5186 ».
fn version_from_title(title: &str) -> Option<String> {
    static VERSION: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(\d+(?:\.\d+){1,4})\s*$").expect("regex"));
    VERSION.captures(title.trim()).map(|c| c[1].to_string())
}

fn text(row: &serde_json::Value, key: &str) -> String {
    row.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn non_empty(s: String) -> Option<String> {
    (!s.is_empty()).then_some(s)
}

fn driver_from_row(row: &serde_json::Value) -> Driver {
    let title = text(row, "title");
    let hw = text(row, "hw").to_lowercase();
    Driver {
        id: text(row, "id"),
        key: format!(
            "{}{}",
            hidden::DRIVER_PREFIX,
            if hw.is_empty() {
                title.to_lowercase()
            } else {
                hw
            }
        ),
        name: friendly_name(
            &text(row, "cls"),
            &text(row, "maker"),
            &text(row, "model"),
            &title,
        ),
        current_version: non_empty(text(row, "current")),
        new_version: version_from_title(&title),
        date: non_empty(text(row, "date")),
        size_bytes: row.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
        // 1 : redémarrage toujours nécessaire (2 : « peut le demander », non annoncé).
        needs_restart: row.get("reboot").and_then(|v| v.as_i64()) == Some(1),
    }
}

fn scan(hidden_keys: &[String]) -> DriverScan {
    let failed = || DriverScan {
        ok: false,
        data: Vec::new(),
        hidden_count: 0,
        error: Some(SCAN_ERROR.into()),
    };
    let out = match ps::run(SCAN_SCRIPT, SCAN_TIMEOUT) {
        Ok(out) if out.trim() != "ERREUR" => out,
        Ok(_) => {
            log::warn!("[pilotes] Windows Update n'a pas répondu");
            return failed();
        }
        Err(e) => {
            log::warn!("[pilotes] recherche échouée : {e}");
            return failed();
        }
    };
    let rows = match ps::json_rows(&out) {
        Ok(rows) => rows,
        Err(e) => {
            log::warn!("[pilotes] réponse illisible : {e}");
            return failed();
        }
    };
    let (hidden, data): (Vec<Driver>, Vec<Driver>) = rows
        .iter()
        .map(driver_from_row)
        .filter(|d| !d.id.is_empty())
        .partition(|d| hidden::contains(hidden_keys, &d.key));
    DriverScan {
        ok: true,
        data,
        hidden_count: hidden.len(),
        error: None,
    }
}

#[tauri::command]
pub async fn drivers_get(app: AppHandle) -> Result<DriverScan, String> {
    let hidden_keys = data_dir(&app).map(|d| hidden::load(&d)).unwrap_or_default();
    blocking(move || scan(&hidden_keys)).await
}

/// Ne plus proposer ce pilote (sa clé, renvoyée par la recherche).
#[tauri::command]
pub async fn drivers_hide(app: AppHandle, key: String) -> Result<Vec<String>, String> {
    if !hidden::is_driver(&key) || key.len() > 512 || key.chars().any(char::is_control) {
        return Err("Clé de pilote invalide".into());
    }
    hidden_change(&app, move |dir| hidden::hide(dir, &key)).await
}

/// Proposer de nouveau tous les pilotes masqués.
#[tauri::command]
pub async fn drivers_unhide_all(app: AppHandle) -> Result<Vec<String>, String> {
    hidden_change(&app, |dir| hidden::unhide_all(dir, true)).await
}

// ─── Installation ───────────────────────────────────────────────────────────

/// Avancement de l'installation, lu dans le fichier tenu par le script administrateur.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "etape")]
pub enum DriverProgress {
    /// Création du point de restauration.
    Sauvegarde,
    SauvegardeFaite {
        ok: bool,
    },
    Debut {
        id: String,
    },
    Fin {
        id: String,
        ok: bool,
        restart: bool,
    },
    /// Arrêt demandé : ce pilote n'a pas été installé.
    Saute {
        id: String,
    },
    /// Le pilote n'est plus proposé par Windows Update.
    Absent {
        id: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverInstallResult {
    /// `done`, `restore_failed` (rien installé, l'interface demande), `refused`
    /// (autorisation refusée) ou `error`.
    status: &'static str,
    restore_point: bool,
    restart_needed: bool,
}

fn is_update_id(id: &str) -> bool {
    static GUID: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
            .expect("regex")
    });
    GUID.is_match(id)
}

/// Une ligne du fichier d'avancement. Codes de Windows Update : 2 réussi, 3 réussi avec
/// des erreurs, 4 échec, 5 annulé.
fn parse_line(line: &str) -> Option<DriverProgress> {
    let mut parts = line.trim().split(':');
    let tag = parts.next()?;
    let mut id = || parts.next().map(str::to_string);
    Some(match tag {
        "SAUVEGARDE" => DriverProgress::Sauvegarde,
        "SAUVEGARDE_OK" => DriverProgress::SauvegardeFaite { ok: true },
        "SAUVEGARDE_ECHEC" => DriverProgress::SauvegardeFaite { ok: false },
        "DEBUT" => DriverProgress::Debut { id: id()? },
        "SAUTE" => DriverProgress::Saute { id: id()? },
        "ABSENT" => DriverProgress::Absent { id: id()? },
        "FIN" => {
            let id = id()?;
            let code = parts
                .next()
                .and_then(|c| c.parse::<i32>().ok())
                .unwrap_or(4);
            let restart = parts.next().is_some_and(|r| r.eq_ignore_ascii_case("true"));
            DriverProgress::Fin {
                id,
                ok: code == 2 || code == 3,
                restart,
            }
        }
        _ => return None,
    })
}

fn stop_file() -> PathBuf {
    std::env::temp_dir().join(format!(
        "kernshine_pilotes_stop_{}.flag",
        std::process::id()
    ))
}

fn progress_file() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!(
        "kernshine_pilotes_{}_{nanos}.txt",
        std::process::id()
    ))
}

/// `restore` : créer d'abord un point de restauration (réglage des Paramètres) ;
/// `require_restore` : ne rien installer s'il échoue.
fn install_script(
    ids: &[String],
    restore: bool,
    require_restore: bool,
    log: &Path,
    stop: &Path,
) -> String {
    let list = ids
        .iter()
        .map(|i| ps::quote(i))
        .collect::<Vec<_>>()
        .join(",");
    let log = ps::quote(&log.to_string_lossy());
    let stop = ps::quote(&stop.to_string_lossy());
    let require = if require_restore { "$true" } else { "$false" };
    let sauvegarde = if restore {
        format!(
            r#"Note 'SAUVEGARDE'
$ok = $false
try {{ Checkpoint-Computer -Description 'Kernshine : avant les pilotes' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop; $ok = $true }} catch {{ }}
if ($ok) {{ Note 'SAUVEGARDE_OK' }} else {{ Note 'SAUVEGARDE_ECHEC'; if ({require}) {{ exit }} }}"#
        )
    } else {
        String::new()
    };
    format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$ids = @({list})
function Note([string]$s) {{ Add-Content -LiteralPath {log} -Value $s -Encoding UTF8 }}
{sauvegarde}
$session = New-Object -ComObject Microsoft.Update.Session
$found = $session.CreateUpdateSearcher().Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
foreach ($id in $ids) {{
  $u = $null
  foreach ($c in $found.Updates) {{ if ($c.Identity.UpdateID -eq $id) {{ $u = $c; break }} }}
  if (-not $u) {{ Note "ABSENT:$id"; continue }}
  if (Test-Path -LiteralPath {stop}) {{ Note "SAUTE:$id"; continue }}
  Note "DEBUT:$id"
  try {{
    $coll = New-Object -ComObject Microsoft.Update.UpdateColl
    [void]$coll.Add($u)
    $dl = $session.CreateUpdateDownloader(); $dl.Updates = $coll; [void]$dl.Download()
    $in = $session.CreateUpdateInstaller(); $in.Updates = $coll; $r = $in.Install()
    Note ("FIN:$id:" + [int]$r.ResultCode + ':' + $r.RebootRequired)
  }} catch {{ Note "FIN:$id:4:False" }}
}}"#
    )
}

fn read_lines(path: &Path) -> Vec<String> {
    std::fs::read(path)
        .map(|b| {
            String::from_utf8_lossy(&b)
                .trim_start_matches('\u{feff}')
                .lines()
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn install(
    ids: Vec<String>,
    restore: bool,
    require_restore: bool,
    emit: &dyn Fn(DriverProgress),
) -> DriverInstallResult {
    let ids: Vec<String> = ids.into_iter().filter(|i| is_update_id(i)).collect();
    if ids.is_empty() {
        return DriverInstallResult {
            status: "error",
            restore_point: false,
            restart_needed: false,
        };
    }
    let log = progress_file();
    let stop = stop_file();
    let _ = std::fs::remove_file(&stop);
    let script = install_script(&ids, restore, require_restore, &log, &stop);
    let timeout = INSTALL_TIMEOUT_BASE + INSTALL_TIMEOUT_PER_DRIVER * ids.len() as u32;

    // Le script tourne dans un autre fil ; celui-ci lit l'avancement au fil de l'eau.
    let worker = std::thread::spawn(move || ps::run_elevated(&script, timeout));
    let mut seen = 0;
    let mut events = Vec::new();
    let mut drain = |events: &mut Vec<DriverProgress>| {
        let lines = read_lines(&log);
        for line in lines.iter().skip(seen) {
            if let Some(p) = parse_line(line) {
                emit(p.clone());
                events.push(p);
            }
        }
        seen = lines.len().max(seen);
    };
    while !worker.is_finished() {
        std::thread::sleep(Duration::from_millis(400));
        drain(&mut events);
    }
    let accepted = worker.join().unwrap_or(false);
    drain(&mut events);
    let _ = std::fs::remove_file(&log);
    let _ = std::fs::remove_file(&stop);

    let restore_point = events.contains(&DriverProgress::SauvegardeFaite { ok: true });
    let restart_needed = events.iter().any(|e| {
        matches!(
            e,
            DriverProgress::Fin {
                ok: true,
                restart: true,
                ..
            }
        )
    });
    let status = if events.is_empty() {
        if accepted { "error" } else { "refused" }
    } else if require_restore && events.contains(&DriverProgress::SauvegardeFaite { ok: false }) {
        "restore_failed"
    } else {
        "done"
    };
    if status != "done" {
        log::warn!("[pilotes] installation : {status} (autorisation acceptée : {accepted})");
    }
    DriverInstallResult {
        status,
        restore_point,
        restart_needed,
    }
}

/// Installe ces pilotes (identifiants Windows Update), un à la fois. `restore` suit le
/// réglage des Paramètres. Sans point de restauration possible et avec `require_restore`,
/// rien n'est installé : l'interface demande à l'utilisateur s'il veut continuer quand même.
#[tauri::command]
pub async fn drivers_install(
    ids: Vec<String>,
    restore: bool,
    require_restore: bool,
    on_progress: Channel<DriverProgress>,
) -> Result<DriverInstallResult, String> {
    blocking(move || {
        install(ids, restore, require_restore, &|p| {
            let _ = on_progress.send(p);
        })
    })
    .await
}

/// Arrête l'installation après le pilote en cours.
#[tauri::command(async)]
pub fn drivers_stop() {
    if let Err(e) = std::fs::write(stop_file(), b"stop") {
        log::warn!("[pilotes] arrêt impossible : {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_simple() {
        assert_eq!(
            friendly_name("Display", "NVIDIA", "NVIDIA GeForce RTX 3060", "t"),
            "Carte graphique NVIDIA"
        );
        assert_eq!(
            friendly_name("Net", "Intel", "Intel(R) Wi-Fi 6 AX201 160MHz", "t"),
            "Wi-Fi Intel"
        );
        assert_eq!(
            friendly_name("MEDIA", "Realtek Semiconductor Corp.", "Realtek Audio", "t"),
            "Son Realtek"
        );
        assert_eq!(
            friendly_name("HIDClass", "Synaptics", "Synaptics Pointing Device", "t"),
            "Pavé tactile Synaptics"
        );
        assert_eq!(
            friendly_name("Display", "Advanced Micro Devices, Inc.", "AMD Radeon", "t"),
            "Carte graphique AMD"
        );
        // Classe inconnue : le modèle, sinon le titre.
        assert_eq!(
            friendly_name("Bizarre", "Acme", "Acme Gadget", "t"),
            "Acme Gadget"
        );
        assert_eq!(
            friendly_name("", "", "", "Titre Windows Update"),
            "Titre Windows Update"
        );
    }

    #[test]
    fn version_is_read_from_the_title() {
        assert_eq!(
            version_from_title("Intel - Display - 31.0.101.5186").as_deref(),
            Some("31.0.101.5186")
        );
        assert_eq!(
            version_from_title("Realtek Semiconductor Corp. - MEDIA - 6.0.9560.1 "),
            Some("6.0.9560.1".into())
        );
        assert_eq!(version_from_title("Pilote sans version"), None);
    }

    #[test]
    fn rows_become_drivers() {
        let row = serde_json::json!({
            "id": "3f1c2a4e-0000-4000-8000-000000000001", "title": "NVIDIA - Display - 32.0.15.6109",
            "size": 680_000_000u64, "reboot": 1, "cls": "Display", "maker": "NVIDIA",
            "model": "NVIDIA GeForce RTX 3060", "hw": "PCI\\VEN_10DE&DEV_2503", "date": "2024-10-11",
            "current": "31.0.15.5123"
        });
        let d = driver_from_row(&row);
        assert_eq!(d.name, "Carte graphique NVIDIA");
        assert_eq!(d.key, "pilote:pci\\ven_10de&dev_2503");
        assert_eq!(
            (d.current_version.as_deref(), d.new_version.as_deref()),
            (Some("31.0.15.5123"), Some("32.0.15.6109"))
        );
        assert!(d.needs_restart);
    }

    #[test]
    fn progress_lines_are_understood() {
        let id = "3f1c2a4e-0000-4000-8000-000000000001";
        assert_eq!(
            parse_line("SAUVEGARDE_ECHEC"),
            Some(DriverProgress::SauvegardeFaite { ok: false })
        );
        assert_eq!(
            parse_line(&format!("FIN:{id}:2:True")),
            Some(DriverProgress::Fin {
                id: id.into(),
                ok: true,
                restart: true
            })
        );
        assert_eq!(
            parse_line(&format!("FIN:{id}:4:False")),
            Some(DriverProgress::Fin {
                id: id.into(),
                ok: false,
                restart: false
            })
        );
        assert_eq!(
            parse_line(&format!("SAUTE:{id}")),
            Some(DriverProgress::Saute { id: id.into() })
        );
        assert_eq!(parse_line("bruit"), None);
    }

    #[test]
    fn only_update_ids_reach_the_script() {
        assert!(is_update_id("3f1c2a4e-0000-4000-8000-000000000001"));
        assert!(!is_update_id("'; Remove-Item C:\\ -Recurse #"));
        // Rien d'invalide : rien n'est lancé.
        let res = install(vec!["pas-un-id".into()], true, true, &|_| {});
        assert_eq!(res.status, "error");
    }

    #[test]
    fn script_quotes_its_values_and_can_stop_on_restore_failure() {
        let id = ["3f1c2a4e-0000-4000-8000-000000000001".to_string()];
        let (log, stop) = (Path::new("C:\\t\\a.txt"), Path::new("C:\\t\\s.flag"));
        let script = install_script(&id, true, true, log, stop);
        assert!(script.contains("@('3f1c2a4e-0000-4000-8000-000000000001')"));
        assert!(script.contains("if ($true) { exit }"));
        assert!(script.contains("Checkpoint-Computer"));
        // Réglage coupé dans les Paramètres : pas de point de restauration du tout.
        assert!(!install_script(&id, false, true, log, stop).contains("Checkpoint-Computer"));
    }

    #[test]
    fn scan_answers_without_crashing() {
        // Résultat dépendant de la machine (Windows Update peut ne rien proposer ou ne pas
        // répondre) : on vérifie seulement que la réponse est cohérente.
        let res = scan(&[]);
        println!("{}", serde_json::to_string_pretty(&res).unwrap());
        assert!(res.ok || res.error.is_some());
    }
}
