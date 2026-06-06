// 用户自定义主题：扫描 app_data_dir/themes/*.css。
// 用户安装软件后把 .css 文件丢进该目录即新增一个主题，文件名（去扩展名）作主题 id/名。
// 内置主题编译进包（见前端 themes/index.ts 的 import.meta.glob），与用户主题在前端合并。

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct UserTheme {
    pub id: String,
    pub css: String,
}

fn themes_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("themes"))
}

/// 扫描 app_data_dir/themes/*.css，返回用户主题列表。目录不存在/读不到时返回空 vec（不报错）。
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
        let is_css = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("css"))
            .unwrap_or(false);
        if !is_css {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string()) else {
            continue;
        };
        if let Ok(css) = std::fs::read_to_string(&path) {
            themes.push(UserTheme {id, css});
        }
    }
    themes.sort_by(|a, b| a.id.cmp(&b.id));
    themes
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
