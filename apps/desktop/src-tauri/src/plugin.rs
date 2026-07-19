//! Reads a local plugin's manifest and JS entrypoint from disk for the
//! ADR-0009 Phase 5 v1 sandboxed plugin runtime (see
//! `docs/adr/0009-phase-5-plugin-runtime-v1.md`).
//!
//! Desktop-only, local-folder installation: no registry, no download, no
//! signature verification. A dedicated command rather than the generic
//! `@tauri-apps/plugin-fs` — the same pattern every other host capability in
//! this app follows (`render.rs`, `whisper.rs`, `export.rs`) — keeps the
//! filesystem surface exposed to the webview to exactly the two files a
//! plugin needs, nothing broader.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPluginSource {
    manifest_json: String,
    entrypoint_source: String,
}

/// Reads `manifest.json` and the entrypoint file it declares from a plugin
/// folder. Validation of their contents (schema, capability grants) happens
/// in the webview via `@videodip/plugin-sdk` — this command only proves the
/// entrypoint path the manifest names cannot escape the plugin's own folder,
/// since that is the actual filesystem trust boundary crossing.
#[tauri::command]
pub fn load_plugin_from_folder(folder_path: String) -> Result<LoadedPluginSource, String> {
    let folder = PathBuf::from(&folder_path);
    let manifest_json = std::fs::read_to_string(folder.join("manifest.json")).map_err(|error| {
        format!("Could not read manifest.json in the selected folder: {error}")
    })?;

    let manifest: serde_json::Value = serde_json::from_str(&manifest_json)
        .map_err(|error| format!("manifest.json is not valid JSON: {error}"))?;
    let entrypoint = manifest
        .get("entrypoint")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "manifest.json is missing a string \"entrypoint\" field.".to_string())?;

    let entrypoint_path = resolve_within(&folder, entrypoint)?;
    let entrypoint_source = std::fs::read_to_string(&entrypoint_path)
        .map_err(|error| format!("Could not read the plugin entrypoint file: {error}"))?;

    Ok(LoadedPluginSource {
        manifest_json,
        entrypoint_source,
    })
}

/// Rejects an entrypoint path that would resolve outside the plugin's own
/// folder. The manifest schema already forbids `..` segments and absolute
/// paths (`packages/plugin-sdk`), but the Rust host re-checks independently
/// since crossing into the real filesystem is where that guarantee actually
/// matters.
fn resolve_within(folder: &Path, relative: &str) -> Result<PathBuf, String> {
    let candidate = folder.join(relative);
    let canonical_folder = folder
        .canonicalize()
        .map_err(|error| format!("The selected plugin folder is invalid: {error}"))?;
    let canonical_candidate = candidate.canonicalize().map_err(|error| {
        format!("Could not resolve the plugin entrypoint \"{relative}\": {error}")
    })?;
    if !canonical_candidate.starts_with(&canonical_folder) {
        return Err("The plugin entrypoint must stay inside the plugin folder.".to_string());
    }
    Ok(canonical_candidate)
}

#[cfg(test)]
mod tests {
    use super::load_plugin_from_folder;
    use std::fs;

    #[test]
    fn loads_a_valid_plugin_folder() {
        let dir = std::env::temp_dir().join(format!("videodip-plugin-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("manifest.json"),
            r#"{"apiVersion":1,"id":"videodip.test","name":"Test","version":"1.0.0","entrypoint":"index.js","surfaces":["subtitle-template"],"capabilities":["renderer.register"]}"#,
        )
        .unwrap();
        fs::write(dir.join("index.js"), "export const activate = async () => ({ok:true});").unwrap();

        let result = load_plugin_from_folder(dir.to_string_lossy().into_owned());
        fs::remove_dir_all(&dir).ok();

        let loaded = result.expect("expected a successful load");
        assert!(loaded.manifest_json.contains("videodip.test"));
        assert!(loaded.entrypoint_source.contains("activate"));
    }

    #[test]
    fn rejects_an_entrypoint_that_escapes_the_plugin_folder() {
        let dir = std::env::temp_dir().join(format!("videodip-plugin-escape-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("manifest.json"),
            r#"{"apiVersion":1,"id":"videodip.evil","name":"Evil","version":"1.0.0","entrypoint":"../../etc/passwd","surfaces":["subtitle-template"],"capabilities":[]}"#,
        )
        .unwrap();

        let result = load_plugin_from_folder(dir.to_string_lossy().into_owned());
        fs::remove_dir_all(&dir).ok();

        assert!(result.is_err());
    }
}
