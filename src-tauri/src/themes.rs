// 用户自定义主题：扫描 app_data_dir/themes/*.css。
// 主题统一为纯 CSS（作者直接写样式，前端自动作用域到 #article）。
// 文件名（去扩展名）作主题 id/名。内置主题随前端打包（见前端 themes/index.ts），与用户主题在前端合并。

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const ARTICLE_ROOT_SELECTOR: &str = "#article";
const LEGACY_ARTICLE_ROOT_SELECTORS: &[&str] = &["#nice", "#wechat-article"];

#[derive(Debug, Clone, Serialize)]
pub struct UserTheme {
    pub id: String,
    pub name: String,
    pub css: String,
}

fn themes_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("themes"))
}

/// 生成安全主题 id/文件名：保留字母数字与 `-`/`_`/`.`。
/// 拒绝空结果、以 `.` 开头、含 `..` 及 Windows 保留名，
/// 避免 `my.theme.json` 这类带点号文件名保存后 id 漂移。
fn sanitize_id(id: &str) -> Result<String, String> {
    let safe: String = id
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    if safe.is_empty() {
        return Err("主题 id 为空或仅含非法字符".into());
    }
    if safe.starts_with('.') || safe.contains("..") {
        return Err("主题 id 不能以点开头或包含连续点号".into());
    }
    let upper = safe.to_ascii_uppercase();
    let is_reserved = upper == "CON"
        || upper == "PRN"
        || upper == "AUX"
        || upper == "NUL"
        || (upper.starts_with("COM") && upper[3..].chars().all(|c| c.is_ascii_digit()))
        || (upper.starts_with("LPT") && upper[3..].chars().all(|c| c.is_ascii_digit()));
    if is_reserved {
        return Err("主题 id 是 Windows 保留文件名".into());
    }
    Ok(safe)
}

fn is_selector_boundary(ch: Option<char>) -> bool {
    !matches!(ch, Some(c) if c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn normalize_article_root_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;

    while let Some((idx, legacy_selector)) = LEGACY_ARTICLE_ROOT_SELECTORS
        .iter()
        .filter_map(|selector| rest.find(selector).map(|idx| (idx, *selector)))
        .min_by_key(|(idx, _)| *idx)
    {
        let after = idx + legacy_selector.len();
        if is_selector_boundary(rest[after..].chars().next()) {
            out.push_str(&rest[..idx]);
            out.push_str(ARTICLE_ROOT_SELECTOR);
        } else {
            out.push_str(&rest[..after]);
        }
        rest = &rest[after..];
    }

    out.push_str(rest);
    out
}

// 解析 CSS 主题文件内容。空文件视为无效；选择器里的旧文章根（#nice/#wechat-article）
// 统一归一化为 #article。返回 (name, css)。
fn parse_css_theme(text: &str, file_stem: &str) -> Option<(String, String)> {
    let css = normalize_article_root_text(text.trim());
    if css.is_empty() {
        return None;
    }
    Some((file_stem.to_string(), css))
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
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext != "css" {
            continue;
        }
        let Some(id) = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
        else {
            continue;
        };
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        if let Some((name, css)) = parse_css_theme(&text, &id) {
            themes.push(UserTheme { id, name, css });
        }
    }
    themes.sort_by(|a, b| a.id.cmp(&b.id));
    themes
}

/// 导入 CSS 主题：写入 themes/{id}.css。
#[tauri::command]
pub fn import_css_theme(app: AppHandle, id: String, raw_css: String) -> Result<String, String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败：{e}"))?;
    let safe_id = sanitize_id(&id)?;
    let path = dir.join(format!("{safe_id}.css"));
    std::fs::write(&path, raw_css).map_err(|e| format!("写入失败：{e}"))?;
    Ok(safe_id)
}

/// 删除用户主题：删除 themes/{id}.css。id 按文件名原样解析（与扫描一致，
/// 支持中文/空格等文件系统允许的字符），但做路径安全校验，防止目录穿越。
#[tauri::command]
pub fn delete_user_theme(app: AppHandle, id: String) -> Result<(), String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    delete_theme_file(&dir, &id)
}

fn delete_theme_file(dir: &std::path::Path, id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.starts_with('.')
        || id.contains("..")
        || id.contains(['/', '\\'])
    {
        return Err("非法的主题 id".into());
    }
    let path = dir.join(format!("{id}.css"));
    match std::fs::remove_file(&path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("删除主题失败：{e}")),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_keeps_cjk_and_dots() {
        assert_eq!(sanitize_id("琥珀"), Ok("琥珀".to_string()));
        assert_eq!(sanitize_id("my.theme"), Ok("my.theme".to_string()));
        assert_eq!(sanitize_id("default"), Ok("default".to_string()));
    }

    #[test]
    fn sanitize_rejects_empty_dot_prefix_and_reserved_names() {
        assert!(sanitize_id("").is_err());
        assert!(sanitize_id("！？").is_err());
        assert!(sanitize_id(".hidden").is_err());
        assert!(sanitize_id("a..b").is_err());
        assert!(sanitize_id("CON").is_err());
        assert!(sanitize_id("com1").is_err());
        assert!(sanitize_id("NUL").is_err());
        assert_eq!(sanitize_id("a-b_c.1"), Ok("a-b_c.1".to_string()));
    }

    #[test]
    fn normalizes_legacy_article_root_selector() {
        assert_eq!(
            normalize_article_root_text("#nice p, #nice h1 .content"),
            "#article p, #article h1 .content"
        );
        assert_eq!(
            normalize_article_root_text("#wechat-article p"),
            "#article p"
        );
    }

    #[test]
    fn keeps_non_root_names_that_start_with_nice() {
        assert_eq!(normalize_article_root_text("#nice-card p"), "#nice-card p");
        assert_eq!(
            normalize_article_root_text("#nice_legacy p"),
            "#nice_legacy p"
        );
    }

    #[test]
    fn delete_theme_rejects_traversal_and_dot_names() {
        let dir = std::env::temp_dir().join("vellum-theme-delete-reject");
        let _ = std::fs::create_dir_all(&dir);
        assert!(delete_theme_file(&dir, "").is_err());
        assert!(delete_theme_file(&dir, ".hidden").is_err());
        assert!(delete_theme_file(&dir, "a..b").is_err());
        assert!(delete_theme_file(&dir, "../escape").is_err());
        assert!(delete_theme_file(&dir, "a/b").is_err());
        assert!(delete_theme_file(&dir, "a\\b").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_theme_removes_file_and_tolerates_missing() {
        let dir = std::env::temp_dir().join(format!("vellum-theme-delete-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("我的主题.css");
        std::fs::write(&path, "body{}").unwrap();
        assert!(delete_theme_file(&dir, "我的主题").is_ok());
        assert!(!path.exists());
        // 文件不存在视为已删除，不报错。
        assert!(delete_theme_file(&dir, "不存在的主题").is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
