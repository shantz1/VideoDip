//! Spawns FFmpeg for an export and streams progress back to the webview.
//!
//! Argument construction remains in `@videodip/media-engine`. This adapter
//! owns only the native process lifecycle, streamed progress and cancellation.

use crate::artifact::{validate_task_id, MediaProcessRegistry};
use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Event name the webview listens on for progress updates.
pub const PROGRESS_EVENT: &str = "export-progress";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    task_id: String,
    /// 0.0..=1.0 of the output duration already encoded.
    fraction: f64,
}

/// Runs FFmpeg with the given argv and emits task-scoped progress events.
#[tauri::command]
pub async fn export_video(
    app: AppHandle,
    registry: State<'_, MediaProcessRegistry>,
    task_id: String,
    args: Vec<String>,
    total_duration_ms: f64,
) -> Result<(), String> {
    validate_task_id(&task_id)?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(&app, &registry, &task_id, &args, total_duration_ms)
    })
    .await
    .map_err(|error| format!("The export task crashed: {error}. Try exporting again."))?
}

/// Cancels a running export, including its pre-spawn registration window.
#[tauri::command]
pub fn cancel_export(
    registry: State<'_, MediaProcessRegistry>,
    task_id: String,
) -> Result<(), String> {
    validate_task_id(&task_id)?;
    registry.cancel(&task_id)
}

fn run_ffmpeg(
    app: &AppHandle,
    registry: &MediaProcessRegistry,
    task_id: &str,
    args: &[String],
    total_duration_ms: f64,
) -> Result<(), String> {
    registry.reserve(task_id)?;
    let mut command = Command::new("ffmpeg");
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            registry.finish(task_id)?;
            return Err(if error.kind() == std::io::ErrorKind::NotFound {
                "FFmpeg was not found on this machine. Install FFmpeg (winget install ffmpeg) \
                 so `ffmpeg` is on PATH, then export again."
                    .to_string()
            } else {
                format!("Could not start FFmpeg: {error}")
            });
        }
    };

    let stdout = child.stdout.take();
    let stderr_reader = child.stderr.take().map(|stderr| {
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = BufReader::new(stderr).read_to_string(&mut text);
            text
        })
    });
    let child = Arc::new(Mutex::new(child));
    let was_cancelled = match registry.activate(task_id, child.clone()) {
        Ok(value) => value,
        Err(error) => {
            let _ = child.lock().map(|mut process| process.kill());
            registry.finish(task_id)?;
            return Err(error);
        }
    };
    if was_cancelled {
        let kill_result = child
            .lock()
            .map_err(|_| {
                "The export process could not be cancelled. Restart VideoDip.".to_string()
            })?
            .kill();
        if let Err(error) = kill_result {
            registry.finish(task_id)?;
            return Err(format!("Could not stop the export: {error}"));
        }
    }

    if let Some(stdout) = stdout {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            // Both keys are microseconds; out_time_ms predates out_time_us and
            // never matched its own name.
            let position = line
                .strip_prefix("out_time_us=")
                .or_else(|| line.strip_prefix("out_time_ms="));
            if let Some(value) = position {
                if let Ok(microseconds) = value.trim().parse::<f64>() {
                    let fraction = if total_duration_ms > 0.0 {
                        (microseconds / 1000.0 / total_duration_ms).clamp(0.0, 1.0)
                    } else {
                        0.0
                    };
                    let _ = app.emit(
                        PROGRESS_EVENT,
                        ExportProgress {
                            task_id: task_id.to_string(),
                            fraction,
                        },
                    );
                }
            }
        }
    }

    let status_result = child
        .lock()
        .map_err(|_| "The export process became unavailable. Retry the export.".to_string())?
        .wait()
        .map_err(|error| format!("FFmpeg did not finish cleanly: {error}"));
    registry.finish(task_id)?;
    let status = status_result?;
    let stderr_text = stderr_reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    if status.success() {
        let _ = app.emit(
            PROGRESS_EVENT,
            ExportProgress {
                task_id: task_id.to_string(),
                fraction: 1.0,
            },
        );
        Ok(())
    } else {
        let tail = stderr_text
            .lines()
            .rev()
            .take(8)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        Err(format!("FFmpeg could not export this timeline:\n{tail}"))
    }
}
