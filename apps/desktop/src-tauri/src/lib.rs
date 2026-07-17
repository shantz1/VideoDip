mod archive;
mod artifact;
mod export;
mod persistence;
mod probe;
mod whisper;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(artifact::MediaProcessRegistry::default())
        .manage(whisper::WhisperTaskRegistry::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            archive::export_project_archive,
            archive::import_project_archive,
            archive::inspect_project_archive,
            artifact::cancel_media_artifact,
            artifact::generate_media_artifact,
            artifact::get_media_artifact_cache,
            artifact::put_media_artifact_cache,
            export::cancel_export,
            export::export_video,
            persistence::delete_project,
            persistence::list_projects,
            persistence::load_project,
            persistence::save_project,
            probe::probe_media,
            whisper::cancel_whisper_task,
            whisper::delete_whisper_model,
            whisper::download_whisper_model,
            whisper::get_whisper_status,
            whisper::transcribe_media
        ])
        .setup(|app| {
            persistence::initialize(app.handle()).map_err(std::io::Error::other)?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
