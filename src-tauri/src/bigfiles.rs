//! Gros fichiers : trouver ce qui prend le plus de place et le supprimer définitivement.
//!
//! La recherche évite les dossiers de Windows et des programmes, les données des
//! applications (AppData), les fichiers système et les fichiers OneDrive absents du PC.
//! Le front ne manipule que des identifiants : seuls les fichiers trouvés par la dernière
//! recherche peuvent être supprimés, et seulement s'ils n'ont pas changé depuis.

use crate::updates::blocking;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::SystemTime;
use sysinfo::Disks;
use tauri::ipc::Channel;

const MO: u64 = 1024 * 1024;
/// Tailles minimales proposées dans les Paramètres (en Mo).
pub const MIN_SIZES_MB: [u32; 4] = [100, 500, 1024, 5120];

const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
const FILE_ATTRIBUTE_OFFLINE: u32 = 0x1000;
const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x4_0000;
const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x40_0000;

/// Dossiers jamais parcourus, à la racine d'un disque.
const SKIPPED_AT_ROOT: &[&str] = &[
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "$recycle.bin",
    "system volume information",
    "recovery",
    "windows.old",
    "$windows.~bt",
    "$windows.~ws",
    "$winreagent",
    "$sysreset",
    "perflogs",
    "msocache",
    "config.msi",
    "boot",
];

/// Bibliothèques de jeux et d'applications, où qu'elles soient : leurs gros fichiers sont
/// les données des jeux installés (les supprimer les casserait).
const GAME_LIBRARIES: &[&str] = &[
    "steamapps",
    "steamlibrary",
    "epic games",
    "xboxgames",
    "windowsapps",
    "wpsystem",
    "gog games",
    "gog galaxy",
    "riot games",
    "ea games",
    "ea app",
    "origin games",
    "ubisoft",
    "ubisoft game launcher",
    "battle.net",
    "roberts space industries",
    "rockstar games",
];

/// Fichiers jamais proposés, où qu'ils soient.
const SKIPPED_FILES: &[&str] = &[
    "pagefile.sys",
    "hiberfil.sys",
    "swapfile.sys",
    "dumpstack.log",
];

/// Arrêt de la recherche (bouton « Annuler »).
static ARRET: AtomicBool = AtomicBool::new(false);

/// Ce que la dernière recherche a trouvé : identifiant → fichier, taille et date.
static TROUVES: Mutex<Option<HashMap<String, Found>>> = Mutex::new(None);

#[derive(Clone, Debug)]
struct Found {
    path: PathBuf,
    size: u64,
    modified: Option<SystemTime>,
}

const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;

/// Faut-il parcourir ce dossier ? `depth` 0 : racine du disque.
fn skip_dir(name: &str, parent: &Path, depth: usize) -> bool {
    let lower = name.to_lowercase();
    if depth == 0 && SKIPPED_AT_ROOT.contains(&lower.as_str()) {
        return true;
    }
    // Dépôts, caches et dépendances des projets (.git, .cache, node_modules) : y supprimer
    // un fichier casserait le projet, et ils contiennent des millions de petits fichiers.
    if lower.starts_with('.') || lower == "node_modules" || GAME_LIBRARIES.contains(&lower.as_str())
    {
        return true;
    }
    // Les données des applications (Users\<nom>\AppData) ne sont pas des fichiers de l'utilisateur.
    let in_profile = parent
        .parent()
        .and_then(|p| p.file_name())
        .is_some_and(|n| n.eq_ignore_ascii_case("users"));
    in_profile && lower == "appdata"
}

/// Dossiers jamais suivis : liens et jonctions (ils mènent ailleurs), dossiers cachés.
fn skip_dir_attributes(attributes: u32) -> bool {
    attributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_HIDDEN) != 0
}

fn is_skipped_file(name: &str, attributes: u32) -> bool {
    let cloud_or_system = FILE_ATTRIBUTE_SYSTEM
        | FILE_ATTRIBUTE_REPARSE_POINT
        | FILE_ATTRIBUTE_OFFLINE
        | FILE_ATTRIBUTE_RECALL_ON_OPEN
        | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;
    attributes & cloud_or_system != 0 || SKIPPED_FILES.contains(&name.to_lowercase().as_str())
}

/// Dossiers des programmes installés (« InstallLocation » de la liste des programmes de
/// Windows), en minuscules et sans barre finale. Les racines de disque sont écartées.
fn installed_locations() -> HashSet<String> {
    let script = r"$keys = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
Get-ItemProperty -Path $keys -ErrorAction SilentlyContinue | ForEach-Object { $_.InstallLocation } | Where-Object { $_ }";
    match crate::ps::run(script, std::time::Duration::from_secs(30)) {
        Ok(out) => out.lines().map(normalize).filter(|p| p.len() > 3).collect(),
        Err(e) => {
            log::warn!("[gros fichiers] programmes installés illisibles : {e}");
            HashSet::new()
        }
    }
}

fn normalize(path: &str) -> String {
    path.trim()
        .trim_matches('"')
        .trim_end_matches(['\\', '/'])
        .to_lowercase()
}

/// Lit un dossier : ses gros fichiers vont dans `found`, ses sous-dossiers à parcourir
/// sont renvoyés (sauf ceux des programmes installés). `depth` 0 : racine du disque.
fn read_level(
    dir: &Path,
    depth: usize,
    min: u64,
    installed: &HashSet<String>,
    found: &mut Vec<Found>,
) -> Vec<PathBuf> {
    let mut subdirs = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return subdirs;
    };
    for entry in entries.flatten() {
        // Sous Windows, ces informations viennent de la lecture du dossier : pas d'accès en plus.
        let Ok(meta) = entry.metadata() else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        if meta.is_dir() {
            let path = entry.path();
            if !skip_dir_attributes(meta.file_attributes())
                && !skip_dir(&name, dir, depth)
                && !installed.contains(&normalize(&path.to_string_lossy()))
            {
                subdirs.push(path);
            }
        } else if meta.len() >= min
            && !is_skipped_file(&name, meta.file_attributes())
            && kind(&entry.path()).is_some()
        {
            found.push(Found {
                path: entry.path(),
                size: meta.len(),
                modified: meta.modified().ok(),
            });
        }
    }
    subdirs
}

/// Parcourt tout un dossier (sous la racine du disque).
fn walk_tree(
    dir: PathBuf,
    min: u64,
    installed: &HashSet<String>,
    arret: &AtomicBool,
    found: &mut Vec<Found>,
) {
    let mut stack = vec![dir];
    while let Some(dir) = stack.pop() {
        if arret.load(Ordering::Relaxed) {
            return;
        }
        stack.extend(read_level(&dir, 1, min, installed, found));
    }
}

/// Parcourt un disque : les dossiers du premier niveau sont répartis entre plusieurs fils.
/// `on_folder` est appelé (sur ce fil) quand un dossier du premier niveau commence.
fn scan_root(
    root: &Path,
    min: u64,
    installed: &HashSet<String>,
    arret: &AtomicBool,
    on_folder: &dyn Fn(&str),
) -> Vec<Found> {
    let mut found = Vec::new();
    let queue = Mutex::new(read_level(root, 0, min, installed, &mut found));
    let results = Mutex::new(found);
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::scope(|s| {
        for _ in 0..workers {
            let tx = tx.clone();
            let (queue, results) = (&queue, &results);
            s.spawn(move || {
                loop {
                    let next = queue.lock().ok().and_then(|mut q| q.pop());
                    let Some(dir) = next else { break };
                    let name = dir
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    let _ = tx.send(name);
                    let mut local = Vec::new();
                    walk_tree(dir, min, installed, arret, &mut local);
                    if let Ok(mut r) = results.lock() {
                        r.extend(local);
                    }
                }
            });
        }
        drop(tx);
        for name in rx {
            on_folder(&name);
        }
    });
    results.into_inner().unwrap_or_default()
}

/// Disques internes avec une lettre (« C: »).
fn fixed_drives() -> Vec<String> {
    let mut letters: Vec<String> = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .filter(|d| !d.is_removable())
        .map(|d| {
            d.mount_point()
                .to_string_lossy()
                .trim_end_matches(['\\', '/'])
                .to_uppercase()
        })
        .filter(|l| l.len() == 2 && l.ends_with(':'))
        .collect();
    letters.sort();
    letters.dedup();
    letters
}

/// Noms des dossiers de l'utilisateur, en français.
fn folder_label(name: &str) -> String {
    match name.to_lowercase().as_str() {
        "videos" => "Vidéos".into(),
        "downloads" => "Téléchargements".into(),
        "pictures" => "Images".into(),
        "music" => "Musique".into(),
        "desktop" => "Bureau".into(),
        "documents" => "Documents".into(),
        _ => name.into(),
    }
}

/// Emplacement lisible : depuis le dossier de l'utilisateur (« Vidéos › Vacances »),
/// sinon depuis le disque (« D: › Jeux »). Trois niveaux au plus.
fn location(path: &Path, profile: Option<&Path>) -> Vec<String> {
    let parent = path.parent().unwrap_or(path);
    let rel: Vec<String> = match profile.and_then(|p| parent.strip_prefix(p).ok()) {
        Some(r) => r
            .iter()
            .map(|s| folder_label(&s.to_string_lossy()))
            .collect(),
        None => parent
            .iter()
            .map(|s| {
                s.to_string_lossy()
                    .trim_end_matches(['\\', '/'])
                    .to_string()
            })
            .filter(|s| !s.is_empty())
            .collect(),
    };
    if rel.len() > 3 {
        vec![rel[0].clone(), "…".into(), rel[rel.len() - 1].clone()]
    } else if rel.is_empty() {
        vec!["Dossier personnel".into()]
    } else {
        rel
    }
}

/// Genre d'un fichier personnel, ou `None` pour tout le reste.
///
/// Seuls les fichiers personnels sont proposés : données de jeux (.pak, .forge, .p4k…),
/// modèles, bases de données ou disques de machines virtuelles cassent un programme quand
/// on les supprime, et un jeu n'est pas toujours dans la liste des programmes de Windows.
fn kind(path: &Path) -> Option<&'static str> {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    Some(match ext.as_str() {
        "mp4" | "mkv" | "mov" | "avi" | "wmv" | "m4v" | "webm" | "mts" => "video",
        "zip" | "rar" | "7z" | "tar" | "gz" => "archive",
        "iso" => "image_disque",
        "exe" | "msi" => "installateur",
        "jpg" | "jpeg" | "png" | "heic" | "raw" | "cr2" | "nef" | "arw" | "psd" | "tif"
        | "tiff" => "image",
        "mp3" | "wav" | "flac" | "m4a" | "aac" => "audio",
        "pdf" => "document",
        _ => return None,
    })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BigFile {
    id: String,
    name: String,
    /// « C: »
    drive: String,
    location: Vec<String>,
    size_bytes: u64,
    /// Jours depuis la dernière modification (la date d'ouverture n'est pas fiable sous Windows).
    days_since_modified: Option<u64>,
    kind: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BigFileScan {
    ok: bool,
    files: Vec<BigFile>,
    drives: Vec<String>,
    stopped: bool,
}

/// Avancement de la recherche.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "etape")]
pub enum BigFileProgress {
    Disque {
        drive: String,
    },
    Dossier {
        drive: String,
        folder: String,
    },
    DisqueFini {
        drive: String,
        files: usize,
        bytes: u64,
    },
}

fn days_since(t: Option<SystemTime>) -> Option<u64> {
    t.and_then(|t| SystemTime::now().duration_since(t).ok())
        .map(|d| d.as_secs() / 86_400)
}

fn scan(min_mb: u32, emit: &dyn Fn(BigFileProgress)) -> BigFileScan {
    let min = u64::from(if MIN_SIZES_MB.contains(&min_mb) {
        min_mb
    } else {
        500
    }) * MO;
    let profile = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let drives = fixed_drives();
    let installed = installed_locations();
    let mut all: Vec<(String, Found)> = Vec::new();

    for drive in &drives {
        if ARRET.load(Ordering::Relaxed) {
            break;
        }
        emit(BigFileProgress::Disque {
            drive: drive.clone(),
        });
        let root = PathBuf::from(format!("{drive}\\"));
        let found = scan_root(&root, min, &installed, &ARRET, &|dir| {
            emit(BigFileProgress::Dossier {
                drive: drive.clone(),
                folder: folder_label(dir),
            })
        });
        emit(BigFileProgress::DisqueFini {
            drive: drive.clone(),
            files: found.len(),
            bytes: found.iter().map(|f| f.size).sum(),
        });
        all.extend(found.into_iter().map(|f| (drive.clone(), f)));
    }
    all.sort_by_key(|f| std::cmp::Reverse(f.1.size));

    let mut table = HashMap::new();
    let files = all
        .into_iter()
        .enumerate()
        .map(|(i, (drive, f))| {
            let id = format!("f{i}");
            let file = BigFile {
                id: id.clone(),
                name: f
                    .path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                drive,
                location: location(&f.path, profile.as_deref()),
                size_bytes: f.size,
                days_since_modified: days_since(f.modified),
                kind: kind(&f.path).unwrap_or("autre"),
            };
            table.insert(id, f);
            file
        })
        .collect();
    if let Ok(mut t) = TROUVES.lock() {
        *t = Some(table);
    }
    BigFileScan {
        ok: true,
        files,
        drives,
        stopped: ARRET.load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub async fn bigfiles_scan(
    min_mb: u32,
    on_progress: Channel<BigFileProgress>,
) -> Result<BigFileScan, String> {
    ARRET.store(false, Ordering::Relaxed);
    blocking(move || {
        scan(min_mb, &|p| {
            let _ = on_progress.send(p);
        })
    })
    .await
}

#[tauri::command(async)]
pub fn bigfiles_stop() {
    ARRET.store(true, Ordering::Relaxed);
}

// ─── Suppression ────────────────────────────────────────────────────────────

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    id: String,
    /// `ok`, `changed` (le fichier a changé depuis la recherche), `missing`, `in_use`, `denied`, `unknown`.
    status: &'static str,
    freed_bytes: u64,
}

/// Supprime le fichier s'il est toujours celui que la recherche a trouvé.
fn delete_one(id: &str, f: Option<&Found>) -> DeleteResult {
    let result = |status, freed_bytes| DeleteResult {
        id: id.into(),
        status,
        freed_bytes,
    };
    let Some(f) = f else {
        return result("unknown", 0);
    };
    let Ok(meta) = std::fs::symlink_metadata(&f.path) else {
        return result("missing", 0);
    };
    let same = meta.is_file()
        && meta.len() == f.size
        && meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
        && meta.modified().ok() == f.modified;
    if !same {
        return result("changed", 0);
    }
    match std::fs::remove_file(&f.path) {
        Ok(()) => result("ok", f.size),
        // 32 : fichier ouvert par un programme.
        Err(e) if e.raw_os_error() == Some(32) => result("in_use", 0),
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => result("denied", 0),
        Err(e) => {
            log::warn!("[gros fichiers] suppression impossible : {e}");
            result("denied", 0)
        }
    }
}

fn delete(ids: Vec<String>) -> Vec<DeleteResult> {
    let table = TROUVES
        .lock()
        .ok()
        .and_then(|t| t.clone())
        .unwrap_or_default();
    ids.iter().map(|id| delete_one(id, table.get(id))).collect()
}

/// Supprime définitivement ces fichiers (identifiants de la dernière recherche).
#[tauri::command]
pub async fn bigfiles_delete(ids: Vec<String>) -> Result<Vec<DeleteResult>, String> {
    blocking(move || delete(ids)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kernshine_gros_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn system_folders_and_appdata_are_skipped() {
        let root = Path::new("C:\\");
        assert!(skip_dir("Windows", root, 0));
        assert!(skip_dir("Program Files (x86)", root, 0));
        assert!(!skip_dir("Jeux", root, 0));
        // « Windows » plus bas n'est pas le dossier du système.
        assert!(!skip_dir(
            "Windows",
            Path::new("C:\\Users\\camille\\Documents"),
            3
        ));
        assert!(skip_dir("AppData", Path::new("C:\\Users\\camille"), 2));
        assert!(!skip_dir("AppData", Path::new("D:\\Sauvegardes"), 1));
        // Bibliothèques de jeux, dépôts et dépendances, où qu'ils soient.
        assert!(skip_dir("SteamLibrary", Path::new("E:\\"), 0));
        assert!(skip_dir("steamapps", Path::new("D:\\Steam"), 1));
        assert!(skip_dir(
            "Roberts Space Industries",
            Path::new("E:\\Jeux"),
            1
        ));
        assert!(skip_dir(".git", Path::new("E:\\Projet"), 1));
        assert!(skip_dir("node_modules", Path::new("E:\\Projet"), 1));
        assert!(skip_dir_attributes(FILE_ATTRIBUTE_HIDDEN));
    }

    #[test]
    fn installed_program_folders_are_compared_loosely() {
        assert_eq!(
            normalize("\"D:\\Jeux\\Assassin's Creed Origins\\\" "),
            "d:\\jeux\\assassin's creed origins"
        );
    }

    #[test]
    fn installed_program_folders_are_skipped() {
        let dir = test_dir("installes");
        std::fs::create_dir_all(dir.join("MonJeu")).unwrap();
        std::fs::write(dir.join("MonJeu").join("data.zip"), vec![0u8; 4096]).unwrap();
        let installed: HashSet<String> = [normalize(&dir.join("MonJeu").to_string_lossy())].into();
        let found = scan_root(&dir, 1024, &installed, &AtomicBool::new(false), &|_| {});
        assert!(found.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn system_and_cloud_files_are_skipped() {
        assert!(is_skipped_file("pagefile.sys", 0));
        assert!(is_skipped_file(
            "film.mp4",
            FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS
        ));
        assert!(is_skipped_file("x.bin", FILE_ATTRIBUTE_SYSTEM));
        assert!(!is_skipped_file("film.mp4", 0x20));
    }

    #[test]
    fn locations_are_readable() {
        let profile = Path::new("C:\\Users\\camille");
        assert_eq!(
            location(
                Path::new("C:\\Users\\camille\\Videos\\Vacances\\a.mp4"),
                Some(profile)
            ),
            vec!["Vidéos", "Vacances"]
        );
        assert_eq!(
            location(Path::new("D:\\Jeux\\a.iso"), Some(profile)),
            vec!["D:", "Jeux"]
        );
        assert_eq!(
            location(Path::new("D:\\a\\b\\c\\d\\e.zip"), None),
            vec!["D:", "…", "d"]
        );
        assert_eq!(kind(Path::new("Vacances.MP4")), Some("video"));
        assert_eq!(kind(Path::new("Windows10.iso")), Some("image_disque"));
        // Données de jeux et disques virtuels : jamais proposés.
        assert_eq!(kind(Path::new("Data.p4k")), None);
        assert_eq!(kind(Path::new("pakchunk10-WindowsClient.ucas")), None);
        assert_eq!(kind(Path::new("Ubuntu.vhdx")), None);
    }

    #[test]
    fn walk_finds_big_files_only() {
        let dir = test_dir("parcours");
        std::fs::create_dir_all(dir.join("Users").join("x").join("AppData")).unwrap();
        std::fs::write(dir.join("gros.zip"), vec![0u8; 2048]).unwrap();
        std::fs::write(dir.join("petit.zip"), vec![0u8; 10]).unwrap();
        // Gros, mais données d'un jeu : jamais proposé.
        std::fs::write(dir.join("jeu.pak"), vec![0u8; 4096]).unwrap();
        std::fs::write(
            dir.join("Users")
                .join("x")
                .join("AppData")
                .join("cache.zip"),
            vec![0u8; 4096],
        )
        .unwrap();
        // Un projet : ses dépendances et son dépôt ne sont pas parcourus.
        std::fs::create_dir_all(dir.join("Projet").join("node_modules")).unwrap();
        std::fs::create_dir_all(dir.join("Projet").join(".git")).unwrap();
        std::fs::write(
            dir.join("Projet").join("node_modules").join("lib.zip"),
            vec![0u8; 4096],
        )
        .unwrap();
        std::fs::write(
            dir.join("Projet").join(".git").join("pack.zip"),
            vec![0u8; 4096],
        )
        .unwrap();
        std::fs::write(dir.join("Projet").join("video.mp4"), vec![0u8; 4096]).unwrap();
        let dossiers = Mutex::new(Vec::new());
        let found = scan_root(&dir, 1024, &HashSet::new(), &AtomicBool::new(false), &|d| {
            dossiers.lock().unwrap().push(d.to_string())
        });
        let mut names: Vec<String> = found
            .iter()
            .map(|f| f.path.file_name().unwrap().to_string_lossy().into())
            .collect();
        names.sort();
        assert_eq!(names, vec!["gros.zip", "video.mp4"]);
        let mut dossiers = dossiers.into_inner().unwrap();
        dossiers.sort();
        assert_eq!(dossiers, vec!["Projet", "Users"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_unchanged_known_files_are_deleted() {
        let dir = test_dir("suppression");
        let path = dir.join("film.mp4");
        std::fs::write(&path, vec![0u8; 100]).unwrap();
        let meta = std::fs::metadata(&path).unwrap();
        let found = Found {
            path: path.clone(),
            size: meta.len(),
            modified: meta.modified().ok(),
        };
        assert_eq!(delete_one("x", None).status, "unknown");
        // Taille différente : le fichier a changé depuis la recherche.
        let changed = Found {
            size: 1,
            ..found.clone()
        };
        assert_eq!(delete_one("x", Some(&changed)).status, "changed");
        assert!(path.exists());
        let res = delete_one("x", Some(&found));
        assert_eq!((res.status, res.freed_bytes), ("ok", 100));
        assert!(!path.exists());
        assert_eq!(delete_one("x", Some(&found)).status, "missing");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod essai_reel {
    use super::*;

    /// Recherche sur la vraie machine (lente, dépend du PC) : `cargo test -- --ignored essai_reel`.
    #[test]
    #[ignore]
    fn real_scan_stays_out_of_system_folders() {
        let debut = std::time::Instant::now();
        let res = scan(1024, &|_| {});
        println!("{} fichiers en {:?}", res.files.len(), debut.elapsed());
        for f in res.files.iter().take(15) {
            println!(
                "{:>8} Mo  {} › {}",
                f.size_bytes / MO,
                f.location.join(" › "),
                f.name
            );
        }
        let table = TROUVES.lock().unwrap().clone().unwrap();
        for f in table.values() {
            let p = f.path.to_string_lossy().to_lowercase();
            assert!(
                !p.starts_with(r"c:\windows\")
                    && !p.contains(r"\program files")
                    && !p.contains(r"\appdata\"),
                "{p}"
            );
        }
    }
}
