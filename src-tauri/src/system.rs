//! Informations système et historique CPU/RAM pour le tableau de bord.

use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(3);
const HISTORY_LEN: usize = 20;
const GIB: f64 = 1024.0 * 1024.0 * 1024.0;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatPoint {
    timestamp: u64,
    cpu_percent: u32,
    #[serde(rename = "freeMemoryGB")]
    free_memory_gb: f64,
}

#[derive(Serialize)]
pub struct Cpu {
    model: String,
    speed: u64,
}

#[derive(Serialize)]
pub struct UserInfo {
    username: String,
    uid: i32,
    gid: i32,
    shell: Option<String>,
    homedir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    os_type: String,
    platform: String,
    release: String,
    arch: String,
    hostname: String,
    cpus: Vec<Cpu>,
    cpu_usage_percent: u32,
    #[serde(rename = "memoryGB")]
    memory_gb: u64,
    #[serde(rename = "freeMemoryGB")]
    free_memory_gb: f64,
    uptime_hours: u64,
    user_info: UserInfo,
    stats_history: Vec<StatPoint>,
}

/// Historique alimenté par un échantillonneur en arrière-plan.
#[derive(Default)]
pub struct StatsState {
    history: Mutex<Vec<StatPoint>>,
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

fn refresh_kind() -> RefreshKind {
    RefreshKind::nothing()
        .with_cpu(CpuRefreshKind::nothing().with_cpu_usage().with_frequency())
        .with_memory(MemoryRefreshKind::nothing().with_ram())
}

/// Démarre le thread qui mesure CPU et RAM toutes les 3 secondes.
pub fn start_sampler(state: Arc<StatsState>) {
    std::thread::spawn(move || {
        let mut sys = System::new_with_specifics(refresh_kind());
        // La première mesure de charge CPU n'a pas de référence : on l'ignore.
        std::thread::sleep(SAMPLE_INTERVAL);
        loop {
            sys.refresh_specifics(refresh_kind());
            let point = StatPoint {
                timestamp: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
                cpu_percent: sys.global_cpu_usage().round().clamp(0.0, 100.0) as u32,
                free_memory_gb: round1(sys.available_memory() as f64 / GIB),
            };
            if let Ok(mut h) = state.history.lock() {
                h.push(point);
                if h.len() > HISTORY_LEN {
                    h.remove(0);
                }
            }
            std::thread::sleep(SAMPLE_INTERVAL);
        }
    });
}

fn arch_name() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        other => other,
    }
}

pub fn build_info(history: Vec<StatPoint>) -> SystemInfo {
    let sys = System::new_with_specifics(refresh_kind());
    let latest = history.last().cloned();
    let release = System::kernel_version()
        .map(|build| format!("10.0.{build}"))
        .unwrap_or_else(|| "10.0".into());

    SystemInfo {
        os_type: "Windows_NT".into(),
        platform: "win32".into(),
        release,
        arch: arch_name().into(),
        hostname: System::host_name().unwrap_or_default(),
        cpus: sys
            .cpus()
            .iter()
            .map(|c| Cpu {
                model: c.brand().trim().to_string(),
                speed: c.frequency(),
            })
            .collect(),
        cpu_usage_percent: latest.as_ref().map_or(0, |p| p.cpu_percent),
        memory_gb: (sys.total_memory() as f64 / GIB).round() as u64,
        free_memory_gb: latest.as_ref().map_or_else(
            || round1(sys.available_memory() as f64 / GIB),
            |p| p.free_memory_gb,
        ),
        uptime_hours: (System::uptime() as f64 / 3600.0).round() as u64,
        user_info: UserInfo {
            username: std::env::var("USERNAME").unwrap_or_default(),
            uid: -1,
            gid: -1,
            shell: None,
            homedir: std::env::var("USERPROFILE").unwrap_or_default(),
        },
        stats_history: history,
    }
}

#[tauri::command(async)]
pub fn system_get_info(state: tauri::State<'_, Arc<StatsState>>) -> SystemInfo {
    let history = state.history.lock().map(|h| h.clone()).unwrap_or_default();
    build_info(history)
}

/// Un disque du PC et sa place libre (pour « Disque C: de 28 Go à 58 Go libres »).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpace {
    /// Lettre suivie de deux-points : « C: ».
    letter: String,
    total_bytes: u64,
    free_bytes: u64,
}

/// Disques internes avec une lettre, dans l'ordre alphabétique (clés USB exclues).
fn disks() -> Vec<DiskSpace> {
    let mut out: Vec<DiskSpace> = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .filter(|d| !d.is_removable() && d.total_space() > 0)
        .filter_map(|d| {
            let mount = d.mount_point().to_string_lossy().into_owned();
            let letter = mount.trim_end_matches(['\\', '/']).to_uppercase();
            (letter.len() == 2 && letter.ends_with(':')).then(|| DiskSpace {
                letter,
                total_bytes: d.total_space(),
                free_bytes: d.available_space(),
            })
        })
        .collect();
    out.sort_by(|a, b| a.letter.cmp(&b.letter));
    out.dedup_by(|a, b| a.letter == b.letter);
    out
}

#[tauri::command(async)]
pub fn system_get_disks() -> Vec<DiskSpace> {
    disks()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_disk_is_listed() {
        let list = disks();
        let system = std::env::var("SystemDrive")
            .unwrap_or_else(|_| "C:".into())
            .to_uppercase();
        let disk = list
            .iter()
            .find(|d| d.letter == system)
            .expect("disque système");
        assert!(disk.free_bytes <= disk.total_bytes);
    }

    #[test]
    fn info_is_filled_in() {
        let info = build_info(vec![]);
        println!("{}", serde_json::to_string_pretty(&info).unwrap());
        assert!(info.memory_gb > 0);
        assert!(!info.cpus.is_empty());
        assert!(info.release.starts_with("10.0."));
        assert!(!info.hostname.is_empty());
    }
}
