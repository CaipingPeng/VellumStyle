use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

// Recover data moved by the short-lived local-login version, without requiring
// a password or overwriting files already in the shared workspace.
fn recover_shared_workspace(root: &Path) -> Result<(), String> {
    let registry = root.join("users.json");
    if !registry.exists() {
        return Ok(());
    }
    let text = std::fs::read_to_string(registry).map_err(|e| e.to_string())?;
    let registry: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let accounts = registry.as_array();
    let owner = accounts.and_then(|accounts| {
        accounts.iter().filter_map(|a| a.get("user")).find(|a| {
            a.get("ownsLegacyData")
                .or_else(|| a.get("owns_legacy_data"))
                .and_then(|v| v.as_bool())
                == Some(true)
        })
    });
    let Some(id) = owner.and_then(|a| a.get("id")).and_then(|v| v.as_str()) else {
        return Ok(());
    };
    if id.is_empty() || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
        return Err("旧版数据目录标识无效".into());
    }
    let profile = crate::safe_path::resolve(root, &format!("profiles/{id}"))?;
    for name in [
        "documents",
        "history",
        "trash",
        "templates",
        "themes",
        "backgrounds",
        "cache",
        "config.local.yaml",
        "config.yaml",
        "sync-state.json",
    ] {
        let source = crate::safe_path::resolve(&profile, name)?;
        let target = root.join(name);
        if source.exists() && !target.exists() {
            std::fs::rename(source, target).map_err(|e| format!("恢复旧版 {name} 失败：{e}"))?;
        }
    }
    Ok(())
}

pub fn data_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    static RECOVERY: OnceLock<Result<(), String>> = OnceLock::new();
    RECOVERY
        .get_or_init(|| recover_shared_workspace(&root))
        .clone()?;
    Ok(root)
}

pub fn data_path<R: tauri::Runtime>(app: &AppHandle<R>, relative: &str) -> Result<PathBuf, String> {
    crate::safe_path::resolve(&data_dir(app)?, relative)
}

#[cfg(test)]
mod tests {
    #[test]
    fn recovery_preserves_both_existing_shared_and_profile_files() {
        let root = std::env::temp_dir().join(format!("vs-recovery-{}", std::process::id()));
        std::fs::create_dir_all(root.join("profiles/old/documents")).unwrap();
        std::fs::write(
            root.join("users.json"),
            r#"[{"user":{"id":"old","ownsLegacyData":true}}]"#,
        )
        .unwrap();
        std::fs::write(root.join("profiles/old/documents/a.md"), "old").unwrap();
        super::recover_shared_workspace(&root).unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("documents/a.md")).unwrap(),
            "old"
        );
        std::fs::write(root.join("profiles/old/config.local.yaml"), "profile").unwrap();
        std::fs::write(root.join("config.local.yaml"), "shared").unwrap();
        super::recover_shared_workspace(&root).unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("config.local.yaml")).unwrap(),
            "shared"
        );
        assert!(root.join("profiles/old/config.local.yaml").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
