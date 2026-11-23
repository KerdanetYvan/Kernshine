//! Ce que les mises à jour précédentes ont appris, programme par programme.
//!
//! Deux cas reviennent d'une session à l'autre sans que rien n'y change :
//! - la mise à jour s'installe, mais l'ancienne version est toujours détectée (Autodesk Fusion,
//!   qui se met à jour lui-même au lancement) ;
//! - le gestionnaire annonce une version, puis refuse de l'installer parce qu'elle ne convient
//!   pas au PC (MongoDB Compass).
//!
//! Chaque constat est lié à la version proposée : dès qu'une nouvelle version sort, le
//! programme est proposé de nouveau normalement. Un fichier absent ou abîmé donne un
//! historique vide : l'analyse ne doit jamais échouer à cause de lui.

use crate::report::{Entry, Outcome};
use serde::{Deserialize, Serialize};
use std::io;
use std::path::Path;
use std::sync::Mutex;

const FILE_NAME: &str = "update-history.json";

/// Code du gestionnaire : « aucune mise à niveau applicable » (version qui ne convient pas au PC).
pub const NOT_APPLICABLE_CODE: i64 = 0x8A15_002B;

/// À partir de combien de constats « ancienne version toujours détectée » pour la même
/// version le programme n'est plus coché d'office (le premier peut être passager).
pub const STUCK_AFTER: u32 = 2;

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: String,
    /// Version proposée au moment du constat.
    pub version: String,
    /// Nombre d'installations sans effet sur la version détectée.
    #[serde(default)]
    pub still_outdated: u32,
    /// Le gestionnaire a refusé cette version : elle ne convient pas au PC.
    #[serde(default)]
    pub not_applicable: bool,
}

#[derive(Serialize, Deserialize, Default)]
struct Stored {
    #[serde(default)]
    programs: Vec<Record>,
}

/// Historique chargé, interrogé pendant l'analyse.
#[derive(Default, Debug)]
pub struct History(Vec<Record>);

impl History {
    fn find(&self, id: &str, version: &str) -> Option<&Record> {
        self.0
            .iter()
            .find(|r| r.id.eq_ignore_ascii_case(id) && r.version == version)
    }

    /// Cette version s'est déjà installée plusieurs fois sans rien changer.
    pub fn is_stuck(&self, id: &str, version: &str) -> bool {
        self.find(id, version)
            .is_some_and(|r| r.still_outdated >= STUCK_AFTER)
    }

    /// Le gestionnaire a déjà refusé cette version pour ce PC.
    pub fn is_not_applicable(&self, id: &str, version: &str) -> bool {
        self.find(id, version).is_some_and(|r| r.not_applicable)
    }
}

fn read(dir: &Path) -> Vec<Record> {
    match std::fs::read_to_string(dir.join(FILE_NAME)) {
        Ok(text) => serde_json::from_str::<Stored>(text.trim_start_matches('\u{feff}'))
            .map(|s| s.programs)
            .unwrap_or_else(|e| {
                log::warn!("historique des mises à jour illisible, ignoré : {e}");
                Vec::new()
            }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(e) => {
            log::warn!("historique des mises à jour inaccessible : {e}");
            Vec::new()
        }
    }
}

/// Écrit dans un fichier temporaire puis le renomme : jamais de fichier à moitié écrit.
fn write(dir: &Path, programs: &[Record]) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(&Stored {
        programs: programs.to_vec(),
    })
    .map_err(io::Error::other)?;
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, dir.join(FILE_NAME))
}

pub fn load(dir: &Path) -> History {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    History(read(dir))
}

/// Applique le résultat d'une installation à l'historique d'un programme.
fn apply(programs: &mut Vec<Record>, entry: &Entry) {
    let Some(version) = entry.expected.as_deref().filter(|v| !v.trim().is_empty()) else {
        return;
    };
    let position = programs
        .iter()
        .position(|r| r.id.eq_ignore_ascii_case(&entry.id));
    // Un constat sur une autre version ne compte plus : on repart de zéro.
    let mut record = match position.map(|i| programs.remove(i)) {
        Some(r) if r.version == version => r,
        _ => Record {
            id: entry.id.clone(),
            version: version.to_string(),
            still_outdated: 0,
            not_applicable: false,
        },
    };
    match &entry.outcome {
        Outcome::StillOutdated => record.still_outdated += 1,
        Outcome::Failed {
            code: Some(NOT_APPLICABLE_CODE),
            ..
        } => record.not_applicable = true,
        // Mis à jour : plus rien à retenir.
        Outcome::Confirmed | Outcome::Restart(_) | Outcome::Unverifiable => return,
        // Un autre échec ne dit rien de ces deux cas : on garde ce qu'on savait.
        Outcome::Failed { .. } => {}
    }
    if record.still_outdated > 0 || record.not_applicable {
        programs.push(record);
    }
}

/// Enregistre ce qu'une session (ou un nouvel essai) a appris.
pub fn record(dir: &Path, entries: &[Entry]) {
    if entries.is_empty() {
        return;
    }
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut programs = read(dir);
    let before = programs.clone();
    for entry in entries {
        apply(&mut programs, entry);
    }
    if programs != before
        && let Err(e) = write(dir, &programs)
    {
        log::warn!("historique des mises à jour non enregistré : {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kernshine_history_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn entry(id: &str, expected: &str, outcome: Outcome) -> Entry {
        Entry {
            name: id.into(),
            id: id.into(),
            before: Some("1.0".into()),
            expected: Some(expected.into()),
            after: None,
            outcome,
        }
    }

    fn failed(code: i64) -> Outcome {
        Outcome::Failed {
            message: String::new(),
            code: Some(code),
            detail: Vec::new(),
        }
    }

    #[test]
    fn a_program_is_stuck_after_two_installs_without_effect() {
        // Autodesk Fusion : trois sessions, la même version, toujours l'ancienne détectée.
        let dir = temp_dir("stuck");
        let fusion = || entry("Autodesk.Fusion", "2706.1.17", Outcome::StillOutdated);
        record(&dir, &[fusion()]);
        assert!(
            !load(&dir).is_stuck("Autodesk.Fusion", "2706.1.17"),
            "un seul constat peut être passager"
        );
        record(&dir, &[fusion()]);
        let history = load(&dir);
        assert!(history.is_stuck("Autodesk.Fusion", "2706.1.17"));
        assert!(
            history.is_stuck("autodesk.fusion", "2706.1.17"),
            "casse ignorée"
        );
        // Une nouvelle version est proposée normalement.
        assert!(!history.is_stuck("Autodesk.Fusion", "2707.0.1"));

        // Une nouvelle version qui, elle aussi, reste sans effet repart de zéro.
        record(
            &dir,
            &[entry("Autodesk.Fusion", "2707.0.1", Outcome::StillOutdated)],
        );
        assert!(!load(&dir).is_stuck("Autodesk.Fusion", "2707.0.1"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_refused_version_is_remembered_until_a_new_one_comes_out() {
        // MongoDB Compass : la version annoncée ne convient pas au PC.
        let dir = temp_dir("not_applicable");
        record(
            &dir,
            &[entry(
                "MongoDB.Compass.Full",
                "1.53.3.0",
                failed(NOT_APPLICABLE_CODE),
            )],
        );
        let history = load(&dir);
        assert!(history.is_not_applicable("MongoDB.Compass.Full", "1.53.3.0"));
        assert!(!history.is_not_applicable("MongoDB.Compass.Full", "1.54.0"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_successful_update_clears_the_history() {
        let dir = temp_dir("cleared");
        let fusion = |o| entry("Autodesk.Fusion", "2706.1.17", o);
        record(&dir, &[fusion(Outcome::StillOutdated)]);
        record(&dir, &[fusion(Outcome::StillOutdated)]);
        // Un autre échec (programme ouvert…) ne change rien à ce qu'on savait.
        record(&dir, &[fusion(failed(0x8A15_0101))]);
        assert!(load(&dir).is_stuck("Autodesk.Fusion", "2706.1.17"));
        record(&dir, &[fusion(Outcome::Confirmed)]);
        assert!(!load(&dir).is_stuck("Autodesk.Fusion", "2706.1.17"));
        assert!(read(&dir).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ordinary_failures_leave_nothing_behind() {
        let dir = temp_dir("ordinary");
        record(&dir, &[entry("OBSProject.OBSStudio", "33.0.1", failed(1))]);
        assert!(
            !dir.join(FILE_NAME).exists(),
            "rien à retenir, rien d'écrit"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn damaged_or_missing_file_means_an_empty_history() {
        let dir = temp_dir("damaged");
        assert!(!load(&dir).is_stuck("A.A", "1"));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(FILE_NAME), "{ abîmé").unwrap();
        assert!(!load(&dir).is_not_applicable("A.A", "1"));
        // Et il peut être remplacé.
        record(&dir, &[entry("A.A", "1", failed(NOT_APPLICABLE_CODE))]);
        assert!(load(&dir).is_not_applicable("A.A", "1"));
        assert!(!dir.join(format!("{FILE_NAME}.tmp")).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
