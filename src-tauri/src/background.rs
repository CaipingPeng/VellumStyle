// 应用背景图：用户选择的图片会复制到 app_data_dir/backgrounds/ 下，
// 前端只保存软件内部路径，不引用原位置，避免原文件被移动/删除后失效。

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const IMAGE_EXTS: [&str; 7] = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];

fn backgrounds_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录：{e}"))?
        .join("backgrounds");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建背景图目录失败：{e}"))?;
    Ok(dir)
}

fn file_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
}

/// 复制用户选择的背景图到应用数据目录，返回软件内部保存的路径。
#[tauri::command]
pub fn copy_background_image(app: AppHandle, source_path: String) -> Result<String, String> {
    let source = PathBuf::from(&source_path);
    let ext = file_extension(&source)
        .filter(|ext| IMAGE_EXTS.contains(&ext.as_str()))
        .ok_or("仅支持 png/jpg/jpeg/webp/gif/bmp/svg 图片")?;
    if !source.is_file() {
        return Err("背景图文件不存在".into());
    }

    let dir = backgrounds_dir(&app)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("生成背景图文件名失败：{e}"))?
        .as_millis();
    let target = dir.join(format!("bg-{stamp}.{ext}"));
    std::fs::copy(&source, &target).map_err(|e| format!("复制背景图失败：{e}"))?;
    Ok(target.to_string_lossy().into_owned())
}

/// 删除软件内部保存的背景图文件；只允许删除 backgrounds/ 目录内的文件。
#[tauri::command]
pub fn remove_background_image(app: AppHandle, stored_path: String) -> Result<(), String> {
    let base = std::fs::canonicalize(backgrounds_dir(&app)?)
        .map_err(|e| format!("解析背景图目录失败：{e}"))?;
    let resolved = std::fs::canonicalize(&stored_path)
        .map_err(|e| format!("解析背景图路径失败：{e}"))?;
    if !resolved.starts_with(&base) {
        return Err("仅允许删除软件自身的背景图".into());
    }
    std::fs::remove_file(&resolved).map_err(|e| format!("删除背景图失败：{e}"))
}
