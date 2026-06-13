// 读取/保存微信凭证配置。
// 打包后项目根不存在，凭证落在 Tauri 的 app_data_dir：
//   优先 config.local.yaml（用户在设置页填写），回退 config.yaml（模板）。
// 缺文件/缺字段时返回空凭证，由 upload 层返回 NOT_CONFIGURED，前端弹设置引导。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

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
    pub wechat: WechatConfig,
    #[serde(default)]
    pub sync: SyncConfig,
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

fn load_config(app: &AppHandle) -> AppConfig {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return AppConfig::default(),
    };
    for name in ["config.local.yaml", "config.yaml"] {
        let path: PathBuf = dir.join(name);
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(raw) = serde_yaml::from_str::<AppConfig>(&text) {
                return raw;
            }
        }
    }
    AppConfig::default()
}

fn write_private_file(path: &Path, content: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| format!("写入配置失败：{e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("写入配置失败：{e}"))?;
        return Ok(());
    }

    #[cfg(not(unix))]
    {
        std::fs::write(path, content).map_err(|e| format!("写入配置失败：{e}"))
    }
}

/// 读取微信凭证。无配置时返回空 WechatConfig（不报错）。
pub fn load_wechat_config(app: &AppHandle) -> WechatConfig {
    load_config(app).wechat
}

/// 读取文件同步配置。未启用或缺字段时由同步命令返回 disabled。
pub fn load_sync_config(app: &AppHandle) -> SyncConfig {
    load_config(app).sync
}

/// 设置页回显当前配置（含 secret，供用户确认/修改）。无配置返回空串。
#[tauri::command]
pub fn get_config(app: AppHandle) -> AppConfig {
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
) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录：{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;

    let raw = AppConfig {
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
    let yaml = serde_yaml::to_string(&raw).map_err(|e| format!("序列化配置失败：{e}"))?;
    write_private_file(&dir.join("config.local.yaml"), &yaml)?;

    // 微信凭证可能变了，旧 access_token 作废，清缓存下次重取。
    crate::wechat::clear_token_blocking();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::SyncConfig;

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
