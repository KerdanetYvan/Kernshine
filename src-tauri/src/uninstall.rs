//! Désinstallation des programmes (onglet Désinstallation de la page Applications).
//!
//! La liste vient des trois listes de programmes installés de Windows (registre
//! « Uninstall »). Chaque programme est retiré avec son propre outil de désinstallation,
//! lancé normalement : sa fenêtre s'ouvre et l'utilisateur la suit. Le front n'envoie que
//! des identifiants : la commande lancée est relue dans le registre au moment de la
//! désinstallation, jamais transmise par l'interface.
//!
//! Ne sont pas proposés : les composants dont dépendent Windows et les autres programmes
//! (bibliothèques Microsoft, pilotes…), les mises à jour, Kernshine lui-même et les
//! programmes dont l'outil de désinstallation n'est pas un programme Windows ordinaire.

use crate::ps;
use crate::updates::blocking;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::ipc::Channel;

/// Les trois listes de programmes installés (même ordre que dans le script).
const ROOTS: [&str; 3] = [
    r"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    r"HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    r"HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
];

const READ_TIMEOUT: Duration = Duration::from_secs(60);
/// Un outil de désinstallation attend souvent que l'utilisateur clique : on lui laisse le temps.
const UNINSTALL_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// Composants dont dépendent Windows ou d'autres programmes : les retirer casserait des
/// jeux, le son, la carte graphique… (comparaison en minuscules, sur le nom).
const COMPONENT_WORDS: &[&str] = &[
    "redistributable",
    "vcredist",
    "runtime",
    ".net framework",
    "directx",
    "webview2",
    "xna framework",
    "driver",
    "pilote",
    "chipset",
    "sdk",
    "software development kit",
    "shared components",
    "physx",
    "openal",
    "gameinput",
    "online services",
    // Parties de Windows elles-mêmes
    "microsoft edge",
    "update health tools",
    "xbox service",
    "compatibility fix database",
    "(kb",
];

/// Arrêt demandé : la désinstallation en cours va au bout, les suivantes ne sont pas lancées.
static ARRET: AtomicBool = AtomicBool::new(false);

/// Programmes de la dernière liste : identifiant → (liste, nom de la clé).
static LISTE: Mutex<Option<HashMap<String, (usize, String)>>> = Mutex::new(None);

/// Tailles à mesurer après l'affichage de la liste : (identifiant, dossier d'installation),
/// et tous les dossiers d'installation connus (jamais comptés dans un autre programme).
static A_MESURER: Mutex<Option<Mesures>> = Mutex::new(None);
type Mesures = (Vec<(String, PathBuf)>, HashSet<PathBuf>);

/// Une entrée brute de la liste des programmes installés.
#[derive(Clone, Debug, Default)]
struct Entry {
    root: usize,
    key: String,
    name: String,
    publisher: String,
    install_date: String,
    size_kb: u64,
    location: String,
    command: String,
    system: bool,
    parent: bool,
    update: bool,
    no_remove: bool,
}

impl Entry {
    fn id(&self) -> String {
        format!("{}:{}", self.root, self.key)
    }
}

/// Outil de désinstallation à lancer : un programme (chemin complet) et ses arguments.
#[derive(Debug, PartialEq)]
struct Launch {
    exe: String,
    args: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    id: String,
    name: String,
    publisher: Option<String>,
    /// « 2024-03 » (mois d'installation), si Windows le connaît.
    installed: Option<String>,
    /// Taille annoncée par le programme, si elle est connue.
    size_bytes: Option<u64>,
    /// « C: » : disque où le programme est installé, s'il est connu.
    drive: Option<String>,
    /// Taille inconnue de Windows : Kernshine mesure le dossier du programme (`uninstall_sizes`).
    measuring: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProgramList {
    programs: Vec<Program>,
    /// Composants nécessaires à Windows ou aux programmes, non proposés.
    components: usize,
}

// ─── Lecture de la liste ────────────────────────────────────────────────────

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

fn read_entries() -> Result<Vec<Entry>, String> {
    let roots = ROOTS.map(ps::quote).join(",");
    let script = format!(
        r"$roots = @({roots})
$out = for ($i = 0; $i -lt $roots.Count; $i++) {{
  Get-ItemProperty -Path ($roots[$i] + '\*') -ErrorAction SilentlyContinue | ForEach-Object {{
    [pscustomobject]@{{
      Root = $i; Key = $_.PSChildName; Name = $_.DisplayName; Publisher = $_.Publisher
      Date = [string]$_.InstallDate; SizeKb = $_.EstimatedSize; Location = $_.InstallLocation
      Command = $_.UninstallString; System = $_.SystemComponent; Parent = $_.ParentKeyName
      Release = $_.ReleaseType; NoRemove = $_.NoRemove
    }}
  }}
}}
ConvertTo-Json -InputObject @($out) -Depth 2 -Compress"
    );
    let rows = ps::json_rows(&ps::run(&script, READ_TIMEOUT)?)?;
    Ok(rows
        .iter()
        .map(|r| {
            let release = text(r, "Release").to_lowercase();
            Entry {
                root: number(r, "Root") as usize,
                key: text(r, "Key"),
                name: text(r, "Name"),
                publisher: text(r, "Publisher"),
                install_date: text(r, "Date"),
                size_kb: number(r, "SizeKb"),
                location: text(r, "Location"),
                command: text(r, "Command"),
                system: number(r, "System") == 1,
                parent: !text(r, "Parent").is_empty(),
                update: release.contains("update") || release.contains("hotfix"),
                no_remove: number(r, "NoRemove") == 1,
            }
        })
        .collect())
}

fn is_component(name: &str) -> bool {
    let lower = name.to_lowercase();
    COMPONENT_WORDS.iter().any(|w| lower.contains(w))
}

/// Ce que l'utilisateur ne doit jamais voir : entrées cachées par Windows, mises à jour,
/// entrées sans nom ou sans outil de désinstallation, Kernshine lui-même.
fn is_listed(e: &Entry) -> bool {
    !e.name.is_empty()
        && !e.system
        && !e.parent
        && !e.update
        && !e.no_remove
        && !e.command.is_empty()
        && e.root < ROOTS.len()
        && !e.key.is_empty()
        && !e.key.contains('\\')
        && !e.name.eq_ignore_ascii_case("kernshine")
}

/// Remplace `%NOM%` par la variable d'environnement correspondante (si elle existe).
fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => match std::env::var(&after[..end]) {
                Ok(value) if end > 0 => {
                    out.push_str(&value);
                    rest = &after[end + 1..];
                }
                _ => {
                    out.push('%');
                    rest = after;
                }
            },
            None => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`
fn is_guid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 38
        && b[0] == b'{'
        && b[37] == b'}'
        && s[1..37].char_indices().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}

/// Un chemin complet vers un programme : `C:\…\nom.exe`.
fn is_absolute_exe(path: &str) -> bool {
    let b = path.as_bytes();
    b.len() > 7
        && b[0].is_ascii_alphabetic()
        && b[1] == b':'
        && b[2] == b'\\'
        && path.to_lowercase().ends_with(".exe")
        && !path.contains('"')
}

/// Lit l'outil de désinstallation d'une entrée. Seuls deux cas sont acceptés :
/// le programme d'installation de Windows (`MsiExec.exe /X{GUID}`), lancé en mode
/// « retirer », et un programme désigné par son chemin complet. Le reste (scripts,
/// gestionnaires de paquets, adresses) n'est pas proposé.
fn parse_command(command: &str) -> Option<Launch> {
    let command = expand_env(command.trim());
    if command.contains(['\r', '\n', '\0']) {
        return None;
    }
    let lower = command.to_lowercase();
    if lower.starts_with("msiexec") {
        let start = command.find('{')?;
        let guid = command.get(start..start + 38)?;
        if !is_guid(guid) {
            return None;
        }
        let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
        return Some(Launch {
            exe: format!(r"{system}\System32\msiexec.exe"),
            args: format!("/x {guid}"),
        });
    }
    let (exe, args) = if let Some(rest) = command.strip_prefix('"') {
        let end = rest.find('"')?;
        (rest[..end].to_string(), rest[end + 1..].trim().to_string())
    } else {
        // Chemin sans guillemets : jusqu'au premier « .exe » suivi d'un espace ou de la fin.
        let mut cut = None;
        for (i, _) in lower.match_indices(".exe") {
            let end = i + 4;
            if end == lower.len() || lower.as_bytes()[end] == b' ' {
                cut = Some(end);
                break;
            }
        }
        let end = cut?;
        (
            command[..end].to_string(),
            command[end..].trim().to_string(),
        )
    };
    is_absolute_exe(&exe).then_some(Launch { exe, args })
}

/// « 20240319 » → « 2024-03 ». Les autres formats (« 3/19/2024 », jour et mois
/// impossibles à distinguer) sont ignorés.
fn install_month(date: &str) -> Option<String> {
    let d = date.trim();
    if d.len() != 8 || !d.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let year: u32 = d[..4].parse().ok()?;
    let month: u32 = d[4..6].parse().ok()?;
    ((1990..=2100).contains(&year) && (1..=12).contains(&month))
        .then(|| format!("{year:04}-{month:02}"))
}

/// Disque du programme : son dossier d'installation, sinon celui de son outil de désinstallation.
fn drive_of(e: &Entry, launch: &Launch) -> Option<String> {
    let letter = |p: &str| {
        let b = p.as_bytes();
        (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'\\')
            .then(|| format!("{}:", (b[0] as char).to_ascii_uppercase()))
    };
    letter(e.location.trim_start_matches('"')).or_else(|| {
        (!launch.exe.to_lowercase().ends_with(r"\msiexec.exe"))
            .then(|| letter(&launch.exe))
            .flatten()
    })
}

/// Trie les entrées : programmes proposés (un par nom) et nombre de composants écartés.
fn build_list(entries: Vec<Entry>) -> (Vec<(Entry, Launch)>, usize) {
    let mut seen = HashSet::new();
    let mut components = HashSet::new();
    let mut programs: Vec<(Entry, Launch)> = Vec::new();
    // Les entrées avec une taille passent d'abord : en cas de doublon, on garde la plus complète.
    let mut entries: Vec<Entry> = entries.into_iter().filter(is_listed).collect();
    entries.sort_by_key(|e| std::cmp::Reverse(e.size_kb));
    for e in entries {
        let key = e.name.to_lowercase();
        if is_component(&e.name) {
            components.insert(key);
            continue;
        }
        let Some(launch) = parse_command(&e.command) else {
            continue;
        };
        if seen.insert(key) {
            programs.push((e, launch));
        }
    }
    (programs, components.len())
}

/// Dossier d'installation tel que Windows le donne, sans guillemets ni barre finale.
fn location_of(e: &Entry) -> Option<PathBuf> {
    let loc = expand_env(e.location.trim().trim_matches('"'));
    let loc = loc.trim_end_matches('\\');
    let b = loc.as_bytes();
    (b.len() > 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'\\')
        .then(|| PathBuf::from(loc))
}

/// Chemin en minuscules, pour comparer des dossiers.
fn lower(p: &Path) -> PathBuf {
    PathBuf::from(p.to_string_lossy().to_lowercase())
}

/// Dossiers trop généraux pour être la taille d'un programme : racines, dossiers de
/// Windows et des programmes, dossiers de l'utilisateur.
fn is_shared_folder(path: &Path) -> bool {
    let p = path.to_string_lossy().to_lowercase();
    let parts: Vec<&str> = p.split('\\').filter(|s| !s.is_empty()).collect();
    if parts.len() < 2 || (parts.len() <= 3 && parts[1] == "users") {
        return true;
    }
    let mut shared: Vec<String> = [
        "SystemRoot",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "ProgramData",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "PUBLIC",
    ]
    .iter()
    .filter_map(|v| std::env::var(v).ok())
    .map(|v| v.trim_end_matches('\\').to_lowercase())
    .collect();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        shared.push(format!(
            r"{}\programs",
            local.trim_end_matches('\\').to_lowercase()
        ));
    }
    shared.contains(&p)
}

/// Au-delà, la mesure s'arrête : ce n'est plus le dossier d'un seul programme.
const MAX_ENTRIES: usize = 300_000;

/// Taille d'un dossier, sans suivre les liens et sans compter les dossiers d'autres
/// programmes rangés dedans (les jeux d'une bibliothèque Steam, par exemple).
fn folder_size(root: &Path, others: &HashSet<PathBuf>) -> Option<u64> {
    let mut total = 0u64;
    let mut seen = 0usize;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(items) = std::fs::read_dir(&dir) else {
            continue;
        };
        for item in items.flatten() {
            seen += 1;
            if seen > MAX_ENTRIES {
                return None;
            }
            let Ok(kind) = item.file_type() else {
                continue;
            };
            if kind.is_symlink() {
                continue;
            }
            let path = item.path();
            if kind.is_dir() {
                if !others.contains(&lower(&path)) {
                    stack.push(path);
                }
            } else if let Ok(m) = item.metadata() {
                total += m.len();
            }
        }
    }
    Some(total)
}

/// Mesure les dossiers en attente, quatre à la fois, et annonce chaque taille dès
/// qu'elle est connue (`None` : mesure impossible).
fn measure(
    pending: Vec<(String, PathBuf)>,
    all: &HashSet<PathBuf>,
    found: &(dyn Fn(String, Option<u64>) + Sync),
) {
    let queue = Mutex::new(pending);
    std::thread::scope(|s| {
        for _ in 0..4 {
            s.spawn(|| {
                loop {
                    let next = queue.lock().ok().and_then(|mut q| q.pop());
                    let Some((id, dir)) = next else { break };
                    let mine = lower(&dir);
                    let others: HashSet<PathBuf> =
                        all.iter().filter(|p| **p != mine).cloned().collect();
                    found(id, folder_size(&dir, &others).filter(|s| *s > 0));
                }
            });
        }
    });
}

fn list() -> Result<ProgramList, String> {
    let entries = read_entries()?;
    // Tous les dossiers d'installation, même ceux des programmes non proposés.
    let mut owners: HashMap<PathBuf, usize> = HashMap::new();
    for e in &entries {
        if let Some(loc) = location_of(e) {
            *owners.entry(lower(&loc)).or_default() += 1;
        }
    }
    let (found, components) = build_list(entries);
    let mut ids = HashMap::new();
    let mut pending = Vec::new();
    let programs = found
        .iter()
        .map(|(e, launch)| {
            ids.insert(e.id(), (e.root, e.key.clone()));
            let size_bytes = (e.size_kb > 0).then_some(e.size_kb * 1024);
            // Taille inconnue : le dossier est mesuré s'il n'appartient qu'à ce programme.
            let to_measure = location_of(e).filter(|loc| {
                size_bytes.is_none()
                    && owners.get(&lower(loc)) == Some(&1)
                    && !is_shared_folder(loc)
                    && loc.is_dir()
            });
            let measuring = to_measure.is_some();
            if let Some(loc) = to_measure {
                pending.push((e.id(), loc));
            }
            Program {
                id: e.id(),
                name: e.name.clone(),
                publisher: (!e.publisher.is_empty()).then(|| e.publisher.clone()),
                installed: install_month(&e.install_date),
                size_bytes,
                drive: drive_of(e, launch),
                measuring,
            }
        })
        .collect();
    if let Ok(mut l) = LISTE.lock() {
        *l = Some(ids);
    }
    if let Ok(mut m) = A_MESURER.lock() {
        *m = Some((pending, owners.into_keys().collect()));
    }
    Ok(ProgramList {
        programs,
        components,
    })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MeasuredSize {
    id: String,
    /// `None` : le dossier n'a pas pu être mesuré, la taille reste inconnue.
    size_bytes: Option<u64>,
}

/// Mesure les dossiers des programmes dont Windows ne connaît pas la taille (après
/// `uninstall_get`) et envoie chaque taille au fil de l'eau. `known` : programmes déjà
/// mesurés par le front (après une désinstallation, seule la liste est relue).
#[tauri::command]
pub async fn uninstall_sizes(
    known: Vec<String>,
    on_size: Channel<MeasuredSize>,
) -> Result<(), String> {
    blocking(move || {
        let Some((pending, all)) = A_MESURER.lock().ok().and_then(|mut m| m.take()) else {
            return;
        };
        let known: HashSet<String> = known.into_iter().collect();
        let pending = pending
            .into_iter()
            .filter(|(id, _)| !known.contains(id))
            .collect();
        measure(pending, &all, &|id, size_bytes| {
            let _ = on_size.send(MeasuredSize { id, size_bytes });
        });
    })
    .await
}

#[tauri::command]
pub async fn uninstall_get() -> Result<ProgramList, String> {
    blocking(|| {
        list().map_err(|e| {
            log::warn!("liste des programmes : {e}");
            "La liste des programmes n'a pas pu être lue. Réessayez dans un instant.".to_string()
        })
    })
    .await?
}

// ─── Désinstallation ────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UninstallProgress {
    id: String,
    /// `running`, puis l'un des résultats de [`UninstallResult`].
    status: &'static str,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UninstallResult {
    id: String,
    /// `removed` (retiré du PC), `still_there` (fenêtre fermée ou désinstallation annulée),
    /// `refused` (autorisation de Windows refusée), `error` (l'outil ne s'est pas lancé),
    /// `missing` (plus dans la liste), `skipped` (arrêt demandé avant lui).
    status: &'static str,
}

/// Script qui lance l'outil, attend la fin de tous les programmes qu'il a ouverts
/// (beaucoup se recopient puis se relancent), puis regarde si l'entrée a disparu.
fn uninstall_script(launch: &Launch, key_path: &str) -> String {
    let args = if launch.args.is_empty() {
        String::new()
    } else {
        format!(" -ArgumentList {}", ps::quote(&launch.args))
    };
    format!(
        r"$key = {key}
try {{
  $p = Start-Process -FilePath {exe}{args} -PassThru -ErrorAction Stop
}} catch {{
  $w = $_.Exception
  while ($w -and -not ($w -is [System.ComponentModel.Win32Exception])) {{ $w = $w.InnerException }}
  if ($w -and $w.NativeErrorCode -eq 1223) {{ 'refused' }} else {{ 'error' }}
  exit
}}
$famille = @($p.Id)
while ($true) {{
  $tous = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId)
  foreach ($x in $tous) {{
    if (($famille -contains [int]$x.ParentProcessId) -and -not ($famille -contains [int]$x.ProcessId)) {{ $famille += [int]$x.ProcessId }}
  }}
  $vivants = @($tous | Where-Object {{ $famille -contains [int]$_.ProcessId }})
  if ($vivants.Count -eq 0) {{ break }}
  Start-Sleep -Milliseconds 800
}}
for ($i = 0; $i -lt 8; $i++) {{
  if (-not (Test-Path -LiteralPath $key)) {{ 'removed'; exit }}
  Start-Sleep -Milliseconds 500
}}
'still_there'",
        key = ps::quote(key_path),
        exe = ps::quote(&launch.exe),
    )
}

fn uninstall_one(id: &str, known: &HashMap<String, (usize, String)>) -> &'static str {
    let Some((root, key)) = known.get(id) else {
        return "missing";
    };
    // La commande est relue maintenant : elle a pu changer depuis l'affichage de la liste.
    let entries = match read_entries() {
        Ok(e) => e,
        Err(e) => {
            log::warn!("désinstallation {id} : {e}");
            return "error";
        }
    };
    let Some(entry) = entries
        .into_iter()
        .find(|e| e.root == *root && e.key == *key && is_listed(e))
    else {
        return "missing";
    };
    if is_component(&entry.name) {
        return "missing";
    }
    let Some(launch) = parse_command(&entry.command) else {
        return "error";
    };
    if !Path::new(&launch.exe).is_file() {
        log::warn!("désinstallation {} : outil introuvable", entry.name);
        return "error";
    }
    let key_path = format!(r"{}\{}", ROOTS[*root], key);
    match ps::run(&uninstall_script(&launch, &key_path), UNINSTALL_TIMEOUT) {
        Ok(out) => match out.lines().last().unwrap_or("").trim() {
            "removed" => "removed",
            "refused" => "refused",
            "still_there" => "still_there",
            other => {
                log::warn!("désinstallation {} : {other}", entry.name);
                "error"
            }
        },
        Err(e) => {
            log::warn!("désinstallation {} : {e}", entry.name);
            "error"
        }
    }
}

fn uninstall(ids: Vec<String>, report: &dyn Fn(UninstallProgress)) -> Vec<UninstallResult> {
    let known = LISTE
        .lock()
        .ok()
        .and_then(|l| l.clone())
        .unwrap_or_default();
    let mut results = Vec::new();
    for id in ids {
        let status = if ARRET.load(Ordering::Relaxed) {
            "skipped"
        } else {
            report(UninstallProgress {
                id: id.clone(),
                status: "running",
            });
            uninstall_one(&id, &known)
        };
        report(UninstallProgress {
            id: id.clone(),
            status,
        });
        results.push(UninstallResult { id, status });
    }
    results
}

#[tauri::command]
pub async fn uninstall_run(
    ids: Vec<String>,
    on_progress: Channel<UninstallProgress>,
) -> Result<Vec<UninstallResult>, String> {
    ARRET.store(false, Ordering::Relaxed);
    blocking(move || {
        uninstall(ids, &|p| {
            let _ = on_progress.send(p);
        })
    })
    .await
}

#[tauri::command(async)]
pub fn uninstall_stop() {
    ARRET.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str, command: &str) -> Entry {
        Entry {
            root: 0,
            key: name.replace(' ', ""),
            name: name.into(),
            command: command.into(),
            ..Default::default()
        }
    }

    #[test]
    fn msiexec_is_always_run_in_remove_mode() {
        let l = parse_command("MsiExec.exe /I{23170F69-40C1-2702-2600-000001000000}").unwrap();
        assert!(l.exe.to_lowercase().ends_with(r"\system32\msiexec.exe"));
        assert_eq!(l.args, "/x {23170F69-40C1-2702-2600-000001000000}");
        assert!(parse_command("MsiExec.exe /X{pas-un-guid}").is_none());
        assert!(parse_command("msiexec /x {23170F69-40C1-2702-2600-00000100000Z}").is_none());
    }

    #[test]
    fn quoted_and_unquoted_paths_are_split_from_their_arguments() {
        assert_eq!(
            parse_command(r#""C:\Program Files\VideoLAN\VLC\uninstall.exe" /S"#),
            Some(Launch {
                exe: r"C:\Program Files\VideoLAN\VLC\uninstall.exe".into(),
                args: "/S".into()
            })
        );
        assert_eq!(
            parse_command(r"C:\Program Files (x86)\Foo Bar\unins000.exe"),
            Some(Launch {
                exe: r"C:\Program Files (x86)\Foo Bar\unins000.exe".into(),
                args: String::new()
            })
        );
        assert_eq!(
            parse_command(r"C:\Program Files\App.exe.data\uninst.exe --remove"),
            Some(Launch {
                exe: r"C:\Program Files\App.exe.data\uninst.exe".into(),
                args: "--remove".into()
            })
        );
    }

    #[test]
    fn scripts_package_managers_and_relative_paths_are_refused() {
        for c in [
            "winget uninstall --product-code Anthropic.ClaudeCode",
            r#"powershell -c "& 'C:\Users\x\.bun\uninstall.ps1'""#,
            "steam://uninstall/440",
            "uninstall.exe /S",
            r#""C:\x\setup.exe"#,
            "C:\\x\\a.exe\n/S",
            r"\\serveur\partage\uninstall.exe",
        ] {
            let p = parse_command(c);
            assert!(p.is_none(), "{c} : {p:?}");
        }
    }

    #[test]
    fn environment_variables_are_expanded() {
        let windir = std::env::var("SystemRoot").unwrap();
        assert_eq!(
            expand_env("%SystemRoot%\\x.exe"),
            format!("{windir}\\x.exe")
        );
        assert_eq!(expand_env("100% sûr"), "100% sûr");
        assert_eq!(
            expand_env("%VARIABLE_QUI_N_EXISTE_PAS%"),
            "%VARIABLE_QUI_N_EXISTE_PAS%"
        );
    }

    #[test]
    fn components_updates_and_hidden_entries_are_not_proposed() {
        let ok = r#""C:\Programs\x\uninstall.exe""#;
        let mut entries = vec![
            entry("VLC media player", ok),
            entry("Microsoft Visual C++ 2015-2022 Redistributable (x64)", ok),
            entry("NVIDIA Pilote graphique 621.01", ok),
            entry("Realtek Audio Driver", ok),
            entry("Microsoft Windows Desktop Runtime - 6.0.36 (x64)", ok),
            entry("Kernshine", ok),
            entry("Sans outil", ""),
            entry("Claude Code", "winget uninstall --product-code X"),
        ];
        let mut hidden = entry("Composant caché", ok);
        hidden.system = true;
        let mut update = entry("Mise à jour de sécurité", ok);
        update.update = true;
        let mut child = entry("Module de Office", ok);
        child.parent = true;
        entries.extend([hidden, update, child]);

        let (programs, components) = build_list(entries);
        let names: Vec<&str> = programs.iter().map(|(e, _)| e.name.as_str()).collect();
        assert_eq!(names, ["VLC media player"]);
        assert_eq!(components, 4);
    }

    #[test]
    fn duplicates_keep_the_entry_with_a_size() {
        let ok = r#""C:\Programs\x\uninstall.exe""#;
        let mut a = entry("ClickUp", ok);
        a.key = "a".into();
        let mut b = entry("ClickUp", ok);
        b.key = "b".into();
        b.size_kb = 1000;
        let (programs, _) = build_list(vec![a, b]);
        assert_eq!(programs.len(), 1);
        assert_eq!(programs[0].0.key, "b");
    }

    #[test]
    fn install_month_only_reads_unambiguous_dates() {
        assert_eq!(install_month("20240319"), Some("2024-03".into()));
        assert_eq!(install_month("3/19/2024"), None);
        assert_eq!(install_month("20241319"), None);
        assert_eq!(install_month(""), None);
    }

    #[test]
    fn drive_comes_from_the_install_folder_then_the_tool() {
        let mut e = entry("Jeu", r#""D:\Jeux\x\uninstall.exe""#);
        let l = parse_command(&e.command).unwrap();
        assert_eq!(drive_of(&e, &l).as_deref(), Some("D:"));
        e.location = r"e:\Autre".into();
        assert_eq!(drive_of(&e, &l).as_deref(), Some("E:"));
        let msi = parse_command("MsiExec.exe /X{23170F69-40C1-2702-2600-000001000000}").unwrap();
        e.location.clear();
        assert_eq!(drive_of(&e, &msi), None);
    }

    #[test]
    fn script_quotes_every_value() {
        let l = Launch {
            exe: r"C:\Program Files\O'Brien\uninstall.exe".into(),
            args: "/S '; calc; '".into(),
        };
        let s = uninstall_script(
            &l,
            r"HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\O'Brien",
        );
        assert!(s.contains(r"-FilePath 'C:\Program Files\O''Brien\uninstall.exe'"));
        assert!(s.contains("-ArgumentList '/S ''; calc; '''"));
        assert!(s.contains(r"Uninstall\O''Brien'"));
        let sans = uninstall_script(
            &Launch {
                exe: r"C:\x\u.exe".into(),
                args: String::new(),
            },
            r"HKCU:\x",
        );
        assert!(!sans.contains("-ArgumentList"));
    }

    #[test]
    fn unknown_ids_are_never_uninstalled() {
        let known = HashMap::new();
        assert_eq!(uninstall_one("0:Inconnu", &known), "missing");
        let results = uninstall(vec!["2:Rien".into()], &|_| {});
        assert_eq!(results[0].status, "missing");
    }

    /// Désinstallation réelle d'une fausse entrée de l'utilisateur (aucun vrai programme) :
    /// un outil qui ne retire rien, puis un outil qui retire l'entrée.
    #[test]
    fn real_uninstall_of_a_test_entry() {
        let key = format!("KernshineTest{}", std::process::id());
        let path = format!(r"{}\{key}", ROOTS[2]);
        let system = std::env::var("SystemRoot").unwrap();
        let set = |command: &str| {
            let script = format!(
                "New-Item -Path {p} -Force | Out-Null
New-ItemProperty -Path {p} -Name DisplayName -Value 'Test de Kernshine' -Force | Out-Null
New-ItemProperty -Path {p} -Name UninstallString -Value {c} -Force | Out-Null",
                p = ps::quote(&path),
                c = ps::quote(command),
            );
            ps::run(&script, Duration::from_secs(30)).is_ok()
        };
        let id = format!("2:{key}");
        let known = HashMap::from([(id.clone(), (2, key.clone()))]);

        let mut statuses = Vec::new();
        if set(&format!(r"{system}\System32\whoami.exe")) {
            statuses.push(uninstall_one(&id, &known));
        }
        if set(&format!(
            r#"{system}\System32\reg.exe delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{key}" /f"#
        )) {
            statuses.push(uninstall_one(&id, &known));
        }
        let _ = ps::run(
            &format!(
                "Remove-Item -Path {} -Force -ErrorAction SilentlyContinue",
                ps::quote(&path)
            ),
            Duration::from_secs(30),
        );
        if statuses.len() == 2 {
            assert_eq!(statuses, ["still_there", "removed"]);
        }
    }

    /// Lecture sur la vraie machine : la liste se lit et ne propose aucun composant.
    #[test]
    fn real_list_reads() {
        let Ok(list) = list() else {
            return;
        };
        for p in &list.programs {
            assert!(!is_component(&p.name), "{}", p.name);
            assert!(!p.name.eq_ignore_ascii_case("kernshine"));
            assert!(!(p.measuring && p.size_bytes.is_some()), "{}", p.name);
        }
    }

    /// Liste et tailles mesurées sur la vraie machine (long : les jeux sont gros).
    /// `cargo test --release real_sizes -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_sizes() {
        let list = list().unwrap();
        let start = std::time::Instant::now();
        let (pending, all) = A_MESURER.lock().unwrap().take().unwrap();
        let sizes = Mutex::new(HashMap::new());
        measure(pending, &all, &|id, size| {
            sizes.lock().unwrap().insert(id, size);
        });
        let sizes = sizes.into_inner().unwrap();
        eprintln!(
            "{} programmes, {} composants non proposés, {} dossiers mesurés en {:?}",
            list.programs.len(),
            list.components,
            sizes.len(),
            start.elapsed()
        );
        for p in &list.programs {
            let measured = sizes.get(&p.id).copied().flatten();
            eprintln!(
                "  {} | {:?} | {:?} Mo | mesuré {:?} Mo",
                p.name,
                p.installed,
                p.size_bytes.map(|b| b / 1024 / 1024),
                measured.map(|b| b / 1024 / 1024)
            );
        }
    }

    #[test]
    fn folder_size_skips_other_programs_folders() {
        let root = std::env::temp_dir().join(format!("kernshine_taille_{}", std::process::id()));
        let jeu = root.join("steamapps").join("common").join("Jeu");
        std::fs::create_dir_all(&jeu).unwrap();
        std::fs::write(root.join("steam.exe"), vec![0u8; 1000]).unwrap();
        std::fs::write(jeu.join("data.pak"), vec![0u8; 5000]).unwrap();
        let others = HashSet::from([lower(&jeu)]);
        assert_eq!(folder_size(&root, &others), Some(1000));
        assert_eq!(folder_size(&root, &HashSet::new()), Some(6000));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn shared_folders_are_never_measured() {
        let profile = std::env::var("USERPROFILE").unwrap();
        let program_files = std::env::var("ProgramFiles").unwrap();
        for p in [r"C:\", &profile, &program_files, r"C:\Users\Quelqu'un"] {
            assert!(is_shared_folder(Path::new(p)), "{p}");
        }
        assert!(!is_shared_folder(Path::new(
            r"E:\SteamLibrary\steamapps\common\Satisfactory"
        )));
        assert!(!is_shared_folder(
            &Path::new(&program_files).join("VideoLAN")
        ));
    }
}
