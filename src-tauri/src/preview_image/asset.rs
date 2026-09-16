// 预览图片资产：对外 DTO、格式识别与解码（含剪贴板 RGBA 转换）。
// 由原 preview_image.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

pub const MAX_SOURCE_BYTES: usize = 15 * 1024 * 1024;
pub(crate) const MAX_DIMENSION: u32 = 16_384;
pub(crate) const MAX_PDF_IMAGE_BATCH: usize = 200;
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewImageAsset {
    pub bytes_base64: String,
    pub mime_type: String,
    pub file_name: String,
    pub extension: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ImageKind {
    Png,
    Jpeg,
    Gif,
    WebP,
    Svg,
}

impl ImageKind {
    pub(crate) fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Gif => "image/gif",
            Self::WebP => "image/webp",
            Self::Svg => "image/svg+xml",
        }
    }
    pub(crate) fn extension(self) -> &'static str {
        match self {
            Self::Png => ".png",
            Self::Jpeg => ".jpg",
            Self::Gif => ".gif",
            Self::WebP => ".webp",
            Self::Svg => ".svg",
        }
    }
}
pub(crate) struct Download {
    pub(crate) bytes: Vec<u8>,
    pub(crate) content_type: Option<String>,
    pub(crate) file_name: Option<String>,
}
pub(crate) struct DecodedImage {
    pub(crate) rgba: Vec<u8>,
    pub(crate) width: u32,
    pub(crate) height: u32,
}
pub(crate) fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 || width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err("image dimensions exceed safety limits".into());
    }
    Ok(())
}
pub(crate) fn identify_image(bytes: &[u8], _declared_mime: Option<&str>) -> Result<ImageKind, String> {
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("image exceeds 15 MiB limit".into());
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        return Err("compressed SVG/SVGZ is not supported".into());
    }
    if let Ok(tree) = parse_svg(bytes) {
        let size = tree.size().to_int_size();
        validate_dimensions(size.width(), size.height())?;
        return Ok(ImageKind::Svg);
    }
    let format =
        image::guess_format(bytes).map_err(|_| "response is not a supported image".to_string())?;
    let kind = match format {
        image::ImageFormat::Png => ImageKind::Png,
        image::ImageFormat::Jpeg => ImageKind::Jpeg,
        image::ImageFormat::Gif => ImageKind::Gif,
        image::ImageFormat::WebP => ImageKind::WebP,
        _ => return Err("unsupported image format".into()),
    };
    decode_raster(bytes, format)?;
    Ok(kind)
}
pub(crate) fn decode_raster(bytes: &[u8], format: image::ImageFormat) -> Result<image::DynamicImage, String> {
    let reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("invalid image: {e}"))?;
    validate_dimensions(width, height)?;
    let image = image::load_from_memory_with_format(bytes, format)
        .map_err(|e| format!("unable to fully decode image: {e}"))?;
    let (width, height) = image.dimensions();
    validate_dimensions(width, height)?;
    Ok(image)
}
pub(crate) fn build_file_name(candidate: Option<&str>, kind: ImageKind) -> String {
    let raw = candidate
        .unwrap_or("image")
        .split(['?', '#'])
        .next()
        .unwrap_or("image");
    let leaf = raw.rsplit(['/', '\\']).next().unwrap_or("image");
    let stem = leaf.rsplit_once('.').map_or(leaf, |(stem, _)| stem);
    let mut clean: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    clean = clean.trim_matches([' ', '.']).to_string();
    if clean.is_empty() || clean == "." || clean == ".." {
        clean = "image".into();
    }
    let device_component = clean
        .split('.')
        .next()
        .unwrap_or(&clean)
        .to_ascii_uppercase();
    let dangerous = matches!(
        device_component.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$"
    ) || device_component
        .strip_prefix("COM")
        .is_some_and(|n| matches!(n, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"))
        || device_component
            .strip_prefix("LPT")
            .is_some_and(|n| matches!(n, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"));
    if dangerous {
        clean.insert(0, '_');
    }
    clean = clean
        .chars()
        .scan(0usize, |bytes, c| {
            let next = *bytes + c.len_utf8();
            if next > 180 {
                None
            } else {
                *bytes = next;
                Some(c)
            }
        })
        .collect();
    format!("{clean}{}", kind.extension())
}
pub(crate) fn straight_rgba(mut rgba: Vec<u8>) -> Vec<u8> {
    for pixel in rgba.chunks_exact_mut(4) {
        let alpha = u32::from(pixel[3]);
        if alpha != 0 && alpha != 255 {
            for channel in &mut pixel[..3] {
                *channel = ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8;
            }
        }
    }
    rgba
}
pub(crate) fn decode_for_clipboard(bytes: &[u8], declared_mime: Option<&str>) -> Result<DecodedImage, String> {
    let kind = identify_image(bytes, declared_mime)?;
    if kind == ImageKind::Svg {
        let tree = parse_svg(bytes)?;
        let size = tree.size().to_int_size();
        validate_dimensions(size.width(), size.height())?;
        let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height())
            .ok_or("unable to allocate SVG surface")?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::default(),
            &mut pixmap.as_mut(),
        );
        return Ok(DecodedImage {
            rgba: straight_rgba(pixmap.take()),
            width: size.width(),
            height: size.height(),
        });
    }
    let format = match kind {
        ImageKind::Png => image::ImageFormat::Png,
        ImageKind::Jpeg => image::ImageFormat::Jpeg,
        ImageKind::Gif => image::ImageFormat::Gif,
        ImageKind::WebP => image::ImageFormat::WebP,
        ImageKind::Svg => unreachable!(),
    };
    let image = decode_raster(bytes, format)?;
    let (width, height) = image.dimensions();
    Ok(DecodedImage {
        rgba: image.into_rgba8().into_raw(),
        width,
        height,
    })
}
