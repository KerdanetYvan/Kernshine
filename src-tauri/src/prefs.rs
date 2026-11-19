//! Préférences de l'utilisateur, gardées dans `preferences.json` du dossier de données.
//!
//! Un fichier absent ou abîmé donne les réglages par défaut : Kernshine ne doit jamais
//! refuser de démarrer à cause de lui.

use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "preferences.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
    /// Installer les nouvelles versions de Kernshine sans attendre un clic.
    pub auto_update: bool,
    /// Créer un point de restauration avant d'installer des pilotes.
    pub restore_before_drivers: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs {
            auto_update: false,
            restore_before_drivers: true,
        }
    }
}

fn read(dir: &Path) -> Prefs {
    std::fs::read_to_string(dir.join(FILE_NAME))
        .ok()
        .and_then(|t| serde_json::from_str(t.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default()
}

/// Écrit dans un fichier temporaire puis le renomme : jamais de fichier à moitié écrit.
fn write(dir: &Path, prefs: &Prefs) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(prefs).map_err(std::io::Error::other)?;
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, dir.join(FILE_NAME))
}

fn data_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok()
}

#[tauri::command(async)]
pub fn settings_get_prefs(app: AppHandle) -> Prefs {
    data_dir(&app).map(|d| read(&d)).unwrap_or_default()
}

#[tauri::command(async)]
pub fn settings_set_prefs(app: AppHandle, prefs: Prefs) -> Result<Prefs, String> {
    let dir = data_dir(&app).ok_or("Dossier de données introuvable")?;
    write(&dir, &prefs).map_err(|e| {
        log::warn!("préférences non enregistrées : {e}");
        "Le réglage n'a pas pu être enregistré. Réessayez.".to_string()
    })?;
    Ok(prefs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kernshine_prefs_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn defaults_are_cautious() {
        let p = read(&temp_dir("absent"));
        assert!(!p.auto_update, "rien ne s'installe sans clic par défaut");
        assert!(p.restore_before_drivers);
    }

    #[test]
    fn prefs_round_trip_and_survive_damage() {
        let dir = temp_dir("aller_retour");
        let p = Prefs {
            auto_update: true,
            restore_before_drivers: false,
        };
        write(&dir, &p).unwrap();
        assert_eq!(read(&dir), p);
        std::fs::write(dir.join(FILE_NAME), "{ abîmé").unwrap();
        assert_eq!(read(&dir), Prefs::default());
        // Un réglage manquant prend sa valeur par défaut.
        std::fs::write(dir.join(FILE_NAME), r#"{"autoUpdate":true}"#).unwrap();
        assert!(read(&dir).auto_update && read(&dir).restore_before_drivers);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
