use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const MAX_SNAPSHOTS: usize = 30;
const COALESCE_MS: u64 = 30_000;
const MAX_TOTAL_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySnapshot {
    pub id: String,
    pub created_at: u64,
    pub content: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

// DefaultHasher 的输出仅用于生成不可解释的目录名，不承担安全用途；路径仍由应用内部传入，
// 快照文件也只会在 app_data_dir/history 下读写。
fn document_key(path: &str) -> String {
    // 固定 FNV-1a，确保应用或 Rust 工具链升级后仍能找到旧版本目录。
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in path.replace('\\', "/").as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn history_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位数据目录：{error}"))?
        .join("history");
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建历史目录失败：{error}"))?;
    Ok(dir)
}

fn snapshot_dir(app: &AppHandle, document_path: &str) -> Result<PathBuf, String> {
    Ok(history_root(app)?.join(document_key(document_path)))
}

fn read_snapshots(dir: &Path) -> Result<Vec<HistorySnapshot>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut snapshots = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|error| format!("读取历史目录失败：{error}"))? {
        let entry = entry.map_err(|error| format!("读取历史条目失败：{error}"))?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let text = std::fs::read_to_string(entry.path())
            .map_err(|error| format!("读取历史版本失败：{error}"))?;
        if let Ok(snapshot) = serde_json::from_str::<HistorySnapshot>(&text) {
            snapshots.push(snapshot);
        }
    }
    snapshots.sort_by_key(|snapshot| snapshot.created_at);
    Ok(snapshots)
}

fn write_snapshot(dir: &Path, snapshot: &HistorySnapshot) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|error| format!("创建历史目录失败：{error}"))?;
    let text = serde_json::to_string(snapshot).map_err(|error| format!("序列化历史版本失败：{error}"))?;
    std::fs::write(dir.join(format!("{}.json", snapshot.id)), text)
        .map_err(|error| format!("写入历史版本失败：{error}"))
}

fn remove_snapshot_file(dir: &Path, id: &str) -> Result<(), String> {
    let path = dir.join(format!("{id}.json"));
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| format!("清理历史版本失败：{error}"))?;
    }
    Ok(())
}

fn record_in_dir(dir: &Path, content: &str, created_at: u64) -> Result<(), String> {
    let mut snapshots = read_snapshots(dir)?;
    if snapshots.last().map(|snapshot| snapshot.content.as_str()) == Some(content) {
        return Ok(());
    }

    // 始终保留第一份基线和至少一个新版本；之后 30 秒内的自动保存合并为同一份。
    if snapshots.len() >= 2 {
        if let Some(latest) = snapshots.last() {
            if created_at.saturating_sub(latest.created_at) < COALESCE_MS {
                let latest = snapshots.pop().expect("latest snapshot exists");
                remove_snapshot_file(dir, &latest.id)?;
            }
        }
    }

    let id = format!("{created_at}-{}", snapshots.len());
    snapshots.push(HistorySnapshot {id: id.clone(), created_at, content: content.to_string()});
    write_snapshot(dir, snapshots.last().expect("new snapshot exists"))?;

    while snapshots.len() > MAX_SNAPSHOTS {
        let oldest = snapshots.remove(0);
        remove_snapshot_file(dir, &oldest.id)?;
    }
    Ok(())
}

fn prune_global(root: &Path, max_bytes: u64) -> Result<(), String> {
    let mut files: Vec<(PathBuf, u64, u64)> = Vec::new();
    if !root.exists() {
        return Ok(());
    }
    for document_dir in std::fs::read_dir(root).map_err(|error| format!("读取历史目录失败：{error}"))? {
        let document_dir = document_dir.map_err(|error| format!("读取历史条目失败：{error}"))?;
        if !document_dir.path().is_dir() { continue; }
        for entry in std::fs::read_dir(document_dir.path()).map_err(|error| format!("读取历史条目失败：{error}"))? {
            let entry = entry.map_err(|error| format!("读取历史条目失败：{error}"))?;
            let metadata = entry.metadata().map_err(|error| format!("读取历史元数据失败：{error}"))?;
            if metadata.is_file() && entry.path().extension().and_then(|value| value.to_str()) == Some("json") {
                let timestamp = entry.path().file_stem().and_then(|value| value.to_str())
                    .and_then(|value| value.split('-').next())
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(0);
                files.push((entry.path(), metadata.len(), timestamp));
            }
        }
    }
    let mut total: u64 = files.iter().map(|(_, size, _)| *size).sum();
    if total <= max_bytes { return Ok(()); }
    files.sort_by_key(|(_, _, timestamp)| *timestamp);
    for (path, size, _) in files {
        std::fs::remove_file(path).map_err(|error| format!("清理历史版本失败：{error}"))?;
        total = total.saturating_sub(size);
        if total <= max_bytes { break; }
    }
    Ok(())
}

pub fn record_document_transition(app: &AppHandle, document_path: &str, before: &str, after: &str) -> Result<(), String> {
    if !document_path.to_lowercase().ends_with(".md") || before == after {
        return Ok(());
    }
    let dir = snapshot_dir(app, document_path)?;
    let timestamp = now_ms();
    record_in_dir(&dir, before, timestamp)?;
    record_in_dir(&dir, after, timestamp.saturating_add(1))?;
    prune_global(&history_root(app)?, MAX_TOTAL_BYTES)
}

pub fn migrate_document_history(app: &AppHandle, from: &str, to: &str) -> Result<(), String> {
    let from_dir = snapshot_dir(app, from)?;
    if !from_dir.exists() {
        return Ok(());
    }
    let to_dir = snapshot_dir(app, to)?;
    if to_dir.exists() {
        // 目标正常不应存在；若存在则合并，避免覆盖任何一边的历史。
        for snapshot in read_snapshots(&from_dir)? {
            record_in_dir(&to_dir, &snapshot.content, snapshot.created_at)?;
        }
        std::fs::remove_dir_all(&from_dir).map_err(|error| format!("迁移历史版本失败：{error}"))?;
    } else {
        std::fs::rename(&from_dir, &to_dir).map_err(|error| format!("迁移历史版本失败：{error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_document_history(app: AppHandle, path: String) -> Result<Vec<HistorySnapshot>, String> {
    let mut snapshots = read_snapshots(&snapshot_dir(&app, &path)?)?;
    snapshots.reverse();
    Ok(snapshots)
}

#[cfg(test)]
mod tests {
    use super::{document_key, prune_global, read_snapshots, record_in_dir, MAX_SNAPSHOTS};

    fn temp_dir(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("vellumstyle-history-{label}-{}", std::process::id()))
    }

    #[test]
    fn coalesces_rapid_snapshots_but_keeps_baseline() {
        let dir = temp_dir("coalesce");
        let _ = std::fs::remove_dir_all(&dir);
        record_in_dir(&dir, "before", 1_000).unwrap();
        record_in_dir(&dir, "draft 1", 1_001).unwrap();
        record_in_dir(&dir, "draft 2", 2_000).unwrap();
        let snapshots = read_snapshots(&dir).unwrap();
        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].content, "before");
        assert_eq!(snapshots[1].content, "draft 2");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn removes_old_snapshots_above_limit() {
        let dir = temp_dir("limit");
        let _ = std::fs::remove_dir_all(&dir);
        for index in 0..(MAX_SNAPSHOTS + 3) {
            record_in_dir(&dir, &format!("version {index}"), (index as u64) * 31_000).unwrap();
        }
        let snapshots = read_snapshots(&dir).unwrap();
        assert_eq!(snapshots.len(), MAX_SNAPSHOTS);
        assert_eq!(snapshots[0].content, "version 3");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn global_limit_removes_oldest_files_first() {
        let root = temp_dir("global-limit");
        let _ = std::fs::remove_dir_all(&root);
        let first = root.join("first");
        let second = root.join("second");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        std::fs::write(first.join("1-0.json"), "12345").unwrap();
        std::fs::write(second.join("2-0.json"), "67890").unwrap();

        prune_global(&root, 5).unwrap();

        assert!(!first.join("1-0.json").exists());
        assert!(second.join("2-0.json").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn document_keys_are_stable_and_preserve_case_sensitive_paths() {
        assert_eq!(document_key("目录\\文章.md"), document_key("目录/文章.md"));
        assert_eq!(document_key("目录/文章.md"), "297accd00e490ceb");
        assert_ne!(document_key("A.md"), document_key("a.md"));
    }
}
