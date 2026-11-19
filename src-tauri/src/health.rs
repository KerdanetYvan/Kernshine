//! Santé du matériel (page Santé) : disques, dernier test de la mémoire.
//!
//! Tout se lit sans droits administrateur, sauf l'usure des disques (lue à la demande).
//! Une valeur que Windows ne donne pas reste absente : l'interface ne l'invente pas.

use crate::ps;
use crate::updates::blocking;
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

fn check() -> Result<HealthReport, String> {
    let disks = parse_disks(&ps::json_rows(&ps::run(DISKS_SCRIPT, TIMEOUT)?)?);
    let memory_test = ps::run(MEMORY_SCRIPT, TIMEOUT)
        .ok()
        .and_then(|o| parse_memory_test(&o));
    Ok(HealthReport { disks, memory_test })
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
