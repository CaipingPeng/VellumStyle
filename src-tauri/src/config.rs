// 读取/保存微信凭证配置。
// 打包后项目根不存在，凭证落在 Tauri 的 app_data_dir：
//   优先 config.local.yaml（用户在设置页填写），回退 config.yaml（模板）。
// 缺文件/缺字段时返回空凭证，由 upload 层返回 NOT_CONFIGURED，前端弹设置引导。

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;

static CONFIG_LOCK: Mutex<()> = Mutex::new(());
use tauri::AppHandle;

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct WechatConfig {
    #[serde(default, alias = "appId")]
    pub app_id: String,
    #[serde(default, alias = "appSecret")]
    pub app_secret: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct AppConfig {
    #[serde(default)]
    pub wechat_accounts: Vec<WechatAccount>,
    #[serde(default)]
    pub active_wechat_app_id: String,
    #[serde(default)]
    pub wechat: WechatConfig,
    #[serde(default)]
    pub sync: SyncConfig,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct WechatAccount {
    pub name: String,
    pub app_id: String,
    pub app_secret: String,
}

#[derive(Serialize)]
pub struct WechatAccountSummary {
    name: String,
    app_id: String,
}

#[derive(Serialize)]
pub struct WechatAccounts {
    accounts: Vec<WechatAccountSummary>,
    active_app_id: String,
}

impl AppConfig {
    fn normalize(mut self) -> Self {
        if self.wechat_accounts.is_empty() && !self.wechat.app_id.is_empty() {
            self.wechat_accounts.push(WechatAccount {
                name: "默认公众号".into(),
                app_id: self.wechat.app_id.clone(),
                app_secret: self.wechat.app_secret.clone(),
            });
        }
        if !self
            .wechat_accounts
            .iter()
            .any(|a| a.app_id == self.active_wechat_app_id)
        {
            self.active_wechat_app_id = self
                .wechat_accounts
                .first()
                .map(|a| a.app_id.clone())
                .unwrap_or_default();
        }
        self.wechat = self
            .wechat_accounts
            .iter()
            .find(|a| a.app_id == self.active_wechat_app_id)
            .map(|a| WechatConfig {
                app_id: a.app_id.clone(),
                app_secret: a.app_secret.clone(),
            })
            .unwrap_or_default();
        self
    }

    fn summary(&self) -> WechatAccounts {
        WechatAccounts {
            accounts: self
                .wechat_accounts
                .iter()
                .map(|a| WechatAccountSummary {
                    name: a.name.clone(),
                    app_id: a.app_id.clone(),
                })
                .collect(),
            active_app_id: self.active_wechat_app_id.clone(),
        }
    }
}

fn validate_accounts(accounts: &mut [WechatAccount], active: &str) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for account in accounts.iter_mut() {
        account.name = account.name.trim().to_string();
        account.app_id = account.app_id.trim().to_string();
        account.app_secret = account.app_secret.trim().to_string();
        if account.app_id.is_empty() || account.app_secret.is_empty() {
            return Err("每套公众号配置都需要填写 AppID 和 AppSecret".into());
        }
        if !account.app_id.bytes().all(|c| c.is_ascii_alphanumeric()) {
            return Err("AppID 只能包含英文字母和数字".into());
        }
        if account.name.is_empty() {
            account.name = account.app_id.clone();
        }
        if !seen.insert(account.app_id.clone()) {
            return Err("不能重复添加相同的 AppID".into());
        }
    }
    if !(accounts.is_empty() && active.is_empty()) && !accounts.iter().any(|a| a.app_id == active) {
        return Err("请选择要使用的公众号".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SyncConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub remote_dir: String,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: "nutstore".into(),
            username: String::new(),
            password: String::new(),
            remote_dir: "VellumStyle".into(),
        }
    }
}

impl SyncConfig {
    pub fn is_configured(&self) -> bool {
        self.enabled
            && self.provider == "nutstore"
            && !self.username.trim().is_empty()
            && !self.password.trim().is_empty()
            && !self.remote_dir.trim().is_empty()
    }
}

impl WechatConfig {
    pub fn is_configured(&self) -> bool {
        !self.app_id.is_empty() && !self.app_secret.is_empty()
    }
}

fn read_config(dir: &Path) -> Result<AppConfig, String> {
    for name in ["config.local.yaml", "config.yaml"] {
        let path = crate::safe_path::resolve(dir, name)?;
        match std::fs::read_to_string(path) {
            Ok(text) => {
                return serde_yaml::from_str::<AppConfig>(&text)
                    .map(AppConfig::normalize)
                    .map_err(|_| format!("{name} 格式无效，请恢复配置文件后重试"))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("读取 {name} 失败：{error}")),
        }
    }
    Ok(AppConfig::default())
}

pub(crate) fn load_config<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<AppConfig, String> {
    read_config(&crate::storage::data_dir(app)?)
}

fn write_private_file(path: &Path, content: &str) -> Result<(), String> {
    // Serialize updates under CONFIG_LOCK and replace only after the complete file
    // is written. Keep the original credentials intact on disk errors.
    use std::io::Write;
    let temp = path.with_extension("yaml.tmp");
    let result = (|| -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result.map_err(|e| format!("写入配置失败：{e}"))
}

fn persist_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let dir = crate::storage::data_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;
    let yaml = serde_yaml::to_string(config).map_err(|e| format!("序列化配置失败：{e}"))?;
    write_private_file(
        &crate::safe_path::resolve(&dir, "config.local.yaml")?,
        &yaml,
    )
}

fn reset_wechat_session(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("wechat-backend") {
        window
            .destroy()
            .map_err(|e| format!("关闭原公众号后台失败：{e}"))?;
    }
    clear_wechat_caches();
    Ok(())
}

fn clear_wechat_caches() {
    crate::wechat::clear_token_blocking();
    crate::wechat_backend::clear_upload_token_cache();
}

#[tauri::command]
pub fn list_wechat_accounts(app: AppHandle) -> Result<WechatAccounts, String> {
    Ok(load_config(&app)?.summary())
}

#[tauri::command]
pub fn switch_wechat_account(app: AppHandle, app_id: String) -> Result<WechatAccounts, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "配置暂时不可用")?;
    let mut config = load_config(&app)?;
    if !config.wechat_accounts.iter().any(|a| a.app_id == app_id) {
        return Err("公众号配置不存在，请在设置中添加".into());
    }
    if config.active_wechat_app_id != app_id {
        reset_wechat_session(&app)?;
        config.active_wechat_app_id = app_id;
        config = config.normalize();
        persist_config(&app, &config)?;
    }
    Ok(config.summary())
}

pub fn wechat_session_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let config = load_config(app)?;
    let id = if config.active_wechat_app_id.is_empty() {
        "unconfigured"
    } else {
        &config.active_wechat_app_id
    };
    // Only validated alphanumeric AppIDs may become directory names.
    if !id.bytes().all(|c| c.is_ascii_alphanumeric()) {
        return Err("AppID 无效".into());
    }
    crate::storage::data_path(app, &format!("wechat-accounts/{id}/webview"))
}

/// 读取微信凭证。无配置时返回空 WechatConfig（不报错）。
pub fn load_wechat_config(app: &AppHandle) -> Result<WechatConfig, String> {
    Ok(load_config(app)?.wechat)
}

/// 读取文件同步配置。未启用或缺字段时由同步命令返回 disabled。
pub fn load_sync_config(app: &AppHandle) -> Result<SyncConfig, String> {
    let config = load_config(app)?;
    let mut cfg = config.sync;
    let id = config.active_wechat_app_id.trim();
    if !id.is_empty() {
        let is_first = config
            .wechat_accounts
            .first()
            .map(|a| a.app_id == id)
            .unwrap_or(false);
        if !is_first {
            cfg.remote_dir = format!(
                "{}/.vellumstyle-accounts/{}",
                crate::sync::normalize_remote_dir(&cfg.remote_dir),
                id
            );
        }
    }
    Ok(cfg)
}

/// 设置页回显当前配置（含 secret，供用户确认/修改）。无配置返回空串。
#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    load_config(&app)
}

/// 设置页保存配置：写 config.local.yaml 到 app_data_dir，并清 token 缓存使新微信凭证立即生效。
#[tauri::command]
pub fn save_config(
    app: AppHandle,
    app_id: String,
    app_secret: String,
    sync_enabled: Option<bool>,
    sync_provider: Option<String>,
    sync_username: Option<String>,
    sync_password: Option<String>,
    sync_remote_dir: Option<String>,
    wechat_accounts: Option<Vec<WechatAccount>>,
    active_wechat_app_id: Option<String>,
) -> Result<WechatAccounts, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "配置暂时不可用")?;
    let old = load_config(&app)?;
    let dir = crate::storage::data_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;

    let mut raw = AppConfig {
        wechat_accounts: wechat_accounts.unwrap_or_else(|| {
            let mut accounts = old.wechat_accounts.clone();
            if let Some(account) = accounts
                .iter_mut()
                .find(|a| a.app_id == old.active_wechat_app_id)
            {
                account.app_id = app_id.trim().into();
                account.app_secret = app_secret.trim().into();
            } else if !app_id.trim().is_empty() {
                accounts.push(WechatAccount {
                    name: "默认公众号".into(),
                    app_id: app_id.trim().into(),
                    app_secret: app_secret.trim().into(),
                });
            }
            accounts
        }),
        active_wechat_app_id: active_wechat_app_id.unwrap_or_else(|| app_id.trim().into()),
        wechat: WechatConfig {
            app_id: app_id.trim().to_string(),
            app_secret: app_secret.trim().to_string(),
        },
        sync: SyncConfig {
            enabled: sync_enabled.unwrap_or(false),
            provider: sync_provider
                .unwrap_or_else(|| "nutstore".into())
                .trim()
                .to_string(),
            username: sync_username.unwrap_or_default().trim().to_string(),
            password: sync_password.unwrap_or_default().trim().to_string(),
            remote_dir: sync_remote_dir
                .unwrap_or_else(|| "VellumStyle".into())
                .trim()
                .to_string(),
        },
    };
    validate_accounts(&mut raw.wechat_accounts, &raw.active_wechat_app_id)?;
    // The compatibility view is derived only from the selected account, including
    // deletion of the last account (never resurrect stale single-account config).
    raw.wechat = WechatConfig::default();
    raw = raw.normalize();
    if old.wechat.app_id != raw.wechat.app_id || old.wechat.app_secret != raw.wechat.app_secret {
        reset_wechat_session(&app)?;
    }
    persist_config(&app, &raw)?;
    Ok(raw.summary())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_reset_discards_previous_backend_upload_session_token() {
        crate::wechat_backend::cache_upload_token("previous-account-session".into());
        assert!(crate::wechat_backend::cached_upload_token().is_some());
        clear_wechat_caches();
        assert!(crate::wechat_backend::cached_upload_token().is_none());
    }

    #[test]
    fn legacy_single_account_becomes_default_without_losing_sync() {
        let config: AppConfig = serde_yaml::from_str("wechat:\n  app_id: wxOld\n  app_secret: old-secret\nsync:\n  username: cloud-user\n  password: cloud-secret\n").unwrap();
        let config = config.normalize();
        assert_eq!(config.wechat_accounts.len(), 1);
        assert_eq!(config.active_wechat_app_id, "wxOld");
        assert_eq!(config.wechat.app_secret, "old-secret");
        assert_eq!(config.sync.username, "cloud-user");
    }

    #[test]
    fn selected_account_controls_credentials_and_summary_never_contains_secrets() {
        let mut config = AppConfig::default();
        config.wechat_accounts = vec![
            WechatAccount {
                name: "工作号".into(),
                app_id: "wxA".into(),
                app_secret: "secret-a".into(),
            },
            WechatAccount {
                name: "个人号".into(),
                app_id: "wxB".into(),
                app_secret: "secret-b".into(),
            },
        ];
        config.active_wechat_app_id = "wxB".into();
        let config = config.normalize();
        assert_eq!(config.wechat.app_id, "wxB");
        assert_eq!(config.wechat.app_secret, "secret-b");
        let summary = serde_json::to_string(&config.summary()).unwrap();
        assert!(!summary.contains("secret"));
        let roundtrip: AppConfig =
            serde_yaml::from_str(&serde_yaml::to_string(&config).unwrap()).unwrap();
        assert_eq!(roundtrip.normalize().wechat.app_id, "wxB");
    }

    #[test]
    fn reject_duplicates_incomplete_accounts_and_invalid_selection() {
        let account = WechatAccount {
            name: "".into(),
            app_id: "wxA".into(),
            app_secret: "s".into(),
        };
        assert!(validate_accounts(&mut [account.clone(), account.clone()], "wxA").is_err());
        assert!(validate_accounts(
            &mut [WechatAccount {
                app_secret: "".into(),
                ..account.clone()
            }],
            "wxA"
        )
        .is_err());
        assert!(validate_accounts(&mut [account.clone()], "missing").is_err());
        assert!(validate_accounts(
            &mut [WechatAccount {
                app_id: "../escape".into(),
                ..account
            }],
            "../escape"
        )
        .is_err());
        assert!(validate_accounts(&mut [], "").is_ok());
        assert!(AppConfig::default().normalize().wechat_accounts.is_empty());
    }

    #[test]
    fn private_config_replace_preserves_original_on_failure() {
        let root = std::env::temp_dir().join(format!("vs-account-config-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("config.local.yaml");
        write_private_file(&path, "old").unwrap();
        write_private_file(&path, "new").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert!(
            read_config(&root).is_err(),
            "invalid config must not silently become an empty account list"
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert!(write_private_file(&root, "failure").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sync_config_requires_all_provider_credentials_when_enabled() {
        let disabled = SyncConfig {
            enabled: false,
            provider: "nutstore".into(),
            username: "".into(),
            password: "".into(),
            remote_dir: "".into(),
        };
        assert!(!disabled.is_configured());

        let configured = SyncConfig {
            enabled: true,
            provider: "nutstore".into(),
            username: "user@example.com".into(),
            password: "app-password".into(),
            remote_dir: "VellumStyle".into(),
        };
        assert!(configured.is_configured());
    }
}
