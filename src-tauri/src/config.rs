// 读取/保存微信凭证配置。
// 打包后项目根不存在，凭证落在 Tauri 的 app_data_dir：
//   优先 config.local.yaml（用户在设置页填写），回退 config.yaml（模板）。
// 缺文件/缺字段时返回空凭证，由 upload 层返回 NOT_CONFIGURED，前端弹设置引导。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct WechatConfig {
    #[serde(default, alias = "appId")]
    pub app_id: String,
    #[serde(default, alias = "appSecret")]
    pub app_secret: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct RawConfig {
    #[serde(default)]
    wechat: WechatConfig,
}

impl WechatConfig {
    pub fn is_configured(&self) -> bool {
        !self.app_id.is_empty() && !self.app_secret.is_empty()
    }
}

/// 读取凭证。无配置时返回空 WechatConfig（不报错）。
pub fn load_wechat_config(app: &AppHandle) -> WechatConfig {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return WechatConfig::default(),
    };
    for name in ["config.local.yaml", "config.yaml"] {
        let path: PathBuf = dir.join(name);
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(raw) = serde_yaml::from_str::<RawConfig>(&text) {
                return raw.wechat;
            }
        }
    }
    WechatConfig::default()
}

/// 设置页回显当前凭证（含 secret，供用户确认/修改）。无配置返回空串。
#[tauri::command]
pub fn get_config(app: AppHandle) -> WechatConfig {
    load_wechat_config(&app)
}

/// 设置页保存凭证：写 config.local.yaml 到 app_data_dir，并清 token 缓存使新凭证立即生效。
#[tauri::command]
pub fn save_config(app: AppHandle, app_id: String, app_secret: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录：{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败：{e}"))?;

    let raw = RawConfig {
        wechat: WechatConfig {
            app_id: app_id.trim().to_string(),
            app_secret: app_secret.trim().to_string(),
        },
    };
    let yaml = serde_yaml::to_string(&raw).map_err(|e| format!("序列化配置失败：{e}"))?;
    std::fs::write(dir.join("config.local.yaml"), yaml)
        .map_err(|e| format!("写入配置失败：{e}"))?;

    // 凭证变了，旧 access_token 作废，清缓存下次重取。
    crate::wechat::clear_token_blocking();
    Ok(())
}
