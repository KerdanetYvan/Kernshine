//! Nettoyage : analyse et vidage d'une liste fermée de zones (dossiers temporaires,
//! caches, Corbeille, miniatures, ancienne version de Windows).
//!
//! Le front ne manipule que les identifiants des zones : les chemins ne quittent
//! jamais le Rust et rien d'autre ne peut être supprimé.

use crate::{proc, ps};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::ipc::Channel;

/// Délai pour que l'utilisateur accepte la demande d'autorisation et que le script finisse.
const ELEVATION_TIMEOUT: Duration = Duration::from_secs(120);
/// Supprimer l'ancienne version de Windows (des dizaines de milliers de fichiers) est long.
const ANCIEN_WINDOWS_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const CORBEILLE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Serialize, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
enum Groupe {
    Windows,
    Navigateurs,
    Applications,
    Autres,
}

/// « Sans risque » est coché d'office ; « À vérifier » attend que l'utilisateur coche.
#[derive(Clone, Copy, Serialize, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
enum Risque {
    SansRisque,
    AVerifier,
}

enum Contenu {
    /// Vider le dossier (le dossier lui-même reste).
    Dossier(PathBuf),
    /// Seulement les fichiers du dossier dont le nom commence par ce préfixe.
    Fichiers {
        dossier: PathBuf,
        prefixe: &'static str,
    },
    /// La Corbeille de l'utilisateur, sur tous les disques.
    Corbeille,
    /// Dossier supprimé en entier, en administrateur (ancienne version de Windows).
    AncienWindows(PathBuf),
}

struct Zone {
    id: &'static str,
    groupe: Groupe,
    libelle: &'static str,
    description: &'static str,
    risque: Risque,
    contenu: Contenu,
    /// Programme qui peut verrouiller la zone : (nom du processus, nom affiché).
    app: Option<(&'static str, &'static str)>,
}

fn env_path(var: &str, fallback: impl FnOnce() -> PathBuf) -> PathBuf {
    std::env::var_os(var)
        .map(PathBuf::from)
        .unwrap_or_else(fallback)
}

const CACHE_NAVIGATEUR: &str = "Pages et images gardées pour s'afficher plus vite";
const CACHE_APPLICATION: &str = "Fichiers gardés pour s'ouvrir plus vite";

/// Liste fermée des zones que Kernshine sait nettoyer.
fn zones() -> Vec<Zone> {
    use Contenu::{AncienWindows, Corbeille, Dossier, Fichiers};
    use Groupe::{Applications, Autres, Navigateurs, Windows};
    use Risque::{AVerifier, SansRisque};

    let home = env_path("USERPROFILE", || PathBuf::from("C:\\Users\\Default"));
    let sys_root = env_path("SystemRoot", || PathBuf::from("C:\\Windows"));
    let sys_drive = env_path("SystemDrive", || PathBuf::from("C:"));
    let local = env_path("LOCALAPPDATA", || home.join("AppData").join("Local"));
    let roaming = env_path("APPDATA", || home.join("AppData").join("Roaming"));
    let chromium_cache = |base: PathBuf| base.join("User Data").join("Default").join("Cache");

    let z = |id, groupe, libelle, description, risque, contenu, app| Zone {
        id,
        groupe,
        libelle,
        description,
        risque,
        contenu,
        app,
    };
    vec![
        // ── Windows ──
        z(
            "temp_utilisateur",
            Windows,
            "Fichiers temporaires",
            "Restes d'installations et de programmes",
            SansRisque,
            Dossier(std::env::temp_dir()),
            None,
        ),
        // L'ordre compte : les premières zones trouvées résument le groupe à l'écran
        // (« Fichiers temporaires, corbeille, anciens rapports d'erreurs et autres »).
        z(
            "corbeille",
            Windows,
            "Corbeille",
            "Fichiers que vous avez déjà supprimés",
            SansRisque,
            Corbeille,
            None,
        ),
        z(
            "rapports_erreurs",
            Windows,
            "Anciens rapports d'erreurs",
            "Messages envoyés à Microsoft après un plantage",
            SansRisque,
            Dossier(local.join("Microsoft").join("Windows").join("WER")),
            None,
        ),
        z(
            "temp_windows",
            Windows,
            "Fichiers temporaires de Windows",
            "Restes des mises à jour et des installations de Windows",
            SansRisque,
            Dossier(sys_root.join("Temp")),
            None,
        ),
        z(
            "traces_plantage",
            Windows,
            "Traces de plantage",
            "Fichiers laissés par Windows après un écran bleu",
            SansRisque,
            Dossier(sys_root.join("Minidump")),
            None,
        ),
        z(
            "journaux_windows",
            Windows,
            "Journaux de Windows",
            "Historique technique de Windows, inutile au quotidien",
            SansRisque,
            Dossier(sys_root.join("Logs")),
            None,
        ),
        z(
            "journaux_systeme",
            Windows,
            "Journaux des services",
            "Historique technique des programmes de Windows",
            SansRisque,
            Dossier(sys_root.join("System32").join("LogFiles")),
            None,
        ),
        z(
            "mises_a_jour",
            Windows,
            "Mises à jour déjà installées",
            "Fichiers téléchargés, inutiles une fois la mise à jour faite",
            SansRisque,
            Dossier(sys_root.join("SoftwareDistribution").join("Download")),
            None,
        ),
        // ── Navigateurs ──
        z(
            "cache_chrome",
            Navigateurs,
            "Google Chrome",
            CACHE_NAVIGATEUR,
            SansRisque,
            Dossier(chromium_cache(local.join("Google").join("Chrome"))),
            Some(("chrome.exe", "Google Chrome")),
        ),
        z(
            "cache_edge",
            Navigateurs,
            "Microsoft Edge",
            CACHE_NAVIGATEUR,
            SansRisque,
            Dossier(chromium_cache(local.join("Microsoft").join("Edge"))),
            Some(("msedge.exe", "Microsoft Edge")),
        ),
        z(
            "cache_firefox",
            Navigateurs,
            "Mozilla Firefox",
            CACHE_NAVIGATEUR,
            SansRisque,
            Dossier(local.join("Mozilla").join("Firefox").join("Profiles")),
            Some(("firefox.exe", "Mozilla Firefox")),
        ),
        z(
            "cache_internet_explorer",
            Navigateurs,
            "Internet Explorer",
            CACHE_NAVIGATEUR,
            SansRisque,
            Dossier(local.join("Microsoft").join("Windows").join("INetCache")),
            None,
        ),
        // ── Applications ──
        z(
            "cache_spotify",
            Applications,
            "Spotify",
            CACHE_APPLICATION,
            SansRisque,
            Dossier(roaming.join("Spotify").join("Browser").join("Cache")),
            Some(("Spotify.exe", "Spotify")),
        ),
        z(
            "cache_discord",
            Applications,
            "Discord",
            CACHE_APPLICATION,
            SansRisque,
            Dossier(local.join("Discord").join("Cache")),
            Some(("Discord.exe", "Discord")),
        ),
        z(
            "cache_teams",
            Applications,
            "Microsoft Teams",
            CACHE_APPLICATION,
            SansRisque,
            Dossier(local.join("Microsoft").join("Teams").join("Cache")),
            Some(("ms-teams.exe", "Microsoft Teams")),
        ),
        z(
            "cache_vscode",
            Applications,
            "Visual Studio Code",
            CACHE_APPLICATION,
            SansRisque,
            Dossier(roaming.join("Code").join("Cache")),
            Some(("Code.exe", "Visual Studio Code")),
        ),
        // ── Autres ──
        z(
            "miniatures",
            Autres,
            "Miniatures des images",
            "Aperçus que Windows recrée tout seul quand il en a besoin",
            SansRisque,
            Fichiers {
                dossier: local.join("Microsoft").join("Windows").join("Explorer"),
                prefixe: "thumbcache_",
            },
            None,
        ),
        z(
            "ancien_windows",
            Autres,
            "Ancienne version de Windows",
            "Vous ne pourrez plus revenir à la version précédente de Windows",
            AVerifier,
            AncienWindows(PathBuf::from(format!(
                "{}\\Windows.old",
                sys_drive.display()
            ))),
            None,
        ),
    ]
}

/// Un dossier « admin » est un dossier en lecture seule (même test qu'avant la migration).
fn is_read_only(path: &Path) -> bool {
    fs::metadata(path)
        .map(|m| m.permissions().readonly())
        .unwrap_or(true)
}

/// Taille et nombre de fichiers, sans suivre les liens symboliques.
fn dir_info(root: &Path) -> (u64, u64) {
    let (mut size, mut count) = (0u64, 0u64);
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                stack.push(entry.path());
            } else if ft.is_file()
                && let Ok(meta) = entry.metadata()
            {
                size += meta.len();
                count += 1;
            }
        }
    }
    (size, count)
}

fn starts_with_ci(name: &str, prefix: &str) -> bool {
    name.to_lowercase().starts_with(&prefix.to_lowercase())
}

/// Fichiers du dossier (sans les sous-dossiers) dont le nom commence par `prefixe`.
fn matching_files(dossier: &Path, prefixe: &str) -> Vec<(PathBuf, u64)> {
    let Ok(entries) = fs::read_dir(dossier) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter(|e| starts_with_ci(&e.file_name().to_string_lossy(), prefixe))
        .map(|e| {
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            (e.path(), size)
        })
        .collect()
}

/// Taille et nombre d'éléments de la Corbeille (tous disques).
fn recycle_bin_info() -> (u64, u64) {
    let script = "$s = (New-Object -ComObject Shell.Application).NameSpace(10); $n = 0; $t = 0\n\
                  if ($s) { foreach ($i in $s.Items()) { $n++; $t += [int64]$i.Size } }\n\
                  \"$n $t\"";
    let Ok(out) = ps::run(script, CORBEILLE_TIMEOUT) else {
        return (0, 0);
    };
    let mut parts = out
        .split_whitespace()
        .map(|p| p.parse::<u64>().unwrap_or(0));
    let count = parts.next().unwrap_or(0);
    let size = parts.next().unwrap_or(0);
    (size, count)
}

/// Taille et nombre de fichiers d'une zone ; `None` si elle n'existe pas sur ce PC.
fn measure(contenu: &Contenu) -> Option<(u64, u64)> {
    match contenu {
        Contenu::Dossier(p) | Contenu::AncienWindows(p) => p.is_dir().then(|| dir_info(p)),
        Contenu::Fichiers { dossier, prefixe } => {
            let files = matching_files(dossier, prefixe);
            Some((files.iter().map(|(_, s)| s).sum(), files.len() as u64))
        }
        Contenu::Corbeille => Some(recycle_bin_info()),
    }
}

fn running_processes() -> String {
    proc::hidden("tasklist")
        .args(["/NH", "/FO", "CSV"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase())
        .unwrap_or_default()
}

/// Avancement envoyé au front pendant l'analyse et le nettoyage.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "etape")]
pub enum Avancement {
    /// Kernshine commence cette zone (le nom sert à l'afficher pendant l'analyse).
    Debut {
        id: &'static str,
        libelle: &'static str,
        description: &'static str,
    },
    /// Zone terminée : octets trouvés (analyse) ou libérés (nettoyage).
    Fin { id: &'static str, octets: u64 },
    /// Windows va demander l'autorisation pour les zones restantes.
    Autorisation,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneInfo {
    id: &'static str,
    groupe: Groupe,
    libelle: &'static str,
    description: &'static str,
    risque: Risque,
    size_bytes: u64,
    file_count: u64,
    requires_admin: bool,
    locked_by_process: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    ok: bool,
    zones: Vec<ZoneInfo>,
    running_apps: Vec<String>,
}

fn scan(on_progress: &dyn Fn(Avancement)) -> ScanResult {
    let tasklist = running_processes();
    let mut zones_info = Vec::new();
    let mut running_apps: Vec<String> = Vec::new();

    for zone in zones() {
        on_progress(Avancement::Debut {
            id: zone.id,
            libelle: zone.libelle,
            description: zone.description,
        });
        let Some((size_bytes, file_count)) = measure(&zone.contenu) else {
            on_progress(Avancement::Fin {
                id: zone.id,
                octets: 0,
            });
            continue;
        };
        on_progress(Avancement::Fin {
            id: zone.id,
            octets: size_bytes,
        });
        let locked_by_process = zone
            .app
            .filter(|(process, _)| tasklist.contains(&process.to_lowercase()))
            .map(|(_, name)| name.to_string());
        if let Some(name) = &locked_by_process
            && !running_apps.contains(name)
        {
            running_apps.push(name.clone());
        }
        let requires_admin = match &zone.contenu {
            Contenu::Dossier(p) => is_read_only(p),
            Contenu::AncienWindows(_) => true,
            Contenu::Fichiers { .. } | Contenu::Corbeille => false,
        };
        zones_info.push(ZoneInfo {
            id: zone.id,
            groupe: zone.groupe,
            libelle: zone.libelle,
            description: zone.description,
            risque: zone.risque,
            size_bytes,
            file_count,
            requires_admin,
            locked_by_process,
        });
    }
    ScanResult {
        ok: true,
        zones: zones_info,
        running_apps,
    }
}

#[tauri::command]
pub async fn scan_get_zones(on_progress: Channel<Avancement>) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan(&|a| {
            let _ = on_progress.send(a);
        })
    })
    .await
    .map_err(|e| e.to_string())
}

// ─── Nettoyage ──────────────────────────────────────────────────────────────

/// Demande d'arrêt du nettoyage en cours (bouton « Arrêter »).
static ARRET: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct Deleted {
    freed_bytes: u64,
    deleted_count: u64,
    error_count: u64,
}

fn remove_entry(path: &Path, is_dir: bool, size: u64, out: &mut Deleted) {
    let res = if is_dir {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    match res {
        Ok(()) => {
            out.freed_bytes += size;
            out.deleted_count += 1;
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => out.error_count += 1,
    }
}

/// Supprime le contenu d'un dossier (pas le dossier lui-même) ; s'arrête si `arret` passe à vrai.
fn delete_contents(dir: &Path, arret: &AtomicBool) -> Deleted {
    let mut out = Deleted::default();
    let Ok(entries) = fs::read_dir(dir) else {
        out.error_count += 1;
        return out;
    };
    for entry in entries.flatten() {
        if arret.load(Ordering::Relaxed) {
            break;
        }
        let Ok(ft) = entry.file_type() else {
            out.error_count += 1;
            continue;
        };
        // La taille d'un sous-dossier n'est pas connue sans le parcourir.
        let size = if ft.is_dir() {
            dir_info(&entry.path()).0
        } else {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        };
        remove_entry(&entry.path(), ft.is_dir(), size, &mut out);
    }
    out
}

fn delete_files(files: Vec<(PathBuf, u64)>, arret: &AtomicBool) -> Deleted {
    let mut out = Deleted::default();
    for (path, size) in files {
        if arret.load(Ordering::Relaxed) {
            break;
        }
        remove_entry(&path, false, size, &mut out);
    }
    out
}

fn empty_recycle_bin() {
    if let Err(e) = ps::run(
        "Clear-RecycleBin -Force -ErrorAction SilentlyContinue",
        CORBEILLE_TIMEOUT,
    ) {
        log::warn!("Corbeille : {e}");
    }
}

/// Script administrateur pour une zone (une seule demande d'autorisation pour toutes).
fn elevated_script(contenu: &Contenu) -> String {
    match contenu {
        Contenu::Dossier(p) => format!(
            "Get-ChildItem -LiteralPath {} -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue\n",
            ps::quote(&p.to_string_lossy())
        ),
        // L'ancienne version de Windows appartient au système : on en donne la propriété
        // aux administrateurs (SID, indépendant de la langue) avant de la supprimer.
        Contenu::AncienWindows(p) => {
            let p = ps::quote(&p.to_string_lossy());
            format!(
                "icacls {p} /setowner '*S-1-5-32-544' /T /C /Q | Out-Null\n\
                 icacls {p} /grant '*S-1-5-32-544:F' /T /C /Q | Out-Null\n\
                 Remove-Item -LiteralPath {p} -Recurse -Force -ErrorAction SilentlyContinue\n"
            )
        }
        Contenu::Fichiers { .. } | Contenu::Corbeille => String::new(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneCleanResult {
    id: String,
    /// `ok`, `partial` (une partie seulement), `failed`, `skipped` (arrêt demandé) ou `refused` (zone inconnue).
    status: &'static str,
    freed_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    ok: bool,
    stopped: bool,
    freed_bytes: u64,
    zones: Vec<ZoneCleanResult>,
}

fn status_of(res: &Deleted) -> &'static str {
    match (res.deleted_count, res.error_count) {
        (_, 0) => "ok",
        (0, _) => "failed",
        _ => "partial",
    }
}

fn clean(
    requested: Vec<String>,
    arret: &AtomicBool,
    on_progress: &dyn Fn(Avancement),
) -> CleanResult {
    let known = zones();
    let mut results = Vec::new();
    let mut elevated: Vec<&Zone> = Vec::new();

    for id in requested {
        // Seules les zones connues de Kernshine peuvent être vidées.
        let Some(zone) = known.iter().find(|z| z.id == id) else {
            results.push(ZoneCleanResult {
                id,
                status: "refused",
                freed_bytes: 0,
            });
            continue;
        };
        if arret.load(Ordering::Relaxed) {
            results.push(ZoneCleanResult {
                id,
                status: "skipped",
                freed_bytes: 0,
            });
            continue;
        }
        on_progress(Avancement::Debut {
            id: zone.id,
            libelle: zone.libelle,
            description: zone.description,
        });
        let res = match &zone.contenu {
            Contenu::Dossier(p) if !p.is_dir() => Deleted::default(),
            Contenu::Dossier(p) if is_read_only(p) => {
                elevated.push(zone);
                continue;
            }
            Contenu::Dossier(p) => {
                let res = delete_contents(p, arret);
                if res.error_count > 0 && res.deleted_count == 0 {
                    // Rien n'a pu être supprimé : on retente avec les droits administrateur.
                    elevated.push(zone);
                    continue;
                }
                res
            }
            Contenu::Fichiers { dossier, prefixe } => {
                delete_files(matching_files(dossier, prefixe), arret)
            }
            Contenu::Corbeille => {
                let (before, count) = recycle_bin_info();
                empty_recycle_bin();
                let (after, left) = recycle_bin_info();
                Deleted {
                    freed_bytes: before.saturating_sub(after),
                    deleted_count: count.saturating_sub(left),
                    error_count: left,
                }
            }
            Contenu::AncienWindows(p) if !p.is_dir() => Deleted::default(),
            Contenu::AncienWindows(_) => {
                elevated.push(zone);
                continue;
            }
        };
        on_progress(Avancement::Fin {
            id: zone.id,
            octets: res.freed_bytes,
        });
        results.push(ZoneCleanResult {
            id: zone.id.into(),
            status: status_of(&res),
            freed_bytes: res.freed_bytes,
        });
    }

    if !elevated.is_empty() {
        if arret.load(Ordering::Relaxed) {
            for zone in elevated {
                results.push(ZoneCleanResult {
                    id: zone.id.into(),
                    status: "skipped",
                    freed_bytes: 0,
                });
            }
        } else {
            clean_elevated(&elevated, on_progress, &mut results);
        }
    }

    let freed_bytes = results.iter().map(|r| r.freed_bytes).sum();
    CleanResult {
        ok: results.iter().all(|r| matches!(r.status, "ok" | "skipped")),
        stopped: arret.load(Ordering::Relaxed),
        freed_bytes,
        zones: results,
    }
}

/// Vide les zones restantes avec une seule demande d'autorisation ; la place libérée
/// est mesurée avant et après.
fn clean_elevated(
    zones: &[&Zone],
    on_progress: &dyn Fn(Avancement),
    results: &mut Vec<ZoneCleanResult>,
) {
    on_progress(Avancement::Autorisation);
    let before: Vec<(u64, u64)> = zones
        .iter()
        .map(|z| measure(&z.contenu).unwrap_or((0, 0)))
        .collect();
    let script: String = zones.iter().map(|z| elevated_script(&z.contenu)).collect();
    let timeout = if zones
        .iter()
        .any(|z| matches!(z.contenu, Contenu::AncienWindows(_)))
    {
        ANCIEN_WINDOWS_TIMEOUT
    } else {
        ELEVATION_TIMEOUT
    };
    let accepted = ps::run_elevated(&script, timeout);
    if !accepted {
        log::warn!("nettoyage administrateur refusé ou interrompu");
    }
    for (zone, (size_before, count_before)) in zones.iter().zip(before) {
        let (size_after, count_after) = measure(&zone.contenu).unwrap_or((0, 0));
        let freed = size_before.saturating_sub(size_after);
        let status = if count_after == 0 {
            "ok"
        } else if count_after < count_before {
            "partial"
        } else {
            "failed"
        };
        on_progress(Avancement::Fin {
            id: zone.id,
            octets: freed,
        });
        results.push(ZoneCleanResult {
            id: zone.id.into(),
            status,
            freed_bytes: freed,
        });
    }
}

#[tauri::command]
pub async fn clean_zones(
    ids: Vec<String>,
    on_progress: Channel<Avancement>,
) -> Result<CleanResult, String> {
    ARRET.store(false, Ordering::Relaxed);
    tauri::async_runtime::spawn_blocking(move || {
        clean(ids, &ARRET, &|a| {
            let _ = on_progress.send(a);
        })
    })
    .await
    .map_err(|e| e.to_string())
}

/// Arrête le nettoyage entre deux fichiers. La partie administrateur, une fois
/// acceptée, va jusqu'au bout.
#[tauri::command(async)]
pub fn clean_stop() {
    ARRET.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("kernshine_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn zone_ids_are_unique_and_labels_simple() {
        let all = zones();
        let mut ids: Vec<_> = all.iter().map(|z| z.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), all.len(), "identifiants en double");
        // Aucun nom interne de Windows dans ce que voit l'utilisateur.
        for z in &all {
            for mot in [
                "WER",
                "Minidump",
                "System32",
                "SoftwareDistribution",
                "INetCache",
                "Windows.old",
                "thumbcache",
                "UAC",
            ] {
                assert!(
                    !z.libelle.contains(mot) && !z.description.contains(mot),
                    "{} : « {mot} »",
                    z.id
                );
            }
        }
    }

    #[test]
    fn only_risky_zones_wait_for_the_user() {
        let ancien = zones()
            .into_iter()
            .find(|z| z.id == "ancien_windows")
            .unwrap();
        assert_eq!(ancien.risque, Risque::AVerifier);
        assert_eq!(ancien.groupe, Groupe::Autres);
    }

    #[test]
    fn scan_finds_user_temp_and_reports_progress() {
        let events = std::cell::RefCell::new(0);
        let res = scan(&|_| *events.borrow_mut() += 1);
        assert!(res.zones.iter().any(|z| z.id == "temp_utilisateur"));
        // Un début et une fin par zone, qu'elle existe ou non sur ce PC.
        assert_eq!(*events.borrow(), zones().len() * 2);
    }

    #[test]
    fn clean_refuses_unknown_zones() {
        let arret = AtomicBool::new(false);
        let res = clean(
            vec!["C:\\Windows\\System32".into(), "system32".into()],
            &arret,
            &|_| {},
        );
        assert!(!res.ok);
        assert!(res.zones.iter().all(|z| z.status == "refused"));
    }

    #[test]
    fn clean_skips_everything_once_stopped() {
        let arret = AtomicBool::new(true);
        let res = clean(
            vec!["temp_utilisateur".into(), "corbeille".into()],
            &arret,
            &|_| {},
        );
        assert!(res.stopped);
        assert!(res.zones.iter().all(|z| z.status == "skipped"));
    }

    #[test]
    fn delete_contents_removes_files_and_folders() {
        let root = test_dir("contenu");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("a.txt"), b"12345").unwrap();
        fs::write(root.join("sub").join("b.txt"), b"1").unwrap();
        let res = delete_contents(&root, &AtomicBool::new(false));
        // Le sous-dossier compte pour un élément, sa taille est mesurée.
        assert_eq!(
            (res.deleted_count, res.error_count, res.freed_bytes),
            (2, 0, 6)
        );
        assert!(fs::read_dir(&root).unwrap().next().is_none());
        fs::remove_dir(&root).unwrap();
    }

    #[test]
    fn delete_contents_stops_when_asked() {
        let root = test_dir("arret");
        fs::write(root.join("a.txt"), b"1").unwrap();
        let res = delete_contents(&root, &AtomicBool::new(true));
        assert_eq!(res.deleted_count, 0);
        assert!(root.join("a.txt").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn only_files_with_the_prefix_are_deleted() {
        let root = test_dir("prefixe");
        fs::write(root.join("thumbcache_256.db"), b"123").unwrap();
        fs::write(root.join("THUMBCACHE_idx.db"), b"1").unwrap();
        fs::write(root.join("iconcache_16.db"), b"12").unwrap();
        let files = matching_files(&root, "thumbcache_");
        assert_eq!(files.len(), 2);
        let res = delete_files(files, &AtomicBool::new(false));
        assert_eq!((res.deleted_count, res.freed_bytes), (2, 4));
        assert!(root.join("iconcache_16.db").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn elevated_script_quotes_paths_and_uses_sids() {
        let script = elevated_script(&Contenu::AncienWindows(PathBuf::from("C:\\Windows.old")));
        assert!(script.contains("'C:\\Windows.old'"));
        assert!(script.contains("*S-1-5-32-544"));
        assert!(elevated_script(&Contenu::Corbeille).is_empty());
    }
}
