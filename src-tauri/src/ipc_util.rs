//! IPC 请求辅助：从 Tauri 命令的 `tauri::ipc::Request` 读取自定义 header。
//! 大文件命令（upload_image / upload_thumb / write_export_file）走原始二进制
//! 请求体，元数据经 header 传递，避免把二进制扩展成巨大的 JSON 数字数组。

use tauri::ipc::Request;

/// 读取请求头；缺失或非 UTF-8 时报错。
pub fn request_header(request: &Request<'_>, name: &str) -> Result<String, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| format!("请求缺少 {name}"))
}
