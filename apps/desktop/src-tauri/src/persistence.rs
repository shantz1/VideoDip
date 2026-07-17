use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "videodip.sqlite3";
const PROJECT_SNAPSHOT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    version: u32,
    id: String,
    name: String,
    aspect_ratio: String,
    timeline: Value,
    media_items: Vec<Value>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    id: String,
    name: String,
    updated_at: String,
}

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let connection = open_connection(app)?;
    migrate(&connection)
}

fn open_connection(app: &AppHandle) -> Result<Connection, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the VideoDip app-data directory: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the VideoDip app-data directory: {error}"))?;
    let connection = Connection::open(directory.join(DATABASE_FILE))
        .map_err(|error| format!("Could not open the VideoDip project database: {error}"))?;
    migrate(&connection)?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS projects (
               id TEXT PRIMARY KEY NOT NULL,
               name TEXT NOT NULL,
               snapshot_json TEXT NOT NULL,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS projects_updated_at_idx
               ON projects(updated_at DESC);",
        )
        .map_err(|error| format!("Could not migrate the VideoDip project database: {error}"))
}

fn validate_snapshot(snapshot: &ProjectSnapshot) -> Result<(), String> {
    if snapshot.version != PROJECT_SNAPSHOT_VERSION {
        return Err(format!(
            "Unsupported project snapshot version {}. Expected version {PROJECT_SNAPSHOT_VERSION}.",
            snapshot.version
        ));
    }
    if snapshot.id.trim().is_empty() || snapshot.name.trim().is_empty() {
        return Err("Project id and name must not be empty.".to_string());
    }
    if snapshot.created_at.trim().is_empty() || snapshot.updated_at.trim().is_empty() {
        return Err("Project timestamps must not be empty.".to_string());
    }
    Ok(())
}

fn save_snapshot(connection: &Connection, snapshot: &ProjectSnapshot) -> Result<(), String> {
    validate_snapshot(snapshot)?;
    let json = serde_json::to_string(snapshot)
        .map_err(|error| format!("Could not encode the project snapshot: {error}"))?;
    connection
        .execute(
            "INSERT INTO projects (id, name, snapshot_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               snapshot_json = excluded.snapshot_json,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
            params![
                snapshot.id,
                snapshot.name,
                json,
                snapshot.created_at,
                snapshot.updated_at
            ],
        )
        .map_err(|error| format!("Could not save the project: {error}"))?;
    Ok(())
}

fn load_snapshot(connection: &Connection, id: &str) -> Result<ProjectSnapshot, String> {
    let json = connection
        .query_row(
            "SELECT snapshot_json FROM projects WHERE id = ?1",
            [id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Could not load the project: {error}"))?
        .ok_or_else(|| format!("Project {id} was not found."))?;
    serde_json::from_str(&json)
        .map_err(|error| format!("The saved project data is invalid: {error}"))
}

fn project_summaries(connection: &Connection) -> Result<Vec<ProjectSummary>, String> {
    let mut statement = connection
        .prepare("SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC, name ASC")
        .map_err(|error| format!("Could not prepare the project list: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })
        .map_err(|error| format!("Could not list projects: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read the project list: {error}"))
}

fn delete_snapshot(connection: &Connection, id: &str) -> Result<(), String> {
    connection
        .execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|error| format!("Could not delete the project: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn save_project(app: AppHandle, snapshot: ProjectSnapshot) -> Result<(), String> {
    save_snapshot(&open_connection(&app)?, &snapshot)
}

#[tauri::command]
pub fn load_project(app: AppHandle, id: String) -> Result<ProjectSnapshot, String> {
    load_snapshot(&open_connection(&app)?, &id)
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<ProjectSummary>, String> {
    project_summaries(&open_connection(&app)?)
}

#[tauri::command]
pub fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    delete_snapshot(&open_connection(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snapshot(id: &str, updated_at: &str) -> ProjectSnapshot {
        ProjectSnapshot {
            version: PROJECT_SNAPSHOT_VERSION,
            id: id.to_string(),
            name: format!("Project {id}"),
            aspect_ratio: "9:16".to_string(),
            timeline: json!({ "tracks": [] }),
            media_items: Vec::new(),
            created_at: "2026-07-17T10:00:00.000Z".to_string(),
            updated_at: updated_at.to_string(),
        }
    }

    #[test]
    fn migration_and_crud_round_trip() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite should open");
        migrate(&connection).expect("migration should succeed");

        let first = snapshot("a", "2026-07-17T10:01:00.000Z");
        let second = snapshot("b", "2026-07-17T10:02:00.000Z");
        save_snapshot(&connection, &first).expect("first save should succeed");
        save_snapshot(&connection, &second).expect("second save should succeed");

        let summaries = project_summaries(&connection).expect("list should succeed");
        assert_eq!(summaries[0].id, "b");
        assert_eq!(
            load_snapshot(&connection, "a")
                .expect("load should succeed")
                .id,
            "a"
        );

        delete_snapshot(&connection, "a").expect("delete should succeed");
        assert!(load_snapshot(&connection, "a").is_err());
    }

    #[test]
    fn rejects_unknown_snapshot_versions() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite should open");
        migrate(&connection).expect("migration should succeed");
        let mut unsupported = snapshot("a", "2026-07-17T10:01:00.000Z");
        unsupported.version = 2;
        assert!(save_snapshot(&connection, &unsupported).is_err());
    }
}
