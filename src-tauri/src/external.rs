fn normalize_external_url(raw_url: &str) -> Result<String, String> {
    let target = url::Url::parse(raw_url.trim()).map_err(|_| "链接格式错误".to_string())?;
    match target.scheme() {
        "http" | "https" => Ok(target.as_str().to_string()),
        _ => Err("只允许打开 http/https 链接".to_string()),
    }
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let target = normalize_external_url(&url)?;

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", target.as_str()])
        .spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&target).spawn();

    result.map(|_| ()).map_err(|e| format!("打开链接失败：{e}"))
}

#[cfg(test)]
mod tests {
    use super::normalize_external_url;

    #[test]
    fn accepts_https_urls() {
        assert_eq!(
            normalize_external_url(" https://my.feishu.cn/docx/RUDpd1zWnoWuuyx0uFxcahIGnmC ")
                .unwrap(),
            "https://my.feishu.cn/docx/RUDpd1zWnoWuuyx0uFxcahIGnmC"
        );
    }

    #[test]
    fn rejects_non_web_urls() {
        assert!(normalize_external_url("file:///C:/Windows/System32/calc.exe").is_err());
    }
}
