mod bigfiles;
mod diagnose;
mod drivers;
mod hidden;
mod prefs;
mod proc;
mod ps;
mod repair;
mod report;
mod scan;
mod selfupdate;
mod settings;
mod system;
mod updates;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Doit être le premier plugin. Un second lancement ne démarre rien : il remet
        // la fenêtre existante au premier plan (évite les processus fantômes qui
        // verrouillent les fichiers lors d'une réinstallation).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        // Mise à jour de Kernshine lui-même (voir selfupdate.rs).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let stats = Arc::new(system::StatsState::default());
            system::start_sampler(Arc::clone(&stats));
            app.manage(stats);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system::system_get_info,
            system::system_get_disks,
            scan::scan_get_zones,
            scan::clean_zones,
            scan::clean_stop,
            bigfiles::bigfiles_scan,
            bigfiles::bigfiles_stop,
            bigfiles::bigfiles_delete,
            bigfiles::bigfiles_reveal,
            settings::settings_get_info,
            settings::settings_set_login_item,
            settings::settings_open_link,
            prefs::settings_get_prefs,
            prefs::settings_set_prefs,
            settings::shell_open_log,
            selfupdate::selfupdate_check,
            selfupdate::selfupdate_install,
            repair::repair_get_services,
            repair::repair_fix_services,
            repair::repair_run_sfc,
            repair::repair_get_driver_errors,
            repair::repair_fix_driver_errors,
            repair::repair_get_registry_issues,
            repair::repair_fix_registry_issues,
            repair::repair_get_startup_items,
            repair::repair_set_startup_items,
            repair::repair_get_disk_health,
            repair::repair_schedule_disk_check,
            updates::updates_get_software,
            updates::updates_get_hidden,
            updates::updates_hide,
            updates::updates_unhide,
            updates::updates_unhide_all,
            drivers::drivers_get,
            drivers::drivers_hide,
            drivers::drivers_unhide_all,
            drivers::drivers_install,
            drivers::drivers_stop,
            system::system_restart,
            updates::updates_install_software_stream,
            updates::updates_install_elevated,
            updates::updates_close_related_app,
            updates::updates_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
    /// Une commande Tauri ni `async fn` ni `#[tauri::command(async)]` s'exécute
    /// sur le fil de la fenêtre : si elle est lente, l'interface gèle (bug #1).
    #[test]
    fn commands_never_run_on_the_window_thread() {
        let sources = [
            ("bigfiles.rs", include_str!("bigfiles.rs")),
            ("diagnose.rs", include_str!("diagnose.rs")),
            ("drivers.rs", include_str!("drivers.rs")),
            ("hidden.rs", include_str!("hidden.rs")),
            ("prefs.rs", include_str!("prefs.rs")),
            ("proc.rs", include_str!("proc.rs")),
            ("ps.rs", include_str!("ps.rs")),
            ("repair.rs", include_str!("repair.rs")),
            ("report.rs", include_str!("report.rs")),
            ("scan.rs", include_str!("scan.rs")),
            ("selfupdate.rs", include_str!("selfupdate.rs")),
            ("settings.rs", include_str!("settings.rs")),
            ("system.rs", include_str!("system.rs")),
            ("updates.rs", include_str!("updates.rs")),
        ];
        let mut found = 0;
        for (file, src) in sources {
            let lines: Vec<&str> = src.lines().map(str::trim).collect();
            for (i, line) in lines.iter().enumerate() {
                if !line.starts_with("#[tauri::command") {
                    continue;
                }
                found += 1;
                if line.contains("(async)") {
                    continue;
                }
                let signature = lines[i + 1..]
                    .iter()
                    .find(|l| !l.starts_with("#[") && !l.starts_with("//"))
                    .expect("fonction après #[tauri::command]");
                assert!(
                    signature.contains("async fn"),
                    "{file}:{} : commande exécutée sur le fil de la fenêtre ({signature}). \
                     Utiliser `async fn` + spawn_blocking, ou #[tauri::command(async)].",
                    i + 2
                );
            }
        }
        // Autant de commandes vérifiées que de commandes enregistrées : un module
        // oublié dans la liste ci-dessus ferait échouer le test.
        let lib = include_str!("lib.rs");
        let handler = &lib[lib.find("generate_handler![").expect("generate_handler")..];
        let registered = handler[..handler.find("])").expect("fin de generate_handler")]
            .lines()
            .filter(|l| l.trim().ends_with(",") && l.contains("::"))
            .count();
        assert_eq!(found, registered, "commandes vérifiées / enregistrées");
    }
}
