//! Spawns FFmpeg for an export and streams progress back to the webview.
//!
//! Deliberately dumb: the argv is compiled by `@videodip/media-engine`'s pure
//! `buildExportArgs`, where it is unit-tested. This side only runs the
//! process, parses `-progress pipe:1` output, and reports how it ended.

use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

/// Event name the webview listens on for progress updates.
pub const PROGRESS_EVENT: &str = "export-progress";

#[derive(Clone, Serialize)]
struct ExportProgress {
    /// 0.0..=1.0 of the output duration already encoded.
    fraction: f64,
}

/// Runs FFmpeg with the given argv and emits `export-progress` events.
///
/// `total_duration_ms` is the expected output duration; progress is the ratio
/// of FFmpeg's reported encode position to it. Errors are strings meant for
/// the user, each carrying its own recovery hint — the webview surfaces them
/// verbatim.
#[tauri::command]
pub async fn export_video(
    app: AppHandle,
    args: Vec<String>,
    total_duration_ms: f64,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || run_ffmpeg(&app, &args, total_duration_ms))
        .await
        .map_err(|error| format!("The export task crashed: {error}. Try exporting again."))?
}

fn run_ffmpeg(app: &AppHandle, args: &[String], total_duration_ms: f64) -> Result<(), String> {
    let mut command = Command::new("ffmpeg");
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Without this, every export flashes a console window on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "FFmpeg was not found on this machine. Install FFmpeg (winget install ffmpeg) \
             so `ffmpeg` is on PATH, then export again."
                .to_string()
        } else {
            format!("Could not start FFmpeg: {error}")
        }
    })?;

    // Drain stderr on its own thread. FFmpeg logs there continuously; reading
    // stdout to completion first would deadlock once the stderr pipe fills.
    let stderr_reader = child.stderr.take().map(|stderr| {
        std::thread::spawn(move || {
            let mut text = String::new();
            let _ = BufReader::new(stderr).read_to_string(&mut text);
            text
        })
    });

    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            // FFmpeg quirk: both keys are microseconds; out_time_ms predates
            // out_time_us and never matched its own name.
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
                    let _ = app.emit(PROGRESS_EVENT, ExportProgress { fraction });
                }
            }
        }
    }

    let stderr_text = stderr_reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    let status = child
        .wait()
        .map_err(|error| format!("FFmpeg did not finish cleanly: {error}"))?;

    if status.success() {
        let _ = app.emit(PROGRESS_EVENT, ExportProgress { fraction: 1.0 });
        Ok(())
    } else {
        // The last few stderr lines carry the actual cause; the preceding
        // hundreds are configuration echo.
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
