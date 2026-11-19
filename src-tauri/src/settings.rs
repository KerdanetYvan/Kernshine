//! Paramètres de l'application : version, lancement avec Windows, ouverture des journaux.

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_opener::OpenerExt as _;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInfo {
    version: String,
    open_at_login: bool,
}

#[derive(Serialize)]
pub struct Ack {
    ok: bool,
}

#[tauri::command(async)]
pub fn settings_get_info(app: AppHandle) -> Result<SettingsInfo, String> {
    Ok(SettingsInfo {
        version: app.package_info().version.to_string(),
        open_at_login: app.autolaunch().is_enabled().map_err(|e| e.to_string())?,
    })
}

#[tauri::command(async)]
pub fn settings_set_login_item(app: AppHandle, open_at_login: bool) -> Result<Ack, String> {
    let launcher = app.autolaunch();
    let res = if open_at_login {
        launcher.enable()
    } else {
        launcher.disable()
    };
    res.map_err(|e| e.to_string())?;
    Ok(Ack { ok: true })
}

/// Liens de la section « À propos » : le front n'envoie qu'un nom, jamais une adresse.
const LINKS: &[(&str, &str)] = &[
    ("source", "https://github.com/KerdanetYvan/Kernshine"),
    (
        "probleme",
        "https://github.com/KerdanetYvan/Kernshine/issues/new",
    ),
    (
        "licence",
        "https://github.com/KerdanetYvan/Kernshine/blob/main/LICENSE",
    ),
];

fn link_url(name: &str) -> Option<&'static str> {
    LINKS.iter().find(|(n, _)| *n == name).map(|(_, url)| *url)
}

/// Ouvre un lien de la section « À propos » dans le navigateur.
#[tauri::command(async)]
pub fn settings_open_link(app: AppHandle, name: String) -> Result<(), String> {
    let url = link_url(&name).ok_or("Lien inconnu")?;
    app.opener().open_url(url, None::<&str>).map_err(|e| {
        log::warn!("lien non ouvert : {e}");
        "Le lien n'a pas pu s'ouvrir. Réessayez.".to_string()
    })
}

/// Ouvre un rapport (.log) du dossier de journaux de l'application, et rien d'autre.
/// Renvoie un message d'erreur, ou une chaîne vide si tout s'est bien passé.
#[tauri::command(async)]
pub fn shell_open_log(app: AppHandle, path: String) -> String {
    let logs_dir = match app.path().app_data_dir().map(|d| d.join("logs")) {
        Ok(d) => d,
        Err(e) => return e.to_string(),
    };
    let (Ok(logs_dir), Ok(file)) = (
        logs_dir.canonicalize(),
        std::path::Path::new(&path).canonicalize(),
    ) else {
        return "Fichier introuvable".into();
    };
    let is_log = file
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("log"));
    if !file.starts_with(&logs_dir) || !is_log {
        return "Ce fichier ne peut pas être ouvert".into();
    }
    match app.opener().open_path(file.to_string_lossy(), None::<&str>) {
        Ok(()) => String::new(),
        Err(e) => e.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_links_open() {
        assert_eq!(
            link_url("source"),
            Some("https://github.com/KerdanetYvan/Kernshine")
        );
        assert!(link_url("https://exemple.com").is_none());
        assert!(
            LINKS
                .iter()
                .all(|(_, url)| url.starts_with("https://github.com/KerdanetYvan/Kernshine"))
        );
    }
}
