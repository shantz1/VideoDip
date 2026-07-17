//! Thin FFprobe process adapter for the desktop host.
//!
//! Argument construction and JSON validation live in `@videodip/media-engine`;
//! this module only executes the process and returns stdout to the webview.

use std::process::{Command, Stdio};

/// Executes FFprobe with a prevalidated argv and returns its JSON stdout.
#[tauri::command]
pub async fn probe_media(args: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || run_ffprobe(&args))
        .await
        .map_err(|error| format!("The media probe task crashed: {error}. Try importing again."))?
}

fn run_ffprobe(args: &[String]) -> Result<String, String> {
    let mut command = Command::new("ffprobe");
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

    let output = command.output().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "FFprobe was not found. Install FFmpeg (which includes FFprobe), then import again."
                .to_string()
        } else {
            format!("Could not start FFprobe: {error}. Try importing the file again.")
        }
    })?;

    if output.status.success() {
        String::from_utf8(output.stdout).map_err(|error| {
            format!("FFprobe returned unreadable metadata: {error}. Try a different media file.")
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail = stderr
            .lines()
            .rev()
            .take(8)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        Err(format!(
            "FFprobe could not read this media:\n{tail}\nTry a different file or codec."
        ))
    }
}
