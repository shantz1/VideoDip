//! Spawns the Node render sidecar for a composited export and streams
//! progress back to the webview (ADR-0011).
//!
//! Job construction stays in the webview (`render-video.ts`); the CLI it
//! drives lives in `apps/renderer`. This adapter owns only runtime discovery,
//! the native process lifecycle, streamed progress and cancellation — the
//! same thin-host contract as FFmpeg export (`export.rs`) and Whisper
//! transcription.

use crate::artifact::{validate_task_id, MediaProcessRegistry};
use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Event name the webview listens on for composited render progress.
pub const RENDER_PROGRESS_EVENT: &str = "render-progress";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderProgress {
    task_id: String,
    /// 0.0..=1.0 across bundling and frame rendering combined.
    fraction: f64,
}

/// Whether the composited render engine can run on this machine, and why not
/// when it can't. The webview uses this to make engine selection explicit in
/// the export UI rather than failing after a save dialog.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRuntimeStatus {
    is_available: bool,
    node_path: Option<String>,
    cli_path: Option<String>,
    /// User-facing reason the runtime is unavailable, with a recovery path.
    reason: Option<String>,
}

/// Reports whether the Node sidecar and render CLI are both present.
#[tauri::command]
pub fn get_render_status() -> RenderRuntimeStatus {
    let node = node_path();
    let cli = cli_path();
    match (&node, &cli) {
        (Some(node), Some(cli)) => RenderRuntimeStatus {
            is_available: true,
            node_path: Some(node.to_string_lossy().into_owned()),
            cli_path: Some(cli.to_string_lossy().into_owned()),
            reason: None,
        },
        _ => RenderRuntimeStatus {
            is_available: false,
            node_path: node.map(|path| path.to_string_lossy().into_owned()),
            cli_path: cli.map(|path| path.to_string_lossy().into_owned()),
            reason: Some(
                "The composited render runtime is not provisioned. Run \
                 `pnpm render:provision:windows` (or install Node.js), then export again. \
                 Fast cut-only export still works without it."
                    .to_string(),
            ),
        },
    }
}

/// Runs the render CLI for a prepared job file and emits task-scoped
/// progress events.
///
/// The webview passes the job as a JSON string; this command writes it to a
/// temp file so the argv stays tiny — a long timeline serializes to megabytes
/// of props, well past Windows' command-line length limit.
#[tauri::command]
pub async fn render_video(
    app: AppHandle,
    registry: State<'_, MediaProcessRegistry>,
    task_id: String,
    job_json: String,
) -> Result<(), String> {
    validate_task_id(&task_id)?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || run_render(&app, &registry, &task_id, &job_json))
        .await
        .map_err(|error| format!("The render task crashed: {error}. Try exporting again."))?
}

/// Cancels a running composited render, including its pre-spawn window.
#[tauri::command]
pub fn cancel_render(
    registry: State<'_, MediaProcessRegistry>,
    task_id: String,
) -> Result<(), String> {
    validate_task_id(&task_id)?;
    registry.cancel(&task_id)
}

fn run_render(
    app: &AppHandle,
    registry: &MediaProcessRegistry,
    task_id: &str,
    job_json: &str,
) -> Result<(), String> {
    let (node, cli) = match (node_path(), cli_path()) {
        (Some(node), Some(cli)) => (node, cli),
        _ => {
            return Err(
                "The composited render runtime is not provisioned on this machine. Run \
                 `pnpm render:provision:windows` (or install Node.js), then export again."
                    .to_string(),
            )
        }
    };

    let job_path = std::env::temp_dir().join(format!("videodip-render-{task_id}.json"));
    std::fs::write(&job_path, job_json).map_err(|error| {
        format!("Could not stage the render job: {error}. Free up disk space and retry.")
    })?;
    let result = run_render_process(app, registry, task_id, &node, &cli, &job_path);
    let _ = std::fs::remove_file(&job_path);
    result
}

fn run_render_process(
    app: &AppHandle,
    registry: &MediaProcessRegistry,
    task_id: &str,
    node: &PathBuf,
    cli: &PathBuf,
    job_path: &PathBuf,
) -> Result<(), String> {
    registry.reserve(task_id)?;
    let mut command = Command::new(node);
    command
        .arg(cli)
        .arg(job_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(package_root) = cli_package_root(cli) {
        command.current_dir(package_root);
    }

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
            return Err(format!(
                "Could not start the render runtime ({}): {error}. \
                 Re-run `pnpm render:provision:windows`, then export again.",
                node.display()
            ));
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
                "The render process could not be cancelled. Restart VideoDip.".to_string()
            })?
            .kill();
        if let Err(error) = kill_result {
            registry.finish(task_id)?;
            return Err(format!("Could not stop the render: {error}"));
        }
    }

    if let Some(stdout) = stdout {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(fraction) = parse_progress_line(&line) {
                let _ = app.emit(
                    RENDER_PROGRESS_EVENT,
                    RenderProgress {
                        task_id: task_id.to_string(),
                        fraction,
                    },
                );
            }
        }
    }

    let status_result = child
        .lock()
        .map_err(|_| "The render process became unavailable. Retry the export.".to_string())?
        .wait()
        .map_err(|error| format!("The render runtime did not finish cleanly: {error}"));
    registry.finish(task_id)?;
    let status = status_result?;
    let stderr_text = stderr_reader
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    if status.success() {
        let _ = app.emit(
            RENDER_PROGRESS_EVENT,
            RenderProgress {
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
        Err(format!("The composited render failed:\n{tail}"))
    }
}

/// Parses one `progress=<0..1>` line from the CLI's stdout protocol.
fn parse_progress_line(line: &str) -> Option<f64> {
    line.strip_prefix("progress=")
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|fraction| fraction.is_finite())
        .map(|fraction| fraction.clamp(0.0, 1.0))
}

/// Locates the Node runtime: explicit override, bundled sidecar, then PATH —
/// the same discovery order as the Whisper runtime.
fn node_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("VIDEODIP_NODE")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return Some(path);
    }
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    if let Some(path) = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join(name)))
        .filter(|path| path.is_file())
    {
        return Some(path);
    }
    which_on_path(name)
}

/// Locates the built render CLI: explicit override, the bundled release
/// resource (`resources/render/dist/render-cli.js`, staged by
/// `pnpm render:stage:release:windows` and mapped beside the executable by
/// `tauri.release.conf.json`), then the monorepo build output on development
/// machines.
fn cli_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("VIDEODIP_RENDER_CLI")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return Some(path);
    }
    if let Some(path) = std::env::current_exe().ok().and_then(|path| {
        path.parent()
            .map(|parent| parent.join("render").join("dist").join("render-cli.js"))
    }) {
        if path.is_file() {
            return Some(path);
        }
    }
    #[cfg(debug_assertions)]
    {
        let development_cli =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../renderer/dist/render-cli.js");
        if development_cli.is_file() {
            return Some(development_cli);
        }
    }
    None
}

/// The render CLI's package root (`.../dist/render-cli.js` -> `...`) — both
/// the bundled release resource and the monorepo `apps/renderer` build
/// output share this `dist/render-cli.js` layout, and both have their own
/// `package.json` at this level.
///
/// Used as the spawned process's working directory: `@remotion/renderer`
/// resolves its Chrome Headless Shell cache by walking up from `cwd` to the
/// nearest `package.json` and looking under `<that dir>/node_modules/.remotion`
/// (see `get-download-destination.js` upstream). Leaving `cwd` unset inherits
/// whatever directory Tauri happened to launch from, which has no
/// relationship to where the render runtime — and its pre-downloaded browser
/// cache — actually live, so the browser would silently fail to resolve (or
/// resolve to the wrong, unprovisioned location) in a release build.
fn cli_package_root(cli: &PathBuf) -> Option<PathBuf> {
    cli.parent()?.parent().map(Path::to_path_buf)
}

/// Minimal PATH lookup; avoids adding a `which` dependency for one probe.
fn which_on_path(name: &str) -> Option<PathBuf> {
    let path_variable = std::env::var_os("PATH")?;
    std::env::split_paths(&path_variable)
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
}

#[cfg(test)]
mod tests {
    use super::parse_progress_line;

    #[test]
    fn parses_a_progress_line() {
        assert_eq!(parse_progress_line("progress=0.5000"), Some(0.5));
    }

    #[test]
    fn clamps_out_of_range_fractions() {
        assert_eq!(parse_progress_line("progress=7"), Some(1.0));
        assert_eq!(parse_progress_line("progress=-2"), Some(0.0));
    }

    #[test]
    fn ignores_unrelated_and_malformed_lines() {
        assert_eq!(parse_progress_line("browser=ready"), None);
        assert_eq!(parse_progress_line("progress=NaN"), None);
        assert_eq!(parse_progress_line("progress="), None);
    }
}
