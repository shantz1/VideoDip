use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{Read, Seek, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const ARCHIVE_FORMAT: &str = "videodip-project";
const ARCHIVE_VERSION: u32 = 1;
const PROJECT_FILE: &str = "project.json";
const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES: u64 = 100 * 1024 * 1024 * 1024;
const EMPTY_INDEX: &[u8] = br#"{"version":1,"entries":[]}"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArchiveManifest {
    format: String,
    version: u32,
    created_at: String,
    project: Value,
    media: Vec<ArchiveMediaEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArchiveMediaEntry {
    asset_id: String,
    original_name: String,
    original_locator: String,
    embedded_path: Option<String>,
    size_bytes: Option<u64>,
}

#[derive(Debug)]
struct SnapshotMedia {
    asset_id: String,
    name: String,
    locator: String,
}

fn required_string<'a>(value: &'a Value, field: &str) -> Result<&'a str, String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| format!("Project field {field} must be a non-empty string."))
}

fn snapshot_media(project: &Value) -> Result<Vec<SnapshotMedia>, String> {
    if project.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Only project snapshot version 1 can be archived.".to_string());
    }
    required_string(project, "id")?;
    required_string(project, "name")?;
    let items = project
        .get("mediaItems")
        .and_then(Value::as_array)
        .ok_or_else(|| "Project mediaItems must be an array.".to_string())?;
    let mut ids = HashSet::new();
    items
        .iter()
        .map(|item| {
            let asset_id = required_string(item, "id")?.to_string();
            if !ids.insert(asset_id.clone()) {
                return Err(format!("Duplicate media asset id {asset_id}."));
            }
            Ok(SnapshotMedia {
                asset_id,
                name: required_string(item, "name")?.to_string(),
                locator: required_string(item, "locator")?.to_string(),
            })
        })
        .collect()
}

fn safe_file_name(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("media");
    let mut safe = base
        .chars()
        .take(160)
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if safe.is_empty() || safe == "." || safe == ".." {
        safe = "media".to_string();
    }
    safe
}

fn archive_asset_path(index: usize, name: &str) -> String {
    format!("assets/{index:04}-{}", safe_file_name(name))
}

fn stored_options(size: u64) -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .unix_permissions(0o644)
        .large_file(size > u32::MAX as u64)
}

fn add_bytes<W: Write + Seek>(
    writer: &mut ZipWriter<W>,
    name: &str,
    bytes: &[u8],
) -> Result<(), String> {
    writer
        .start_file(name, stored_options(bytes.len() as u64))
        .map_err(|error| format!("Could not start archive entry {name}: {error}"))?;
    writer
        .write_all(bytes)
        .map_err(|error| format!("Could not write archive entry {name}: {error}"))
}

fn write_archive<W: Write + Seek>(
    output: W,
    project: &Value,
    include_media: bool,
    created_at: &str,
) -> Result<(), String> {
    let media = snapshot_media(project)?;
    let mut manifest_media = Vec::with_capacity(media.len());
    let mut embedded_sources: Vec<(String, PathBuf, u64)> = Vec::new();
    let mut embedded_by_locator: HashMap<String, (String, u64)> = HashMap::new();

    for (index, item) in media.iter().enumerate() {
        let embedded = if include_media {
            if let Some(existing) = embedded_by_locator.get(&item.locator) {
                Some(existing.clone())
            } else {
                let source = PathBuf::from(&item.locator);
                let metadata = fs::metadata(&source).map_err(|error| {
                    format!(
                        "Could not package media {} at {}: {error}",
                        item.name, item.locator
                    )
                })?;
                if !metadata.is_file() {
                    return Err(format!("Media source {} is not a file.", item.locator));
                }
                let path = archive_asset_path(index, &item.name);
                let embedded = (path.clone(), metadata.len());
                embedded_sources.push((path, source, metadata.len()));
                embedded_by_locator.insert(item.locator.clone(), embedded.clone());
                Some(embedded)
            }
        } else {
            None
        };
        manifest_media.push(ArchiveMediaEntry {
            asset_id: item.asset_id.clone(),
            original_name: item.name.clone(),
            original_locator: item.locator.clone(),
            embedded_path: embedded.as_ref().map(|(path, _)| path.clone()),
            size_bytes: embedded.map(|(_, size)| size),
        });
    }

    let manifest = ArchiveManifest {
        format: ARCHIVE_FORMAT.to_string(),
        version: ARCHIVE_VERSION,
        created_at: created_at.to_string(),
        project: project.clone(),
        media: manifest_media,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("Could not encode project.json: {error}"))?;
    if manifest_bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("project.json exceeds the 16 MiB safety limit.".to_string());
    }

    let mut writer = ZipWriter::new(output);
    add_bytes(&mut writer, PROJECT_FILE, &manifest_bytes)?;
    add_bytes(&mut writer, "subtitles/index.json", EMPTY_INDEX)?;
    add_bytes(&mut writer, "previews/index.json", EMPTY_INDEX)?;
    add_bytes(&mut writer, "cache/index.json", EMPTY_INDEX)?;
    for (archive_path, source_path, size) in embedded_sources {
        writer
            .start_file(&archive_path, stored_options(size))
            .map_err(|error| format!("Could not start media entry {archive_path}: {error}"))?;
        let mut source = File::open(&source_path).map_err(|error| {
            format!(
                "Could not open media source {}: {error}",
                source_path.display()
            )
        })?;
        std::io::copy(&mut source, &mut writer)
            .map_err(|error| format!("Could not stream media entry {archive_path}: {error}"))?;
    }
    writer
        .finish()
        .map_err(|error| format!("Could not finalize the VideoDip archive: {error}"))?;
    Ok(())
}

fn is_allowed_entry(name: &str) -> bool {
    if name.contains('\\') {
        return false;
    }
    let path = Path::new(name);
    if path
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return false;
    }
    matches!(
        name,
        PROJECT_FILE | "subtitles/index.json" | "previews/index.json" | "cache/index.json"
    ) || (name.starts_with("assets/") && path.components().count() == 2)
}

fn validate_archive_entries<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
) -> Result<HashSet<String>, String> {
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(format!(
            "Archive contains more than {MAX_ARCHIVE_ENTRIES} entries."
        ));
    }
    let mut names = HashSet::new();
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Could not inspect archive entry {index}: {error}"))?;
        let name = entry.name().to_string();
        if entry.is_dir() || !is_allowed_entry(&name) {
            return Err(format!("Archive entry {name} is not allowed."));
        }
        if !names.insert(name.clone()) {
            return Err(format!("Archive contains duplicate entry {name}."));
        }
        total_size = total_size
            .checked_add(entry.size())
            .ok_or_else(|| "Archive size overflowed its safety counter.".to_string())?;
        if total_size > MAX_TOTAL_UNCOMPRESSED_BYTES {
            return Err("Archive exceeds the 100 GiB uncompressed safety limit.".to_string());
        }
    }
    for required in [
        PROJECT_FILE,
        "subtitles/index.json",
        "previews/index.json",
        "cache/index.json",
    ] {
        if !names.contains(required) {
            return Err(format!(
                "Archive does not contain required entry {required}."
            ));
        }
    }
    Ok(names)
}

fn read_manifest<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<ArchiveManifest, String> {
    let mut project_file = archive
        .by_name(PROJECT_FILE)
        .map_err(|error| format!("Could not read project.json: {error}"))?;
    if project_file.size() > MAX_MANIFEST_BYTES {
        return Err("project.json exceeds the 16 MiB safety limit.".to_string());
    }
    let mut bytes = Vec::with_capacity(project_file.size() as usize);
    project_file
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not load project.json: {error}"))?;
    let manifest: ArchiveManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("project.json is invalid: {error}"))?;
    if manifest.format != ARCHIVE_FORMAT || manifest.version != ARCHIVE_VERSION {
        return Err(format!(
            "Unsupported VideoDip archive format/version: {}/{}.",
            manifest.format, manifest.version
        ));
    }
    Ok(manifest)
}

fn validate_manifest(
    manifest: &ArchiveManifest,
    archive_names: &HashSet<String>,
) -> Result<Vec<SnapshotMedia>, String> {
    let media = snapshot_media(&manifest.project)?;
    if media.len() != manifest.media.len() {
        return Err("Archive media map does not match project mediaItems.".to_string());
    }
    let project_by_id = media
        .iter()
        .map(|item| (item.asset_id.as_str(), item))
        .collect::<HashMap<_, _>>();
    let mut manifest_ids = HashSet::new();
    let mut embedded_paths = HashSet::new();
    if manifest.created_at.trim().is_empty() {
        return Err("Archive createdAt must not be empty.".to_string());
    }
    for entry in &manifest.media {
        if !manifest_ids.insert(entry.asset_id.as_str()) {
            return Err(format!(
                "Archive media map duplicates asset {}.",
                entry.asset_id
            ));
        }
        let project_item = project_by_id.get(entry.asset_id.as_str()).ok_or_else(|| {
            format!(
                "Archive media asset {} is not in the project.",
                entry.asset_id
            )
        })?;
        if entry.original_name != project_item.name
            || entry.original_locator != project_item.locator
        {
            return Err(format!(
                "Archive media metadata for {} is inconsistent.",
                entry.asset_id
            ));
        }
        if let Some(path) = &entry.embedded_path {
            if !is_allowed_entry(path)
                || !path.starts_with("assets/")
                || !archive_names.contains(path)
            {
                return Err(format!("Embedded media entry {path} is missing or unsafe."));
            }
            if entry.size_bytes.is_none() {
                return Err(format!("Embedded media entry {path} has no declared size."));
            }
            embedded_paths.insert(path.as_str());
        } else if entry.size_bytes.is_some() {
            return Err(format!(
                "Linked media {} declares a size without embedded data.",
                entry.asset_id
            ));
        }
    }
    let archived_asset_paths = archive_names
        .iter()
        .filter(|name| name.starts_with("assets/"))
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if archived_asset_paths != embedded_paths {
        return Err("Archive contains unreferenced or missing embedded assets.".to_string());
    }
    Ok(media)
}

fn unique_import_directory(base: &Path, project_id: &str) -> Result<PathBuf, String> {
    let mut hasher = DefaultHasher::new();
    project_id.hash(&mut hasher);
    let project_hash = hasher.finish();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock cannot create an import directory: {error}"))?
        .as_nanos();
    Ok(base
        .join("imported-assets")
        .join(format!("{project_hash:016x}-{timestamp:032x}")))
}

fn validated_archive<R: Read + Seek>(
    input: R,
) -> Result<(ZipArchive<R>, ArchiveManifest, Vec<SnapshotMedia>), String> {
    let mut archive =
        ZipArchive::new(input).map_err(|error| format!("Not a valid ZIP archive: {error}"))?;
    let names = validate_archive_entries(&mut archive)?;
    let manifest = read_manifest(&mut archive)?;
    let media = validate_manifest(&manifest, &names)?;
    Ok((archive, manifest, media))
}

fn inspect_archive<R: Read + Seek>(input: R) -> Result<Value, String> {
    let (_, manifest, _) = validated_archive(input)?;
    Ok(manifest.project)
}

fn read_archive<R: Read + Seek>(
    input: R,
    extraction_base: &Path,
    expected_project: &Value,
) -> Result<Value, String> {
    let (mut archive, manifest, media) = validated_archive(input)?;
    if &manifest.project != expected_project {
        return Err(
            "Archive contents changed after validation; no media was extracted.".to_string(),
        );
    }
    let project_id = required_string(&manifest.project, "id")?;
    let extraction_directory = unique_import_directory(extraction_base, project_id)?;
    let mut rewritten_locators = HashMap::new();

    let extraction_result = (|| -> Result<(), String> {
        for (index, entry) in manifest.media.iter().enumerate() {
            let Some(archive_path) = &entry.embedded_path else {
                continue;
            };
            fs::create_dir_all(&extraction_directory).map_err(|error| {
                format!(
                    "Could not create imported-media directory {}: {error}",
                    extraction_directory.display()
                )
            })?;
            let output_path = extraction_directory.join(format!(
                "{index:04}-{}",
                safe_file_name(&entry.original_name)
            ));
            let mut source = archive.by_name(archive_path).map_err(|error| {
                format!("Could not read embedded media {archive_path}: {error}")
            })?;
            if Some(source.size()) != entry.size_bytes {
                return Err(format!("Embedded media size mismatch for {archive_path}."));
            }
            let mut output = File::create(&output_path).map_err(|error| {
                format!(
                    "Could not create imported media {}: {error}",
                    output_path.display()
                )
            })?;
            std::io::copy(&mut source, &mut output).map_err(|error| {
                format!("Could not extract embedded media {archive_path}: {error}")
            })?;
            rewritten_locators.insert(
                entry.asset_id.clone(),
                output_path.to_string_lossy().into_owned(),
            );
        }
        Ok(())
    })();
    if let Err(error) = extraction_result {
        let _ = fs::remove_dir_all(&extraction_directory);
        return Err(error);
    }

    let mut project = manifest.project;
    let project_media = project
        .get_mut("mediaItems")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Project mediaItems must be an array.".to_string())?;
    for (item, parsed) in project_media.iter_mut().zip(media) {
        if let Some(locator) = rewritten_locators.get(&parsed.asset_id) {
            item.as_object_mut()
                .ok_or_else(|| "Project media item must be an object.".to_string())?
                .insert("locator".to_string(), Value::String(locator.clone()));
        }
    }
    Ok(project)
}

fn temporary_archive_path(destination: &Path) -> Result<PathBuf, String> {
    let file_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Archive destination must have a valid file name.".to_string())?;
    Ok(destination.with_file_name(format!(".{file_name}.tmp")))
}

#[tauri::command]
pub fn export_project_archive(
    snapshot: Value,
    destination: String,
    include_media: bool,
) -> Result<String, String> {
    let destination = PathBuf::from(destination);
    let temporary = temporary_archive_path(&destination)?;
    if temporary.exists() {
        fs::remove_file(&temporary)
            .map_err(|error| format!("Could not remove stale archive temp file: {error}"))?;
    }
    let created_at = snapshot
        .get("updatedAt")
        .and_then(Value::as_str)
        .unwrap_or("1970-01-01T00:00:00.000Z");
    let result = File::create(&temporary)
        .map_err(|error| format!("Could not create archive temp file: {error}"))
        .and_then(|file| write_archive(file, &snapshot, include_media, created_at));
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    if destination.exists() {
        fs::remove_file(&destination)
            .map_err(|error| format!("Could not replace the existing archive: {error}"))?;
    }
    fs::rename(&temporary, &destination)
        .map_err(|error| format!("Could not finalize the archive file: {error}"))?;
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn inspect_project_archive(source: String) -> Result<Value, String> {
    let file = File::open(&source)
        .map_err(|error| format!("Could not open the VideoDip archive: {error}"))?;
    inspect_archive(file)
}

#[tauri::command]
pub fn import_project_archive(
    app: AppHandle,
    source: String,
    expected_snapshot: Value,
) -> Result<Value, String> {
    let file = File::open(&source)
        .map_err(|error| format!("Could not open the VideoDip archive: {error}"))?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve VideoDip app data: {error}"))?;
    read_archive(file, &app_data, &expected_snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Cursor;

    fn test_directory(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should work")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("videodip-{label}-{unique}"));
        fs::create_dir_all(&directory).expect("test directory should be created");
        directory
    }

    fn snapshot(locator: &Path) -> Value {
        json!({
            "version": 1,
            "id": "project-a",
            "name": "Archive test",
            "aspectRatio": "9:16",
            "timeline": { "tracks": [] },
            "mediaItems": [{
                "id": "asset-a",
                "locator": locator.to_string_lossy(),
                "name": "source.mp4",
                "kind": "video",
                "duration": null,
                "metadata": null
            }],
            "createdAt": "2026-07-17T10:00:00.000Z",
            "updatedAt": "2026-07-17T10:01:00.000Z"
        })
    }

    #[test]
    fn embedded_media_round_trips_and_relinks() {
        let root = test_directory("archive-round-trip");
        let source = root.join("source.mp4");
        fs::write(&source, b"fake-video-bytes").expect("test media should be written");
        let mut archive_bytes = Cursor::new(Vec::new());
        write_archive(
            &mut archive_bytes,
            &snapshot(&source),
            true,
            "2026-07-17T10:01:00.000Z",
        )
        .expect("archive should export");
        let bytes = archive_bytes.into_inner();
        let inspected =
            inspect_archive(Cursor::new(bytes.clone())).expect("archive should inspect");
        let imported =
            read_archive(Cursor::new(bytes), &root, &inspected).expect("archive should import");
        let locator = imported["mediaItems"][0]["locator"]
            .as_str()
            .expect("imported locator should exist");
        assert_ne!(locator, source.to_string_lossy());
        assert_eq!(
            fs::read(locator).expect("embedded media should be extracted"),
            b"fake-video-bytes"
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn linked_archive_preserves_original_locator() {
        let root = test_directory("archive-linked");
        let source = root.join("source.mp4");
        let project = snapshot(&source);
        let mut bytes = Cursor::new(Vec::new());
        write_archive(&mut bytes, &project, false, "2026-07-17T10:01:00.000Z")
            .expect("linked archive should export without reading media");
        let bytes = bytes.into_inner();
        let inspected =
            inspect_archive(Cursor::new(bytes.clone())).expect("archive should inspect");
        let imported =
            read_archive(Cursor::new(bytes), &root, &inspected).expect("archive should import");
        assert_eq!(
            imported["mediaItems"][0]["locator"],
            project["mediaItems"][0]["locator"]
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn rejects_traversal_entries_before_extraction() {
        let root = test_directory("archive-traversal");
        let cursor = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(cursor);
        add_bytes(&mut writer, "../outside.txt", b"unsafe").expect("test zip should write");
        let mut cursor = writer.finish().expect("test zip should finish");
        cursor.set_position(0);
        let error = inspect_archive(cursor).expect_err("traversal must be rejected");
        assert!(error.contains("not allowed"));
        assert!(!root.join("outside.txt").exists());
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn rejects_unknown_archive_versions() {
        let root = test_directory("archive-version");
        let manifest = json!({
            "format": ARCHIVE_FORMAT,
            "version": 99,
            "createdAt": "2026-07-17T10:01:00.000Z",
            "project": snapshot(Path::new("missing.mp4")),
            "media": []
        });
        let cursor = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(cursor);
        add_bytes(
            &mut writer,
            PROJECT_FILE,
            &serde_json::to_vec(&manifest).expect("manifest should encode"),
        )
        .expect("test zip should write");
        add_bytes(&mut writer, "subtitles/index.json", EMPTY_INDEX)
            .expect("subtitle index should write");
        add_bytes(&mut writer, "previews/index.json", EMPTY_INDEX)
            .expect("preview index should write");
        add_bytes(&mut writer, "cache/index.json", EMPTY_INDEX).expect("cache index should write");
        let mut cursor = writer.finish().expect("test zip should finish");
        cursor.set_position(0);
        let error = inspect_archive(cursor).expect_err("version must be rejected");
        assert!(error.contains("Unsupported VideoDip archive"));
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn rejects_unreferenced_embedded_assets() {
        let root = test_directory("archive-unreferenced");
        let project = snapshot(Path::new("linked-source.mp4"));
        let manifest = json!({
            "format": ARCHIVE_FORMAT,
            "version": ARCHIVE_VERSION,
            "createdAt": "2026-07-17T10:01:00.000Z",
            "project": project,
            "media": [{
                "assetId": "asset-a",
                "originalName": "source.mp4",
                "originalLocator": "linked-source.mp4",
                "embeddedPath": null,
                "sizeBytes": null
            }]
        });
        let cursor = Cursor::new(Vec::new());
        let mut writer = ZipWriter::new(cursor);
        add_bytes(
            &mut writer,
            PROJECT_FILE,
            &serde_json::to_vec(&manifest).expect("manifest should encode"),
        )
        .expect("test zip should write");
        add_bytes(&mut writer, "subtitles/index.json", EMPTY_INDEX)
            .expect("subtitle index should write");
        add_bytes(&mut writer, "previews/index.json", EMPTY_INDEX)
            .expect("preview index should write");
        add_bytes(&mut writer, "cache/index.json", EMPTY_INDEX).expect("cache index should write");
        add_bytes(&mut writer, "assets/hidden.bin", b"unreferenced")
            .expect("extra asset should write");
        let mut cursor = writer.finish().expect("test zip should finish");
        cursor.set_position(0);

        let error = inspect_archive(cursor).expect_err("extra asset must be rejected");
        assert!(error.contains("unreferenced or missing embedded assets"));
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn refuses_extraction_when_the_validated_snapshot_does_not_match() {
        let root = test_directory("archive-mismatch");
        let source = root.join("source.mp4");
        fs::write(&source, b"fake-video-bytes").expect("test media should be written");
        let mut bytes = Cursor::new(Vec::new());
        write_archive(
            &mut bytes,
            &snapshot(&source),
            true,
            "2026-07-17T10:01:00.000Z",
        )
        .expect("archive should export");
        let bytes = bytes.into_inner();
        let mut changed =
            inspect_archive(Cursor::new(bytes.clone())).expect("archive should inspect");
        changed["name"] = Value::String("Tampered".to_string());

        let error = read_archive(Cursor::new(bytes), &root, &changed)
            .expect_err("changed snapshot must prevent extraction");
        assert!(error.contains("changed after validation"));
        assert!(!root.join("imported-assets").exists());
        fs::remove_dir_all(root).expect("test directory should be removed");
    }
}
