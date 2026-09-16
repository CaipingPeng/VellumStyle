// Tauri 命令：取预览图资产、PDF 位图降采样、写文件、复制到剪贴板。
// 由原 preview_image.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

#[tauri::command]
pub async fn get_preview_image_asset(source: String) -> Result<PreviewImageAsset, String> {
    let download = if source
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
    {
        parse_data_url(&source)?
    } else {
        fetch_http_with_policy(
            &source,
            Duration::from_secs(8),
            Duration::from_secs(20),
            NetworkPolicy::Strict,
        )
        .await?
    };
    let kind = identify_image(&download.bytes, download.content_type.as_deref())?;
    Ok(PreviewImageAsset {
        file_name: build_file_name(download.file_name.as_deref(), kind),
        extension: kind.extension().into(),
        mime_type: kind.mime_type().into(),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(download.bytes),
    })
}

/// 将普通 PDF 中超过页面所需分辨率的位图降采样，避免阅读器解码原始大图。
/// 返回值与输入一一对应；无需处理或读取失败的图片返回 None，由前端保留原图。
#[tauri::command]
pub async fn optimize_pdf_images(
    sources: Vec<String>,
    max_width: u32,
) -> Result<Vec<Option<String>>, String> {
    if sources.len() > MAX_PDF_IMAGE_BATCH {
        return Err(format!("PDF image count exceeds {MAX_PDF_IMAGE_BATCH}"));
    }
    if !(800..=3200).contains(&max_width) {
        return Err("PDF image target width is invalid".into());
    }

    let mut optimized = Vec::with_capacity(sources.len());
    for source in sources {
        let result = optimize_pdf_image_source(&source, max_width).await;
        match result {
            Ok(replacement) => optimized.push(replacement),
            Err(error) => {
                eprintln!("[pdf-export] image optimization skipped: {error}");
                optimized.push(None);
            }
        }
    }
    Ok(optimized)
}
pub(crate) async fn optimize_pdf_image_source(source: &str, max_width: u32) -> Result<Option<String>, String> {
    let download = if source
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
    {
        parse_data_url(source)?
    } else {
        fetch_http_with_policy(
            source,
            Duration::from_secs(8),
            Duration::from_secs(20),
            NetworkPolicy::Strict,
        )
        .await?
    };
    optimize_pdf_image_download(&download, max_width)
}
pub(crate) fn optimize_pdf_image_download(
    download: &Download,
    max_width: u32,
) -> Result<Option<String>, String> {
    let kind = identify_image(&download.bytes, download.content_type.as_deref())?;
    if kind == ImageKind::Svg {
        return Ok(None);
    }
    let format = match kind {
        ImageKind::Png => image::ImageFormat::Png,
        ImageKind::Jpeg => image::ImageFormat::Jpeg,
        ImageKind::Gif => image::ImageFormat::Gif,
        ImageKind::WebP => image::ImageFormat::WebP,
        ImageKind::Svg => unreachable!(),
    };
    let image = decode_raster(&download.bytes, format)?;
    if image.width() <= max_width {
        return Ok(None);
    }

    let target_height = ((u64::from(image.height()) * u64::from(max_width))
        .div_ceil(u64::from(image.width())))
    .max(1) as u32;
    let resized = image.resize_exact(
        max_width,
        target_height,
        image::imageops::FilterType::Lanczos3,
    );
    let (mime_type, bytes) = if resized.color().has_alpha() {
        let mut cursor = Cursor::new(Vec::new());
        resized
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|error| format!("unable to encode optimized PNG: {error}"))?;
        ("image/png", cursor.into_inner())
    } else {
        let mut bytes = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 88)
            .encode_image(&resized)
            .map_err(|error| format!("unable to encode optimized JPEG: {error}"))?;
        ("image/jpeg", bytes)
    };
    Ok(Some(format!(
        "data:{mime_type};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )))
}
#[tauri::command]
pub async fn write_preview_image_asset(path: String, bytes_base64: String) -> Result<(), String> {
    let max_base64 = MAX_SOURCE_BYTES.div_ceil(3) * 4;
    if bytes_base64.len() > max_base64 {
        return Err("image exceeds 15 MiB limit".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes_base64)
        .map_err(|_| "malformed base64 image data")?;
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("image exceeds 15 MiB limit".into());
    }
    tokio::fs::write(path, bytes)
        .await
        .map_err(|e| format!("unable to write preview image: {e}"))
}
#[tauri::command]
pub async fn copy_preview_image(app: tauri::AppHandle, source: String) -> Result<(), String> {
    let asset = get_preview_image_asset(source).await?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&asset.bytes_base64)
        .map_err(|_| "invalid preview image asset")?;
    let decoded = decode_for_clipboard(&bytes, Some(&asset.mime_type))?;
    let image = tauri::image::Image::new_owned(decoded.rgba, decoded.width, decoded.height);
    app.clipboard()
        .write_image(&image)
        .map_err(|e| format!("unable to write image to clipboard: {e}"))
}
