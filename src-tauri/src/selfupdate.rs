//! Mise à jour de Kernshine lui-même (pas des programmes de l'utilisateur :
//! voir `updates.rs`).
//!
//! Le module de mise à jour de Tauri lit `latest.json` à l'adresse fixée dans
//! `tauri.conf.json` (`plugins > updater > endpoints`), vérifie la signature de
//! l'installeur avec la clé publique, puis lance l'installeur. Sous Windows,
//! l'application se ferme d'elle-même quand l'installeur démarre.
//!
//! Le front ne parle jamais directement au module : seules ces deux commandes
//! sont exposées, et l'adresse des mises à jour ne peut pas venir du front.

use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;
use tauri::ipc::Channel;
use tauri_plugin_updater::UpdaterExt as _;

const ERREUR_VERIFICATION: &str = "Impossible de vérifier les mises à jour pour le moment. Vérifiez votre connexion internet et réessayez.";
const ERREUR_INSTALLATION: &str = "La mise à jour n'a pas pu être installée. Réessayez plus tard.";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfUpdateCheck {
    ok: bool,
    /// Une version plus récente est disponible.
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    /// Nouveautés de la version (extrait du CHANGELOG).
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<String>,
    /// Installé pour tous les utilisateurs : Windows demandera l'autorisation.
    needs_permission: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Étapes de l'installation, envoyées au fur et à mesure.
#[derive(Clone, Serialize)]
#[serde(tag = "step", rename_all = "camelCase")]
pub enum SelfUpdateEvent {
    #[serde(rename_all = "camelCase")]
    Downloading { downloaded: u64, total: Option<u64> },
    /// Téléchargement fini, l'installeur va démarrer et l'app se fermer.
    Installing,
}

#[derive(Serialize)]
pub struct SelfUpdateResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Vrai si l'exécutable est sous Program Files, c'est-à-dire installé
/// « pour tous les utilisateurs » : la mise à jour demandera l'autorisation.
fn installed_for_all_users(exe: &Path, program_files: &Path) -> bool {
    let exe = exe.to_string_lossy().to_lowercase();
    let mut base = program_files.to_string_lossy().to_lowercase();
    if !base.ends_with('\\') {
        base.push('\\');
    }
    exe.starts_with(&base)
}

fn needs_permission() -> bool {
    let (Ok(exe), Some(pf)) = (std::env::current_exe(), std::env::var_os("ProgramFiles")) else {
        return false;
    };
    installed_for_all_users(&exe, Path::new(&pf))
}

/// Le canal répond mais n'a pas (encore) de `latest.json` : rien n'a été publié,
/// ce n'est pas un problème de connexion. L'utilisateur a donc la dernière version.
fn nothing_published(e: &tauri_plugin_updater::Error) -> bool {
    matches!(e, tauri_plugin_updater::Error::ReleaseNotFound)
}

#[tauri::command]
pub async fn selfupdate_check(app: AppHandle) -> SelfUpdateCheck {
    let needs_permission = needs_permission();
    let checked = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    match checked {
        Ok(Some(update)) => SelfUpdateCheck {
            ok: true,
            available: true,
            version: Some(update.version.clone()),
            notes: update.body.clone().filter(|n| !n.trim().is_empty()),
            needs_permission,
            error: None,
        },
        Ok(None) => SelfUpdateCheck {
            ok: true,
            available: false,
            version: None,
            notes: None,
            needs_permission,
            error: None,
        },
        Err(e) if nothing_published(&e) => {
            log::info!("Aucune version publiée sur le canal de mise à jour : {e}");
            SelfUpdateCheck {
                ok: true,
                available: false,
                version: None,
                notes: None,
                needs_permission,
                error: None,
            }
        }
        Err(e) => {
            log::warn!("Vérification de la mise à jour de Kernshine : {e}");
            SelfUpdateCheck {
                ok: false,
                available: false,
                version: None,
                notes: None,
                needs_permission,
                error: Some(ERREUR_VERIFICATION.into()),
            }
        }
    }
}

/// Télécharge et installe la dernière version. La version n'est pas choisie par
/// le front : on refait la vérification ici et on installe ce qu'elle trouve.
#[tauri::command]
pub async fn selfupdate_install(
    app: AppHandle,
    on_event: Channel<SelfUpdateEvent>,
) -> SelfUpdateResult {
    let fail = |e: &dyn std::fmt::Display| {
        log::warn!("Installation de la mise à jour de Kernshine : {e}");
        SelfUpdateResult {
            ok: false,
            error: Some(ERREUR_INSTALLATION.into()),
        }
    };
    let update = match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => update,
            Ok(None) => {
                return SelfUpdateResult {
                    ok: true,
                    error: None,
                };
            }
            Err(e) => return fail(&e),
        },
        Err(e) => return fail(&e),
    };

    let mut downloaded: u64 = 0;
    let progress = on_event.clone();
    let result = update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress.send(SelfUpdateEvent::Downloading { downloaded, total });
            },
            move || {
                let _ = on_event.send(SelfUpdateEvent::Installing);
            },
        )
        .await;
    match result {
        Ok(()) => SelfUpdateResult {
            ok: true,
            error: None,
        },
        Err(e) => fail(&e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn program_files_means_all_users() {
        let pf = Path::new(r"C:\Program Files");
        assert!(installed_for_all_users(
            Path::new(r"C:\Program Files\Kernshine\kernshine.exe"),
            pf
        ));
        assert!(installed_for_all_users(
            Path::new(r"c:\program files\kernshine\kernshine.exe"),
            Path::new(r"C:\Program Files\")
        ));
    }

    #[test]
    fn user_folders_do_not_need_permission() {
        let pf = Path::new(r"C:\Program Files");
        assert!(!installed_for_all_users(
            Path::new(r"C:\Users\a\AppData\Local\Programs\Kernshine\kernshine.exe"),
            pf
        ));
        // « Program Files (x86) » n'est pas sous « Program Files\ ».
        assert!(!installed_for_all_users(
            Path::new(r"C:\Program Files (x86)\Kernshine\kernshine.exe"),
            pf
        ));
        assert!(!installed_for_all_users(
            Path::new(r"D:\Apps\Kernshine\kernshine.exe"),
            pf
        ));
    }

    #[test]
    fn missing_manifest_is_not_a_connection_error() {
        assert!(nothing_published(
            &tauri_plugin_updater::Error::ReleaseNotFound
        ));
        assert!(!nothing_published(&tauri_plugin_updater::Error::Network(
            "délai dépassé".into()
        )));
    }

    #[test]
    fn updater_endpoint_is_https_and_fixed() {
        // L'adresse des mises à jour est dans la configuration, jamais fournie par le front.
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater = &conf["plugins"]["updater"];
        let endpoints = updater["endpoints"].as_array().expect("endpoints");
        assert!(!endpoints.is_empty());
        for e in endpoints {
            assert!(
                e.as_str()
                    .unwrap()
                    .starts_with("https://github.com/KerdanetYvan/Kernshine/")
            );
        }
        assert!(updater["pubkey"].as_str().is_some_and(|k| !k.is_empty()));
        assert!(updater.get("dangerousInsecureTransportProtocol").is_none());
    }
}
