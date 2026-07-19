//! Offline multilingual whisper.cpp adapter with verified, atomic model downloads.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const MODEL_DIRECTORY: &str = "whisper-models";

#[derive(Clone, Copy)]
struct ModelSpec {
    id: &'static str,
    file: &'static str,
    bytes: u64,
    sha1: &'static str,
    quality: &'static str,
}

const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny",
        file: "ggml-tiny.bin",
        bytes: 75 * 1024 * 1024,
        sha1: "bd577a113a864445d4c299885e0cb97d4ba92b5f",
        quality: "Fastest",
    },
    ModelSpec {
        id: "base",
        file: "ggml-base.bin",
        bytes: 142 * 1024 * 1024,
        sha1: "465707469ff3a37a2b9b8d8f89f2f99de7299dac",
        quality: "Fast",
    },
    ModelSpec {
        id: "small-q5_1",
        file: "ggml-small-q5_1.bin",
        bytes: 181 * 1024 * 1024,
        sha1: "6fe57ddcfdd1c6b07cdcc73aaf620810ce5fc771",
        quality: "Recommended",
    },
    ModelSpec {
        id: "medium-q5_0",
        file: "ggml-medium-q5_0.bin",
        bytes: 514 * 1024 * 1024,
        sha1: "7718d4c1ec62ca96998f058114db98236937490e",
        quality: "Higher accuracy",
    },
    ModelSpec {
        id: "large-v3-turbo-q5_0",
        file: "ggml-large-v3-turbo-q5_0.bin",
        bytes: 547 * 1024 * 1024,
        sha1: "e050f7970618a659205450ad97eb95a18d69c9ee",
        quality: "Best practical",
    },
];

struct Task {
    cancelled: Arc<AtomicBool>,
    child: Option<Arc<Mutex<Child>>>,
}

#[derive(Clone, Default)]
pub struct WhisperTaskRegistry(Arc<Mutex<HashMap<String, Task>>>);

impl WhisperTaskRegistry {
    fn begin(&self, id: &str) -> Result<Arc<AtomicBool>, String> {
        crate::artifact::validate_task_id(id)?;
        let cancelled = Arc::new(AtomicBool::new(false));
        let mut tasks = self
            .0
            .lock()
            .map_err(|_| "Whisper task state is unavailable.".to_string())?;
        if tasks
            .insert(
                id.into(),
                Task {
                    cancelled: cancelled.clone(),
                    child: None,
                },
            )
            .is_some()
        {
            return Err("A Whisper task with this id is already active.".into());
        }
        Ok(cancelled)
    }
    fn child(&self, id: &str, child: Arc<Mutex<Child>>) -> Result<(), String> {
        let mut tasks = self
            .0
            .lock()
            .map_err(|_| "Whisper task state is unavailable.".to_string())?;
        let task = tasks
            .get_mut(id)
            .ok_or_else(|| "Whisper task was cancelled.".to_string())?;
        task.child = Some(child);
        Ok(())
    }
    fn cancel(&self, id: &str) -> Result<(), String> {
        crate::artifact::validate_task_id(id)?;
        let child = {
            let tasks = self
                .0
                .lock()
                .map_err(|_| "Whisper task state is unavailable.".to_string())?;
            tasks.get(id).and_then(|task| {
                task.cancelled.store(true, Ordering::SeqCst);
                task.child.clone()
            })
        };
        if let Some(child) = child {
            child
                .lock()
                .map_err(|_| "Whisper process is unavailable.".to_string())?
                .kill()
                .ok();
        }
        Ok(())
    }
    fn finish(&self, id: &str) {
        if let Ok(mut tasks) = self.0.lock() {
            tasks.remove(id);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    id: String,
    size_bytes: u64,
    quality: String,
    installed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperStatus {
    runtime_available: bool,
    models: Vec<ModelStatus>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    task_id: String,
    stage: String,
    fraction: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeRequest {
    source: String,
    model_id: String,
    language: Option<String>,
    prompt: Option<String>,
}

#[tauri::command]
pub fn get_whisper_status(app: AppHandle) -> Result<WhisperStatus, String> {
    let root = model_root(&app)?;
    Ok(WhisperStatus {
        runtime_available: runtime_path().is_some(),
        models: MODELS
            .iter()
            .map(|model| ModelStatus {
                id: model.id.into(),
                size_bytes: model.bytes,
                quality: model.quality.into(),
                installed: root.join(model.file).is_file(),
            })
            .collect(),
    })
}

#[tauri::command]
pub async fn download_whisper_model(
    app: AppHandle,
    registry: State<'_, WhisperTaskRegistry>,
    task_id: String,
    model_id: String,
) -> Result<(), String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        download_model(&app, &registry, &task_id, &model_id)
    })
    .await
    .map_err(|error| format!("Model download crashed: {error}"))?
}

#[tauri::command]
pub fn delete_whisper_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let model = model(&model_id)?;
    match fs::remove_file(model_root(&app)?.join(model.file)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not delete the model: {error}")),
    }
}

#[tauri::command]
pub fn cancel_whisper_task(
    registry: State<'_, WhisperTaskRegistry>,
    task_id: String,
) -> Result<(), String> {
    registry.cancel(&task_id)
}

#[tauri::command]
pub async fn transcribe_media(
    app: AppHandle,
    registry: State<'_, WhisperTaskRegistry>,
    task_id: String,
    request: TranscribeRequest,
) -> Result<Value, String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || transcribe(&app, &registry, &task_id, request))
        .await
        .map_err(|error| format!("Transcription task crashed: {error}"))?
}

fn download_model(
    app: &AppHandle,
    registry: &WhisperTaskRegistry,
    task_id: &str,
    model_id: &str,
) -> Result<(), String> {
    let cancelled = registry.begin(task_id)?;
    let pending = model(model_id).and_then(|spec| {
        model_root(app).map(|root| root.join(format!(".{}.download", spec.file)))
    })?;
    let result = (|| {
        let spec = model(model_id)?;
        let root = model_root(app)?;
        fs::create_dir_all(&root)
            .map_err(|error| format!("Could not create model storage: {error}"))?;
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(60 * 60))
            .user_agent("VideoDip/0.1")
            .build()
            .map_err(|error| format!("Could not initialize model downloads: {error}"))?;
        let mut response = client
            .get(format!(
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
                spec.file
            ))
            .send()
            .map_err(|error| format!("Could not download the model: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Model server returned {}. Retry later.",
                response.status()
            ));
        }
        let total = response.content_length().unwrap_or(spec.bytes);
        let mut output = File::create(&pending)
            .map_err(|error| format!("Could not stage the model: {error}"))?;
        let mut hash = Sha1::new();
        let mut done = 0_u64;
        let mut buffer = [0_u8; 128 * 1024];
        loop {
            if cancelled.load(Ordering::SeqCst) {
                return Err("Model download was cancelled.".into());
            }
            let count = response
                .read(&mut buffer)
                .map_err(|error| format!("Model download failed: {error}"))?;
            if count == 0 {
                break;
            }
            output
                .write_all(&buffer[..count])
                .map_err(|error| format!("Could not write the model: {error}"))?;
            hash.update(&buffer[..count]);
            done += count as u64;
            emit(
                app,
                task_id,
                "Downloading model",
                done as f64 / total.max(1) as f64,
            );
        }
        output
            .sync_all()
            .map_err(|error| format!("Could not finalize the model: {error}"))?;
        let actual = format!("{:x}", hash.finalize());
        if actual != spec.sha1 {
            return Err("Model checksum failed. Retry the download.".into());
        }
        fs::rename(&pending, root.join(spec.file))
            .map_err(|error| format!("Could not install the model: {error}"))?;
        emit(app, task_id, "Model ready", 1.0);
        Ok(())
    })();
    if result.is_err() {
        fs::remove_file(pending).ok();
    }
    registry.finish(task_id);
    result
}

fn transcribe(
    app: &AppHandle,
    registry: &WhisperTaskRegistry,
    task_id: &str,
    request: TranscribeRequest,
) -> Result<Value, String> {
    let cancelled = registry.begin(task_id)?;
    let work = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("whisper-staging")
        .join(task_id);
    let result = (|| {
        let source = Path::new(&request.source);
        if !source.is_file() {
            return Err("Source media is missing. Re-import it.".into());
        }
        let spec = model(&request.model_id)?;
        let model_path = model_root(app)?.join(spec.file);
        if !model_path.is_file() {
            return Err("Download the selected Whisper model first.".into());
        }
        let runtime = runtime_path().ok_or_else(|| {
            "whisper-cli is not bundled. Install the VideoDip AI runtime build.".to_string()
        })?;
        fs::create_dir_all(&work)
            .map_err(|error| format!("Could not create transcription staging: {error}"))?;
        let wav = work.join("audio.wav");
        emit(app, task_id, "Extracting audio", 0.03);
        run_child(
            registry,
            task_id,
            &cancelled,
            "ffmpeg",
            &[
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                &request.source,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                wav.to_string_lossy().as_ref(),
            ],
            None,
        )?;
        emit(app, task_id, "Transcribing", 0.15);
        let output_base = work.join("result");
        let mut args = vec![
            "-m".into(),
            model_path.to_string_lossy().into_owned(),
            "-f".into(),
            wav.to_string_lossy().into_owned(),
            "-ojf".into(),
            "-of".into(),
            output_base.to_string_lossy().into_owned(),
            "-l".into(),
            request.language.unwrap_or_else(|| "auto".into()),
            "-ml".into(),
            "42".into(),
            "-sow".into(),
            "-np".into(),
            "-pp".into(),
            // Non-speech tokens (music, noise) are the usual trigger for
            // whisper's repeated-character hallucination loops.
            "--suppress-nst".into(),
            // whisper-cli defaults to 4 threads no matter the machine;
            // matching the CPU roughly doubles throughput on 8+ core boxes.
            "-t".into(),
            transcription_thread_count(
                std::thread::available_parallelism().map_or(4, |value| value.get()),
            )
            .to_string(),
        ];
        if let Some(prompt) = request.prompt.filter(|value| !value.trim().is_empty()) {
            args.extend(["--prompt".into(), prompt]);
        }
        let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_child(
            registry,
            task_id,
            &cancelled,
            runtime.to_string_lossy().as_ref(),
            &refs,
            Some((app, task_id)),
        )?;
        emit(app, task_id, "Reading timestamps", 0.98);
        let bytes = fs::read(output_base.with_extension("json"))
            .map_err(|error| format!("Whisper output is missing: {error}"))?;
        let value = parse_whisper_output(&bytes)?;
        emit(app, task_id, "Complete", 1.0);
        Ok(value)
    })();
    fs::remove_dir_all(work).ok();
    registry.finish(task_id);
    result
}

fn run_child(
    registry: &WhisperTaskRegistry,
    id: &str,
    cancelled: &AtomicBool,
    program: &str,
    args: &[&str],
    progress: Option<(&AppHandle, &str)>,
) -> Result<(), String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(if progress.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start {program}: {error}"))?;
    let progress_reader = progress.and_then(|(app, task_id)| {
        child.stderr.take().map(|stderr| {
            let app = app.clone();
            let task_id = task_id.to_string();
            std::thread::spawn(move || {
                read_progress_stream(BufReader::new(stderr), |percent| {
                    emit(&app, &task_id, "Transcribing", 0.15 + percent * 0.82);
                });
            })
        })
    });
    let child = Arc::new(Mutex::new(child));
    registry.child(id, child.clone())?;
    loop {
        if cancelled.load(Ordering::SeqCst) {
            child.lock().ok().and_then(|mut value| value.kill().ok());
            if let Some(reader) = progress_reader {
                reader.join().ok();
            }
            return Err("Transcription was cancelled.".into());
        }
        if let Some(status) = child
            .lock()
            .map_err(|_| "Process state is unavailable.".to_string())?
            .try_wait()
            .map_err(|error| error.to_string())?
        {
            if let Some(reader) = progress_reader {
                reader.join().ok();
            }
            return if status.success() {
                Ok(())
            } else {
                Err(format!(
                    "{program} failed. Check the source format and runtime."
                ))
            };
        }
        std::thread::sleep(Duration::from_millis(30));
    }
}

fn read_progress_stream(mut reader: impl Read, mut on_progress: impl FnMut(f64)) {
    let mut chunk = [0_u8; 1024];
    let mut pending = Vec::new();
    loop {
        let count = match reader.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(count) => count,
        };
        for byte in &chunk[..count] {
            if *byte == b'\r' || *byte == b'\n' {
                if !pending.is_empty() {
                    if let Some(percent) =
                        parse_progress_percent(&String::from_utf8_lossy(&pending))
                    {
                        on_progress(percent);
                    }
                    pending.clear();
                }
            } else {
                pending.push(*byte);
            }
        }
    }
    if let Some(percent) = parse_progress_percent(&String::from_utf8_lossy(&pending)) {
        on_progress(percent);
    }
}

// whisper.cpp's BPE tokenizer splits multibyte scripts (Devanagari, CJK, …)
// mid-character, so token-level "text" fields in the full-JSON output can hold
// invalid UTF-8 fragments. Strict parsing would reject the entire otherwise
// valid transcription; lossy conversion turns only those fragments into U+FFFD,
// which the frontend detects and repairs from the intact segment text.
fn parse_whisper_output(bytes: &[u8]) -> Result<Value, String> {
    serde_json::from_str(&String::from_utf8_lossy(bytes))
        .map_err(|error| format!("Whisper output is invalid: {error}"))
}

fn parse_progress_percent(line: &str) -> Option<f64> {
    let before_percent = line.split('%').next()?;
    let digits = before_percent
        .chars()
        .rev()
        .take_while(|character| character.is_ascii_digit() || character.is_ascii_whitespace())
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    digits
        .trim()
        .parse::<f64>()
        .ok()
        .map(|value| (value / 100.0).clamp(0.0, 1.0))
}

fn model(id: &str) -> Result<ModelSpec, String> {
    MODELS
        .iter()
        .copied()
        .find(|model| model.id == id)
        .ok_or_else(|| "Unknown Whisper model.".to_string())
}
fn model_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(MODEL_DIRECTORY))
        .map_err(|error| error.to_string())
}
/// Worker threads for whisper-cli, from the machine's logical CPU count.
///
/// Two cores stay free so the editor UI never starves during a long
/// transcription; the ceiling reflects whisper.cpp's memory-bound encoder,
/// which stops scaling around eight threads.
/// Threads leave 2 cores free for the OS/UI, then clamp to a range where
/// whisper.cpp's matmul kernels still scale roughly linearly. The old
/// ceiling of 8 was set before modern 12-24 logical-core creator machines
/// were common; whisper.cpp's own benchmarks continue to show throughput
/// gains up to ~16 threads before memory-bandwidth contention dominates, so
/// raising the ceiling (not the floor — small machines are unaffected)
/// meaningfully speeds up transcription on today's typical hardware.
fn transcription_thread_count(available: usize) -> usize {
    available.saturating_sub(2).clamp(4, 16)
}

fn runtime_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("VIDEODIP_WHISPER_CLI")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return Some(path);
    }
    let name = if cfg!(windows) {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    if let Some(path) = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join(name)))
        .filter(|path| path.is_file())
    {
        return Some(path);
    }
    #[cfg(all(debug_assertions, target_os = "windows"))]
    {
        let development_runtime = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join("whisper-cli-x86_64-pc-windows-msvc.exe");
        if development_runtime.is_file() {
            return Some(development_runtime);
        }
    }
    Command::new(name)
        .arg("--help")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .map(|_| PathBuf::from(name))
}
fn emit(app: &AppHandle, task_id: &str, stage: &str, fraction: f64) {
    let _ = app.emit(
        "whisper-progress",
        Progress {
            task_id: task_id.into(),
            stage: stage.into(),
            fraction: fraction.clamp(0.0, 1.0),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_catalog_is_multilingual_only() {
        assert!(MODELS.iter().all(|model| !model.file.contains(".en")));
        assert!(model("small-q5_1").is_ok());
    }
    #[test]
    fn thread_count_leaves_headroom_and_respects_scaling_limits() {
        assert_eq!(transcription_thread_count(2), 4);
        assert_eq!(transcription_thread_count(4), 4);
        assert_eq!(transcription_thread_count(8), 6);
        assert_eq!(transcription_thread_count(12), 10);
        assert_eq!(transcription_thread_count(24), 16);
        assert_eq!(transcription_thread_count(32), 16);
    }

    #[test]
    fn parses_native_progress_lines() {
        assert_eq!(
            parse_progress_percent("whisper_print_progress_callback: progress =  42%"),
            Some(0.42)
        );
        assert_eq!(parse_progress_percent("not progress"), None);
    }

    #[test]
    fn streams_carriage_return_progress_before_process_exit() {
        let source = b"progress =  12%\rprogress =  42%\rprogress = 100%\n";
        let mut observed = Vec::new();
        read_progress_stream(&source[..], |percent| observed.push(percent));
        assert_eq!(observed, vec![0.12, 0.42, 1.0]);
    }

    #[test]
    fn accepts_split_multibyte_token_bytes_in_whisper_json() {
        // "नमस्ते" tokenized by BPE splits the first character's three UTF-8
        // bytes across two tokens: [E0, A4] and [A8, ...]. Neither token text
        // is valid UTF-8 on its own.
        let mut broken = Vec::new();
        broken.extend_from_slice(b"{\"tokens\":[{\"text\":\"");
        broken.extend_from_slice(&[0xE0, 0xA4]);
        broken.extend_from_slice(b"\"},{\"text\":\"");
        broken.extend_from_slice(&[0xA8]);
        broken.extend_from_slice(b"\"}],\"text\":\"\xE0\xA4\xA8\"}");

        assert!(serde_json::from_slice::<Value>(&broken).is_err());

        let value = parse_whisper_output(&broken).expect("lossy parse succeeds");
        assert_eq!(value["text"], "न");
        let fragment = value["tokens"][0]["text"].as_str().expect("token text");
        assert!(fragment.contains('\u{FFFD}'));
    }
}
