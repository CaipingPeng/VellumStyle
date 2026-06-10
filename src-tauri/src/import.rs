use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

const IMAGE_EXTS: [&str; 4] = ["jpg", "jpeg", "png", "gif"];
const COMMON_ASSET_DIRS: [&str; 4] = ["assets", "images", "attachments", "附件"];
const MAX_RECURSIVE_SEARCH_FILES: usize = 5000;

#[derive(Serialize)]
pub struct MarkdownFilePayload {
    path: String,
    base_dir: String,
    content: String,
}

#[derive(Serialize)]
pub struct ResolvedMedia {
    status: String,
    path: Option<String>,
    candidates: Vec<String>,
    reason: Option<String>,
}

#[tauri::command]
pub fn pick_markdown_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_pick_file();
    Ok(path.and_then(|p| p.as_path().map(path_to_string)))
}

#[tauri::command]
pub fn pick_image_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("图片", &IMAGE_EXTS)
        .blocking_pick_file();
    Ok(path.and_then(|p| p.as_path().map(path_to_string)))
}

#[tauri::command]
pub fn pick_resource_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app.dialog().file().blocking_pick_folder();
    Ok(path.and_then(|p| p.as_path().map(path_to_string)))
}

#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<MarkdownFilePayload, String> {
    let path = fs::canonicalize(path).map_err(|e| format!("读取 Markdown 路径失败：{e}"))?;
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(ext.as_str(), "md" | "markdown") {
        return Err("请选择 .md 或 .markdown 文件".into());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("读取 Markdown 文件失败：{e}"))?;
    let base_dir = path
        .parent()
        .ok_or_else(|| "无法确定 Markdown 所在目录".to_string())?
        .to_path_buf();

    Ok(MarkdownFilePayload {
        path: path_to_string(&path),
        base_dir: path_to_string(&base_dir),
        content,
    })
}

#[tauri::command]
pub fn resolve_import_media(
    base_dir: String,
    resource_root: Option<String>,
    raw_url: String,
) -> Result<ResolvedMedia, String> {
    let base_dir = fs::canonicalize(base_dir).map_err(|e| format!("解析 Markdown 目录失败：{e}"))?;
    let resource_root = resource_root
        .filter(|v| !v.trim().is_empty())
        .map(fs::canonicalize)
        .transpose()
        .map_err(|e| format!("解析资源目录失败：{e}"))?;

    let Some(local) = parse_local_path(&raw_url)? else {
        return Ok(ResolvedMedia {
            status: "unsupported".into(),
            path: None,
            candidates: vec![],
            reason: Some("不是可解析的本地路径".into()),
        });
    };

    let mut candidates = Vec::new();

    if local.is_absolute() {
        push_existing_image(&mut candidates, local);
    } else {
        push_existing_image(&mut candidates, base_dir.join(&local));

        if let Some(filename) = local.file_name() {
            for dir in COMMON_ASSET_DIRS {
                push_existing_image(&mut candidates, base_dir.join(dir).join(filename));
            }
        }

        if let Some(root) = &resource_root {
            push_existing_image(&mut candidates, root.join(&local));
            if let Some(filename) = local.file_name().and_then(|v| v.to_str()) {
                search_by_filename(root, filename, &mut candidates)?;
            }
        }
    }

    candidates.sort();
    candidates.dedup();

    match candidates.len() {
        0 => Ok(ResolvedMedia {
            status: "missing".into(),
            path: None,
            candidates,
            reason: Some("未找到本地图片文件".into()),
        }),
        1 => Ok(ResolvedMedia {
            status: "found".into(),
            path: candidates.first().cloned(),
            candidates,
            reason: None,
        }),
        _ => Ok(ResolvedMedia {
            status: "ambiguous".into(),
            path: None,
            candidates,
            reason: Some("找到多个同名图片，未自动选择".into()),
        }),
    }
}

fn parse_local_path(raw_url: &str) -> Result<Option<PathBuf>, String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return Ok(None);
    }

    let decoded = urlencoding::decode(trimmed)
        .map_err(|e| format!("路径解码失败：{e}"))?
        .into_owned();
    let without_anchor = decoded
        .split_once('#')
        .map(|(path, _)| path)
        .unwrap_or(decoded.as_str());
    let without_query = without_anchor
        .split_once('?')
        .map(|(path, _)| path)
        .unwrap_or(without_anchor);

    if without_query.starts_with("file://") {
        let url = url::Url::parse(without_query).map_err(|_| "file URL 格式错误".to_string())?;
        return url
            .to_file_path()
            .map(Some)
            .map_err(|_| "file URL 无法转换为本地路径".to_string());
    }

    if looks_like_url_scheme(without_query) {
        return Ok(None);
    }

    Ok(Some(PathBuf::from(without_query)))
}

fn looks_like_url_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    if scheme.len() == 1 && scheme.as_bytes()[0].is_ascii_alphabetic() {
        return false;
    }
    scheme
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
}

fn push_existing_image(candidates: &mut Vec<String>, path: PathBuf) {
    if !is_supported_image_path(&path) || !path.is_file() {
        return;
    }
    if let Ok(path) = fs::canonicalize(path) {
        candidates.push(path_to_string(&path));
    }
}

fn search_by_filename(root: &Path, filename: &str, candidates: &mut Vec<String>) -> Result<(), String> {
    let mut stack = vec![root.to_path_buf()];
    let mut visited = 0usize;

    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            visited += 1;
            if visited > MAX_RECURSIVE_SEARCH_FILES {
                return Err("资源目录文件过多，请选择更精确的附件目录".into());
            }

            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
                continue;
            };
            if name.eq_ignore_ascii_case(filename) {
                push_existing_image(candidates, path);
            }
        }
    }

    Ok(())
}

fn is_supported_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|v| v.to_str())
        .map(|ext| IMAGE_EXTS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
