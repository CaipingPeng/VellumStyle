// 共用常量、上传进度事件、微信接口响应 DTO、错误格式化，以及图片 mime / SVG / 文件名工具。
// 由原 wechat.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

pub(crate) const MAX_SIZE: usize = 10 * 1024 * 1024; // add_material 图片限制 10MB
pub(crate) const TARGET_SIZE: usize = MAX_SIZE; // 实测微信接受正好 10MiB，超出 1 字节返回 45001
pub(crate) const MAX_SOURCE_SIZE: usize = 50 * 1024 * 1024;
pub(crate) const MAX_PROXY_BYTES: usize = 15 * 1024 * 1024; // wximg 代理响应体上限，与预览图下载一致
pub(crate) const PNG_LOSSLESS_RETRY_RATIO: usize = 5;
pub(crate) const ALLOWED_TYPES: [&str; 3] = ["image/jpeg", "image/png", "image/gif"];
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImageUploadProgress {
    pub(crate) task_id: String,
    pub(crate) phase: &'static str,
    pub(crate) filename: String,
    pub(crate) original_size: Option<usize>,
    pub(crate) output_size: Option<usize>,
}

pub(crate) fn emit_upload_progress(
    app: &AppHandle,
    task_id: &Option<String>,
    phase: &'static str,
    filename: &str,
    original_size: Option<usize>,
    output_size: Option<usize>,
) {
    let Some(task_id) = task_id.as_ref() else {
        return;
    };
    let _ = app.emit(
        "image-upload-progress",
        ImageUploadProgress {
            task_id: task_id.clone(),
            phase,
            filename: filename.to_string(),
            original_size,
            output_size,
        },
    );
}
#[derive(Deserialize)]
pub(crate) struct TokenResp {
    pub(crate) access_token: Option<String>,
    pub(crate) expires_in: Option<u64>,
    pub(crate) errcode: Option<i64>,
    pub(crate) errmsg: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct UploadResp {
    pub(crate) url: Option<String>,
    pub(crate) media_id: Option<String>,
    pub(crate) errcode: Option<i64>,
    pub(crate) errmsg: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct MaterialListResp {
    pub(crate) total_count: Option<u32>,
    pub(crate) item_count: Option<u32>,
    pub(crate) item: Option<Vec<RawMaterialItem>>,
    pub(crate) errcode: Option<i64>,
    pub(crate) errmsg: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct MaterialActionResp {
    pub(crate) errcode: Option<i64>,
    pub(crate) errmsg: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct RawMaterialItem {
    pub(crate) media_id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) update_time: Option<u64>,
    pub(crate) url: Option<String>,
    pub(crate) cover_url: Option<String>,
    pub(crate) vid: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImageItem {
    pub(crate) media_id: String,
    pub(crate) name: String,
    pub(crate) update_time: u64,
    pub(crate) url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImagePage {
    pub(crate) total_count: u32,
    pub(crate) item_count: u32,
    pub(crate) items: Vec<MaterialImageItem>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVideoItem {
    pub(crate) media_id: String,
    pub(crate) name: String,
    pub(crate) update_time: u64,
    pub(crate) cover_url: String,
    pub(crate) vid: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVideoPage {
    pub(crate) total_count: u32,
    pub(crate) item_count: u32,
    pub(crate) items: Vec<MaterialVideoItem>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVoiceItem {
    pub(crate) media_id: String,
    pub(crate) name: String,
    pub(crate) update_time: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVoicePage {
    pub(crate) total_count: u32,
    pub(crate) item_count: u32,
    pub(crate) items: Vec<MaterialVoiceItem>,
}
pub(crate) fn format_wechat_error(errcode: Option<i64>, errmsg: &str, context: &str) -> String {
    let msg = errmsg.trim();
    let detail = match (errcode, msg.is_empty()) {
        (Some(code), false) => format!("{code} {msg}"),
        (Some(code), true) => code.to_string(),
        (None, false) => msg.to_string(),
        (None, true) => String::new(),
    };

    let base = if detail.is_empty() || detail == context {
        context.to_string()
    } else {
        format!("{context}：{detail}")
    };

    if is_wechat_ip_whitelist_error(errcode, msg) {
        format!("{base}。{WECHAT_IP_WHITELIST_HINT}")
    } else {
        base
    }
}

pub(crate) fn is_wechat_ip_whitelist_error(errcode: Option<i64>, errmsg: &str) -> bool {
    if errcode == Some(40164) {
        return true;
    }

    let lower = errmsg.to_ascii_lowercase();
    lower.contains("invalid ip")
        || lower.contains("not in whitelist")
        || lower.contains("ip whitelist")
        || lower.contains("ip white list")
        || lower.contains("ip.white_list")
        || lower.contains("white_list")
        || lower.contains("白名单")
}
pub(crate) fn mime_from_path(path: &Path) -> Option<&'static str> {
    path.extension()
        .and_then(|v| v.to_str())
        .and_then(|ext| mime_from_ext(ext))
}

pub(crate) fn mime_from_url_path(path: &str) -> Option<&'static str> {
    Path::new(path)
        .extension()
        .and_then(|v| v.to_str())
        .and_then(mime_from_ext)
}

pub(crate) fn mime_from_ext(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

// 部分微信表情 CDN 响应不带 Content-Type 且 URL 无扩展名，
// 直接从文件头识别图片类型。
pub(crate) fn mime_from_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else {
        None
    }
}

pub(crate) fn convert_svg_to_png(svg_path: &Path) -> Result<Vec<u8>, String> {
    let svg_data = fs::read(svg_path).map_err(|e| format!("读取 SVG 文件失败：{e}"))?;

    let mut opt = usvg::Options::default();
    opt.fontdb_mut().load_system_fonts();

    let tree =
        usvg::Tree::from_data(&svg_data, &opt).map_err(|e| format!("解析 SVG 文件失败：{e}"))?;

    let size = tree.size();
    let width = size.width() as u32;
    let height = size.height() as u32;

    // 限制最大尺寸，避免内存溢出
    let max_dimension = 4096;
    let (width, height) = if width > max_dimension || height > max_dimension {
        let scale = (max_dimension as f32) / width.max(height) as f32;
        (
            (width as f32 * scale) as u32,
            (height as f32 * scale) as u32,
        )
    } else {
        (width, height)
    };

    let mut pixmap =
        tiny_skia::Pixmap::new(width, height).ok_or_else(|| "创建图片缓冲区失败".to_string())?;

    let transform = if width != size.width() as u32 || height != size.height() as u32 {
        let scale_x = width as f32 / size.width();
        let scale_y = height as f32 / size.height();
        tiny_skia::Transform::from_scale(scale_x, scale_y)
    } else {
        tiny_skia::Transform::identity()
    };

    resvg::render(&tree, transform, &mut pixmap.as_mut());

    pixmap
        .encode_png()
        .map_err(|e| format!("PNG 编码失败：{e}"))
}

pub(crate) fn normalize_mime(content_type: &str) -> Option<&'static str> {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match mime.as_str() {
        "image/jpeg" | "image/jpg" => Some("image/jpeg"),
        "image/png" => Some("image/png"),
        "image/gif" => Some("image/gif"),
        _ => None,
    }
}

pub(crate) fn looks_like_image_bytes(bytes: &[u8], mime: &str) -> bool {
    match mime {
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        _ => false,
    }
}

pub(crate) fn filename_from_remote_url(target: &url::Url, mime: &str) -> String {
    let name = target
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|v| !v.is_empty())
        .unwrap_or("remote-image");
    if mime_from_url_path(name).is_some() {
        name.to_string()
    } else {
        format!("{}.{}", name, ext_from_mime(mime))
    }
}

pub(crate) fn ext_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        _ => "jpg",
    }
}
