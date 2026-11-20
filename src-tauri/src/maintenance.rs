//! Note sur 100 de l'entretien (affichée sur l'Accueil).
//!
//! Elle est calculée à la fin de l'analyse de l'entretien, à partir de quatre parts :
//! place libre du disque système (30), fichiers inutiles trouvés (20), mises à jour en
//! attente des applications et des pilotes (25), santé du matériel (25). Une part dont
//! l'étape a été décochée dans les Paramètres n'est pas comptée : la note est ramenée
//! sur 100 avec les autres. La dernière note est gardée dans `maintenance.json`.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "maintenance.json";
const GO: f64 = 1024.0 * 1024.0 * 1024.0;

/// Ce que l'analyse a trouvé. `None` : étape décochée, la part n'est pas comptée.
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScoreInput {
    system_free_bytes: u64,
    system_total_bytes: u64,
    junk_bytes: Option<u64>,
    pending_updates: Option<u32>,
    /// Problèmes de matériel : (à corriger, à surveiller).
    health_issues: Option<(u32, u32)>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScorePart {
    /// `space`, `junk`, `updates` ou `health`.
    id: String,
    points: u32,
    max: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    /// Note sur 100.
    value: u32,
    /// `ok` (80 et plus), `surveiller` (50 à 79), `corriger` (moins de 50).
    state: String,
    parts: Vec<ScorePart>,
    /// Date de l'analyse (secondes depuis 1970).
    date: u64,
}

/// `max` points au-dessus de `good`, 0 en dessous de `bad`, et entre les deux en ligne droite.
fn linear(value: f64, bad: f64, good: f64, max: u32) -> u32 {
    let t = ((value - bad) / (good - bad)).clamp(0.0, 1.0);
    (t * max as f64).round() as u32
}

fn compute(input: &ScoreInput, date: u64) -> Score {
    let mut parts = Vec::new();
    if input.system_total_bytes > 0 {
        let free = input.system_free_bytes as f64 / input.system_total_bytes as f64;
        // 25 % de place libre ou plus : tout va bien ; 5 % ou moins : Windows ralentit.
        parts.push(("space", linear(free, 0.05, 0.25, 30), 30));
    }
    if let Some(junk) = input.junk_bytes {
        // Aucun fichier inutile : 20 points ; 20 Go ou plus : 0.
        parts.push(("junk", linear(-(junk as f64 / GO), -20.0, 0.0, 20), 20));
    }
    if let Some(n) = input.pending_updates {
        parts.push(("updates", 25u32.saturating_sub(5 * n), 25));
    }
    if let Some((bad, warning)) = input.health_issues {
        let points = if bad > 0 {
            0
        } else {
            25u32.saturating_sub(10 * warning)
        };
        parts.push(("health", points, 25));
    }
    let got: u32 = parts.iter().map(|p| p.1).sum();
    let max: u32 = parts.iter().map(|p| p.2).sum();
    let value = if max == 0 {
        0
    } else {
        ((got as f64 / max as f64) * 100.0).round() as u32
    };
    let state = match value {
        80.. => "ok",
        50..=79 => "surveiller",
        _ => "corriger",
    };
    Score {
        value,
        state: state.into(),
        parts: parts
            .into_iter()
            .map(|(id, points, max)| ScorePart {
                id: id.into(),
                points,
                max,
            })
            .collect(),
        date,
    }
}

fn read(dir: &Path) -> Option<Score> {
    let text = std::fs::read_to_string(dir.join(FILE_NAME)).ok()?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

fn write(dir: &Path, score: &Score) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(score).map_err(std::io::Error::other)?;
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, dir.join(FILE_NAME))
}

/// Calcule la note de l'analyse qui vient de se terminer et la garde pour l'Accueil.
#[tauri::command(async)]
pub fn maintenance_score(app: AppHandle, input: ScoreInput) -> Score {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let score = compute(&input, now);
    match app.path().app_data_dir() {
        Ok(dir) => {
            if let Err(e) = write(&dir, &score) {
                log::warn!("note de l'entretien non enregistrée : {e}");
            }
        }
        Err(e) => log::warn!("dossier de données introuvable : {e}"),
    }
    score
}

/// Dernière note, gardée même après la fermeture de Kernshine (absente si jamais analysé).
#[tauri::command(async)]
pub fn maintenance_last(app: AppHandle) -> Option<Score> {
    app.path().app_data_dir().ok().and_then(|d| read(&d))
}

#[cfg(test)]
mod tests {
    use super::*;

    const G: u64 = 1024 * 1024 * 1024;

    fn input(
        free_go: u64,
        junk_go: Option<u64>,
        updates: Option<u32>,
        health: Option<(u32, u32)>,
    ) -> ScoreInput {
        ScoreInput {
            system_free_bytes: free_go * G,
            system_total_bytes: 100 * G,
            junk_bytes: junk_go.map(|g| g * G),
            pending_updates: updates,
            health_issues: health,
        }
    }

    #[test]
    fn a_clean_pc_scores_100() {
        let s = compute(&input(40, Some(0), Some(0), Some((0, 0))), 1);
        assert_eq!(s.value, 100);
        assert_eq!(s.state, "ok");
        assert_eq!(s.parts.len(), 4);
    }

    #[test]
    fn a_full_disk_with_junk_and_updates_is_critical() {
        // 5 % libres, 20 Go à nettoyer, 7 mises à jour, un disque vieillissant.
        let s = compute(&input(5, Some(20), Some(7), Some((0, 1))), 1);
        assert_eq!(s.value, 15);
        assert_eq!(s.state, "corriger");
    }

    #[test]
    fn each_part_is_bounded() {
        let s = compute(&input(15, Some(10), Some(2), Some((1, 0))), 1);
        let pts: Vec<(String, u32)> = s.parts.iter().map(|p| (p.id.clone(), p.points)).collect();
        assert_eq!(
            pts,
            [
                ("space".into(), 15),
                ("junk".into(), 10),
                ("updates".into(), 15),
                ("health".into(), 0)
            ]
        );
        assert_eq!(s.value, 40);
    }

    #[test]
    fn skipped_steps_are_not_counted() {
        // Seule la place libre est connue, et elle est bonne.
        let s = compute(&input(30, None, None, None), 1);
        assert_eq!(s.parts.len(), 1);
        assert_eq!(s.value, 100);
    }

    #[test]
    fn last_score_round_trips_and_survives_damage() {
        let dir = std::env::temp_dir().join(format!("kernshine_note_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(read(&dir), None);
        let s = compute(&input(10, Some(3), Some(1), Some((0, 0))), 42);
        write(&dir, &s).unwrap();
        assert_eq!(read(&dir), Some(s));
        std::fs::write(dir.join(FILE_NAME), "{ abîmé").unwrap();
        assert_eq!(read(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
