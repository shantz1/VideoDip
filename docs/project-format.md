# `.videodip` project archive format

`.videodip` is VideoDip's portable, offline project container. It is a standard
ZIP file so recovery does not depend on proprietary tooling, but consumers must
validate it as a VideoDip archive before reading or extracting entries.

## Version 1 layout

```text
project.json
assets/
  0000-source.mp4          # optional; stored, not recompressed
subtitles/index.json
previews/index.json
cache/index.json
```

All four JSON files are required. `assets/*` exists only for media embedded in
a self-contained export. Subtitle, preview, and cache indexes start empty in
version 1; their stable locations let later versions add derived artifacts
without changing the project snapshot.

## `project.json`

The root object is strict and uses camelCase:

```json
{
  "format": "videodip-project",
  "version": 1,
  "createdAt": "2026-07-17T10:01:00.000Z",
  "project": {},
  "media": [
    {
      "assetId": "asset-id",
      "originalName": "clip.mp4",
      "originalLocator": "opaque-host-locator",
      "embeddedPath": "assets/0000-clip.mp4",
      "sizeBytes": 123
    }
  ]
}
```

- `project` is exactly a validated `ProjectSnapshot` of the version declared by
  `packages/shared/src/schemas/project.schema.ts`.
- Every `project.mediaItems` entry has exactly one matching `media` entry.
- `embeddedPath` and `sizeBytes` are both present for packaged media and both
  absent for linked media.
- Multiple media-library items may reference one embedded path when their
  original locator is identical.
- Linked archives preserve host locators and may need relinking on another
  machine. Portable exports embed every referenced source and relink each
  locator to an app-owned extracted file during import.

## Safety and atomicity

- Exports stream source bytes and use ZIP's stored method because common video
  and audio formats are already compressed. The completed temporary archive is
  renamed into place only after finalization succeeds.
- Import accepts only the documented root files and one-level `assets/*`
  entries. Absolute paths, parent traversal, backslashes, directories,
  duplicates, and unreferenced asset payloads are rejected.
- Version 1 limits archives to 10,000 entries, a 16 MiB `project.json`, and
  100 GiB total declared uncompressed data.
- Import is two-phase: Rust inspects the ZIP without writing, TypeScript
  validates the complete shared project schema, then Rust reopens the archive
  and requires the snapshot to match before extracting media.
- Extraction uses a fresh app-data directory. A failed extraction removes that
  directory and never rewrites project locators.

## Compatibility

Readers reject unknown archive versions. A future version must add an explicit
migration before it is accepted; silently treating a newer archive as version 1
would risk data loss. The `.videodip` extension does not replace ZIP validation.
