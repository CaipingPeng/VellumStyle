use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub content: String,
    pub updated_at: u64,
}

fn templates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位数据目录：{error}"))?
        .join("templates");
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建模板目录失败：{error}"))?;
    Ok(dir)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
}

fn template_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err("非法模板标识".into());
    }
    Ok(templates_dir(app)?.join(format!("{id}.json")))
}

#[tauri::command]
pub fn list_article_templates(app: AppHandle) -> Result<Vec<ArticleTemplate>, String> {
    let mut templates = Vec::new();
    for entry in std::fs::read_dir(templates_dir(&app)?).map_err(|error| format!("读取模板目录失败：{error}"))? {
        let entry = entry.map_err(|error| format!("读取模板条目失败：{error}"))?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(entry.path()) else { continue };
        if let Ok(template) = serde_json::from_str::<ArticleTemplate>(&text) {
            templates.push(template);
        }
    }
    templates.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(templates)
}

#[tauri::command]
pub fn save_article_template(app: AppHandle, template: ArticleTemplate) -> Result<(), String> {
    if template.name.trim().is_empty() {
        return Err("模板名称不能为空".into());
    }
    let path = template_path(&app, &template.id)?;
    let text = serde_json::to_string_pretty(&template).map_err(|error| format!("序列化模板失败：{error}"))?;
    std::fs::write(path, text).map_err(|error| format!("保存模板失败：{error}"))
}

#[tauri::command]
pub fn delete_article_template(app: AppHandle, id: String) -> Result<(), String> {
    let path = template_path(&app, &id)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| format!("删除模板失败：{error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::valid_id;

    #[test]
    fn template_id_cannot_escape_its_directory() {
        assert!(valid_id("template-123_abc"));
        assert!(!valid_id("../template"));
        assert!(!valid_id("a/b"));
        assert!(!valid_id(""));
    }
}
