// 文档树：app_data_dir/documents/ 是唯一真相源。文件夹=树节点，.md=文档。
// 所有路径参数 = 相对 documents/ 的相对路径；沙箱校验防 ../ 逃逸。

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct DocNode {
    pub name: String,
    pub path: String, // 相对 documents/ 的路径，正斜杠分隔
    pub is_dir: bool,
    pub children: Vec<DocNode>,
}

fn documents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录：{e}"))?
        .join("documents");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建文档目录失败：{e}"))?;
    Ok(dir)
}

// 名称非法字符过滤（Windows 文件名约束 + 路径分隔符）。
fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        && name != "."
        && name != ".."
}

// 把相对路径解析为 documents/ 下的绝对路径，校验不逃逸。
// 用逐段拼接（不依赖文件存在，create 场景目标尚不存在），拒绝 .. 与绝对段。
fn resolve_in_documents(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    let base = documents_dir(app)?;
    let mut full = base.clone();
    for seg in rel.split(['/', '\\']) {
        if seg.is_empty() {
            continue;
        }
        if seg == ".." || seg == "." {
            return Err("非法路径".into());
        }
        full.push(seg);
    }
    // 二次保险：规范化后仍须在 base 内（base 已存在可 canonicalize）。
    let canon_base = std::fs::canonicalize(&base).map_err(|e| format!("{e}"))?;
    if let Ok(canon_full) = std::fs::canonicalize(&full) {
        if !canon_full.starts_with(&canon_base) {
            return Err("非法路径".into());
        }
    }
    Ok(full)
}

fn rel_path(base: &Path, full: &Path) -> String {
    full.strip_prefix(base)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

fn scan(dir: &Path, base: &Path) -> Vec<DocNode> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<DocNode> = Vec::new();
    let mut files: Vec<DocNode> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
            dirs.push(DocNode {
                name,
                path: rel_path(base, &path),
                is_dir: true,
                children: scan(&path, base),
            });
        } else {
            let is_md = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("md"))
                .unwrap_or(false);
            if !is_md {
                continue;
            }
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            files.push(DocNode {
                name,
                path: rel_path(base, &path),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }
    dirs.sort_by(|a, b| a.name.cmp(&b.name));
    files.sort_by(|a, b| a.name.cmp(&b.name));
    dirs.into_iter().chain(files).collect()
}

#[tauri::command]
pub fn list_documents(app: AppHandle) -> Result<Vec<DocNode>, String> {
    let base = documents_dir(&app)?;
    Ok(scan(&base, &base))
}

#[tauri::command]
pub fn read_document(app: AppHandle, path: String) -> Result<String, String> {
    let full = resolve_in_documents(&app, &path)?;
    std::fs::read_to_string(&full).map_err(|e| format!("读取文档失败：{e}"))
}

#[tauri::command]
pub fn write_document(app: AppHandle, path: String, text: String) -> Result<(), String> {
    let full = resolve_in_documents(&app, &path)?;
    std::fs::write(&full, text).map_err(|e| format!("写入文档失败：{e}"))
}

#[tauri::command]
pub fn create_document(app: AppHandle, dir: String, name: String) -> Result<String, String> {
    if !is_valid_name(&name) {
        return Err("名称含非法字符".into());
    }
    let base = documents_dir(&app)?;
    let parent = resolve_in_documents(&app, &dir)?;
    std::fs::create_dir_all(&parent).map_err(|e| format!("{e}"))?;
    let full = parent.join(format!("{name}.md"));
    if full.exists() {
        return Err("已存在同名文档".into());
    }
    std::fs::write(&full, "").map_err(|e| format!("创建文档失败：{e}"))?;
    Ok(rel_path(&base, &full))
}

#[tauri::command]
pub fn create_folder(app: AppHandle, dir: String, name: String) -> Result<String, String> {
    if !is_valid_name(&name) {
        return Err("名称含非法字符".into());
    }
    let base = documents_dir(&app)?;
    let parent = resolve_in_documents(&app, &dir)?;
    let full = parent.join(&name);
    if full.exists() {
        return Err("已存在同名文件夹".into());
    }
    std::fs::create_dir_all(&full).map_err(|e| format!("创建文件夹失败：{e}"))?;
    Ok(rel_path(&base, &full))
}

#[tauri::command]
pub fn rename_entry(app: AppHandle, path: String, new_name: String) -> Result<String, String> {
    if !is_valid_name(&new_name) {
        return Err("名称含非法字符".into());
    }
    let base = documents_dir(&app)?;
    let full = resolve_in_documents(&app, &path)?;
    if !full.exists() {
        return Err("条目不存在".into());
    }
    let is_dir = full.is_dir();
    let parent = full.parent().ok_or_else(|| "无父目录".to_string())?;
    let target = if is_dir {
        parent.join(&new_name)
    } else {
        parent.join(format!("{new_name}.md"))
    };
    if target.exists() {
        return Err("目标名已存在".into());
    }
    std::fs::rename(&full, &target).map_err(|e| format!("重命名失败：{e}"))?;
    Ok(rel_path(&base, &target))
}

#[tauri::command]
pub fn delete_entry(app: AppHandle, path: String) -> Result<(), String> {
    let full = resolve_in_documents(&app, &path)?;
    if !full.exists() {
        return Err("条目不存在".into());
    }
    if full.is_dir() {
        let empty = std::fs::read_dir(&full)
            .map(|mut e| e.next().is_none())
            .unwrap_or(false);
        if !empty {
            return Err("文件夹非空，请先清空".into());
        }
        std::fs::remove_dir(&full).map_err(|e| format!("删除失败：{e}"))
    } else {
        std::fs::remove_file(&full).map_err(|e| format!("删除失败：{e}"))
    }
}

/// 移动文件/文件夹到目标目录。src/dest_dir 为相对 documents/ 的路径（dest_dir 空串=根）。
/// 沙箱校验；目标已存在同名拒绝；禁止把文件夹移进自身或其子孙（成环）。
#[tauri::command]
pub fn move_entry(app: AppHandle, src: String, dest_dir: String) -> Result<String, String> {
    let base = documents_dir(&app)?;
    let from = resolve_in_documents(&app, &src)?;
    if !from.exists() {
        return Err("条目不存在".into());
    }
    let dest_parent = resolve_in_documents(&app, &dest_dir)?;
    if !dest_parent.is_dir() {
        return Err("目标不是文件夹".into());
    }
    let name = from.file_name().ok_or_else(|| "无效来源".to_string())?;
    let target = dest_parent.join(name);

    // 同位置移动：no-op，直接返回原相对路径。
    if target == from {
        return Ok(rel_path(&base, &from));
    }
    if target.exists() {
        return Err("目标位置已存在同名条目".into());
    }
    // 防成环：目标目录不能是来源文件夹自身或其子孙。
    if from.is_dir() {
        let canon_from = std::fs::canonicalize(&from).map_err(|e| format!("{e}"))?;
        let canon_dest = std::fs::canonicalize(&dest_parent).map_err(|e| format!("{e}"))?;
        if canon_dest.starts_with(&canon_from) {
            return Err("不能把文件夹移动到它自己的子目录".into());
        }
    }
    std::fs::rename(&from, &target).map_err(|e| format!("移动失败：{e}"))?;
    Ok(rel_path(&base, &target))
}

#[cfg(test)]
mod tests {
    use super::is_valid_name;

    #[test]
    fn rejects_path_separators_and_dotdot() {
        assert!(!is_valid_name(""));
        assert!(!is_valid_name(".."));
        assert!(!is_valid_name("a/b"));
        assert!(!is_valid_name("a\\b"));
        assert!(!is_valid_name("a:b"));
        assert!(is_valid_name("周报"));
        assert!(is_valid_name("2026-周报_v1"));
    }
}
