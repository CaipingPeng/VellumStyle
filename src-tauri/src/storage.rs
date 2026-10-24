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
pub fn resolve_account_dir(
    root: &Path,
    config: &crate::config::AppConfig,
) -> Result<PathBuf, String> {
    let id = config.active_wechat_app_id.trim();
    if id.is_empty() {
        return Ok(root.to_path_buf());
    }
    if !id
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("AppID 无效".into());
    }
    let dir = crate::safe_path::resolve(root, &format!("wechat-accounts/{id}"))?;

    let is_first = config
        .wechat_accounts
        .first()
        .map(|a| a.app_id == id)
        .unwrap_or(false);
    let target_docs = dir.join("documents");
    let root_docs = root.join("documents");
    if is_first && !target_docs.exists() && root_docs.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        for name in ["documents", "history", "trash", "sync-state.json"] {
            let src = root.join(name);
            let dst = dir.join(name);
            if src.exists() && !dst.exists() {
                let _ = std::fs::rename(&src, &dst);
            }
        }
    }

    std::fs::create_dir_all(&dir).map_err(|e| format!("创建账号数据目录失败：{e}"))?;
    Ok(dir)
}

pub fn account_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let root = data_dir(app)?;
    let config = crate::config::load_config(app)?;
    resolve_account_dir(&root, &config)
}

pub fn account_data_path<R: tauri::Runtime>(
    app: &AppHandle<R>,
    relative: &str,
) -> Result<PathBuf, String> {
    crate::safe_path::resolve(&account_dir(app)?, relative)
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

    #[test]
    fn account_dir_isolates_workspaces_and_migrates_legacy_for_first_account() {
        let root = std::env::temp_dir().join(format!("vs-account-storage-{}", std::process::id()));
        std::fs::create_dir_all(root.join("documents")).unwrap();
        std::fs::write(root.join("documents/legacy.md"), "legacy article").unwrap();

        let mut config = crate::config::AppConfig::default();
        config.wechat_accounts = vec![
            crate::config::WechatAccount {
                name: "Account 1".into(),
                app_id: "wx1".into(),
                app_secret: "sec1".into(),
            },
            crate::config::WechatAccount {
                name: "Account 2".into(),
                app_id: "wx2".into(),
                app_secret: "sec2".into(),
            },
        ];

        // 1. First account inherits root documents
        config.active_wechat_app_id = "wx1".into();
        let dir1 = super::resolve_account_dir(&root, &config).unwrap();
        assert_eq!(dir1, root.join("wechat-accounts/wx1"));
        assert_eq!(
            std::fs::read_to_string(dir1.join("documents/legacy.md")).unwrap(),
            "legacy article"
        );

        // 2. Second account gets an isolated empty workspace
        config.active_wechat_app_id = "wx2".into();
        let dir2 = super::resolve_account_dir(&root, &config).unwrap();
        assert_eq!(dir2, root.join("wechat-accounts/wx2"));
        assert!(!dir2.join("documents/legacy.md").exists());

        // Create an article in Account 2
        std::fs::create_dir_all(dir2.join("documents")).unwrap();
        std::fs::write(dir2.join("documents/account2.md"), "account 2 article").unwrap();

        // 3. Switch back to Account 1: only has Account 1's article
        config.active_wechat_app_id = "wx1".into();
        let dir1_again = super::resolve_account_dir(&root, &config).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir1_again.join("documents/legacy.md")).unwrap(),
            "legacy article"
        );
        assert!(!dir1_again.join("documents/account2.md").exists());

        std::fs::remove_dir_all(root).unwrap();
    }
}
