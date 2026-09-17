use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const RETENTION_MS: u64 = 30 * 24 * 60 * 60 * 1000;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub id: String,
    pub path: String,
    pub deleted_at: u64,
    pub is_dir: bool,
    pub layout_json: Option<String>,
}
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("trash"))
}
fn entry_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.bytes().all(|c| c.is_ascii_digit() || c == b'-') { return Err("非法回收记录".into()); }
    Ok(root.join(id))
}
pub(crate) fn move_to_trash(app: &AppHandle, full: &Path, path: &str, layout_json: Option<String>) -> Result<TrashEntry, String> {
    let trash = root(app)?;
    std::fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let time = now();
    let mut index = 0;
    let (id, dir) = loop {
        let id = format!("{time}-{index}");
        let dir = entry_dir(&trash, &id)?;
        match std::fs::create_dir(&dir) {
            Ok(()) => break (id, dir),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => index += 1,
            Err(e) => return Err(e.to_string()),
        }
    };
    let entry = TrashEntry {id, path: path.into(), deleted_at: time, is_dir: full.is_dir(), layout_json};
    let metadata = serde_json::to_vec(&entry).map_err(|e| e.to_string())?;
    crate::atomic_file::write(&dir.join("entry.json"), &metadata).map_err(|e| e.to_string())?;
    std::fs::rename(full, dir.join("content")).map_err(|e| format!("移入最近删除失败：{e}"))?;
    Ok(entry)
}
#[tauri::command]
pub fn list_trash(app: AppHandle) -> Result<Vec<TrashEntry>, String> {
    let trash = root(&app)?;
    if !trash.exists() { return Ok(vec![]); }
    let mut result = vec![];
    for item in std::fs::read_dir(&trash).map_err(|e| e.to_string())?.flatten() {
        if item.file_type().map(|t| !t.is_dir() || t.is_symlink()).unwrap_or(true) { continue; }
        let id = item.file_name().to_string_lossy().into_owned();
        let Ok(dir) = entry_dir(&trash, &id) else { continue; };
        let Ok(bytes) = std::fs::read(dir.join("entry.json")) else { continue; };
        let Ok(entry) = serde_json::from_slice::<TrashEntry>(&bytes) else { continue; };
        if entry.id != id { continue; }
        if now().saturating_sub(entry.deleted_at) > RETENTION_MS {
            let _ = std::fs::remove_dir_all(dir);
        } else if dir.join("content").exists() { result.push(entry); }
    }
    result.sort_by_key(|entry| std::cmp::Reverse(entry.deleted_at));
    Ok(result)
}
#[tauri::command]
pub fn restore_trash(app: AppHandle, id: String) -> Result<TrashEntry, String> {
    let dir = entry_dir(&root(&app)?, &id)?;
    let bytes = std::fs::read(dir.join("entry.json")).map_err(|e| e.to_string())?;
    let mut entry: TrashEntry = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let original = crate::documents::resolve_in_documents(&app, &entry.path)?;
    let parent = original.parent().ok_or("非法恢复路径")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut target = original.clone();
    let mut index = 1;
    while target.exists() {
        let stem = if entry.is_dir { original.file_name() } else { original.file_stem() }.and_then(|s| s.to_str()).ok_or("非法名称")?;
        let suffix = if entry.is_dir { String::new() } else { format!(".{}", original.extension().and_then(|s| s.to_str()).unwrap_or("md")) };
        target = parent.join(format!("{stem} (恢复 {index}){suffix}"));
        index += 1;
    }
    std::fs::rename(dir.join("content"), &target).map_err(|e| format!("恢复失败：{e}"))?;
    let base = crate::documents::documents_dir(&app)?;
    entry.path = target.strip_prefix(base).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
    let _ = std::fs::remove_file(dir.join("entry.json"));
    let _ = std::fs::remove_dir(dir);
    Ok(entry)
}
