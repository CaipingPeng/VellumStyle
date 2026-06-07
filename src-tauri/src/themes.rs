// 用户自定义主题：扫描 app_data_dir/themes/*.json（model 主题）。
// 用户安装软件后把 .json（mdnice styleModelList 数组）丢进该目录即新增一个主题，
// 文件名（去扩展名）作主题 id/名。内置主题编译进包（见前端 themes/index.ts），与用户主题在前端合并。

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct UserTheme {
    pub id: String,
    pub model: serde_json::Value, // styleModelList 数组
}

fn themes_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("themes"))
}

fn sanitize_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

/// 扫描 app_data_dir/themes/*.json，返回用户主题列表。目录不存在/读不到时返回空 vec（不报错）。
#[tauri::command]
pub fn list_user_themes(app: AppHandle) -> Vec<UserTheme> {
    let Some(dir) = themes_dir(&app) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut themes = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_json = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("json"))
            .unwrap_or(false);
        if !is_json {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string()) else {
            continue;
        };
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(model) = serde_json::from_str::<serde_json::Value>(&text) {
                themes.push(UserTheme {id, model});
            }
        }
    }
    themes.sort_by(|a, b| a.id.cmp(&b.id));
    themes
}

/// 保存用户主题：写 themes/{id}.json，内容为 styleModelList 数组的 JSON。
#[tauri::command]
pub fn save_user_theme(app: AppHandle, id: String, model_json: String) -> Result<(), String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败：{e}"))?;
    // 校验是合法 JSON
    serde_json::from_str::<serde_json::Value>(&model_json).map_err(|e| format!("非法 JSON：{e}"))?;
    let safe_id = sanitize_id(&id);
    if safe_id.is_empty() {
        return Err("非法主题 id".into());
    }
    let path = dir.join(format!("{safe_id}.json"));
    std::fs::write(&path, model_json).map_err(|e| format!("写入失败：{e}"))?;
    Ok(())
}

/// 导入 mdnice 抓包整包：取 data.styleModelList 存为 {id}.json。返回保存的 id。
#[tauri::command]
pub fn import_mdnice_theme(app: AppHandle, id: String, raw_json: String) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&raw_json).map_err(|e| format!("非法 JSON：{e}"))?;
    let model = parsed
        .get("data")
        .and_then(|d| d.get("styleModelList"))
        .ok_or_else(|| "JSON 中找不到 data.styleModelList".to_string())?;
    if !model.is_array() {
        return Err("styleModelList 不是数组".into());
    }
    let model_json = serde_json::to_string(model).map_err(|e| e.to_string())?;
    save_user_theme(app, id.clone(), model_json)?;
    Ok(sanitize_id(&id))
}

/// 确保 app_data_dir/themes/ 存在，返回其绝对路径（供 UI「打开主题文件夹」用）。
#[tauri::command]
pub fn ensure_themes_dir(app: AppHandle) -> Result<String, String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败：{e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// 在系统文件管理器中打开主题目录（先确保存在）。无新依赖，用系统命令。
#[tauri::command]
pub fn open_themes_dir(app: AppHandle) -> Result<(), String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败：{e}"))?;

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&dir).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&dir).spawn();

    result.map(|_| ()).map_err(|e| format!("打开目录失败：{e}"))
}
