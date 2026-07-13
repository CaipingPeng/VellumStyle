use std::io::Cursor;
use std::time::Duration;

use base64::Engine;
use image::GenericImageView;
use reqwest::header::{CONTENT_DISPOSITION, CONTENT_TYPE, REFERER};
use tauri_plugin_clipboard_manager::ClipboardExt;
use url::Url;

pub const MAX_SOURCE_BYTES: usize = 15 * 1024 * 1024;
const MAX_DIMENSION: u32 = 16_384;
const MAX_PIXELS: u64 = 40_000_000;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewImageAsset {
    pub bytes: Vec<u8>,
    pub mime_type: String,
    pub file_name: String,
    pub extension: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ImageKind {
    Png,
    Jpeg,
    Gif,
    WebP,
    Svg,
}

impl ImageKind {
    fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Gif => "image/gif",
            Self::WebP => "image/webp",
            Self::Svg => "image/svg+xml",
        }
    }
    fn extension(self) -> &'static str {
        match self {
            Self::Png => ".png",
            Self::Jpeg => ".jpg",
            Self::Gif => ".gif",
            Self::WebP => ".webp",
            Self::Svg => ".svg",
        }
    }
}

struct Download {
    bytes: Vec<u8>,
    content_type: Option<String>,
    file_name: Option<String>,
}
struct DecodedImage {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0
        || height == 0
        || width > MAX_DIMENSION
        || height > MAX_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err("image dimensions exceed safety limits".into());
    }
    Ok(())
}

fn parse_svg(bytes: &[u8]) -> Result<resvg::usvg::Tree, String> {
    let mut options = resvg::usvg::Options::default();
    options.resources_dir = None;
    resvg::usvg::Tree::from_data(bytes, &options).map_err(|e| format!("invalid SVG: {e}"))
}

fn identify_image(bytes: &[u8], _declared_mime: Option<&str>) -> Result<ImageKind, String> {
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("image exceeds 15 MiB limit".into());
    }
    if parse_svg(bytes).is_ok() {
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
    let reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("invalid image: {e}"))?;
    validate_dimensions(width, height)?;
    Ok(kind)
}

fn build_file_name(candidate: Option<&str>, kind: ImageKind) -> String {
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
    clean.truncate(180);
    format!("{clean}{}", kind.extension())
}

fn decode_for_clipboard(bytes: &[u8], declared_mime: Option<&str>) -> Result<DecodedImage, String> {
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
            rgba: pixmap.take(),
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
    let reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let (width, height) = reader
        .into_dimensions()
        .map_err(|e| format!("invalid image: {e}"))?;
    validate_dimensions(width, height)?;
    let image = image::load_from_memory_with_format(bytes, format)
        .map_err(|e| format!("unable to decode image: {e}"))?;
    let (width, height) = image.dimensions();
    validate_dimensions(width, height)?;
    Ok(DecodedImage {
        rgba: image.into_rgba8().into_raw(),
        width,
        height,
    })
}

#[cfg(test)]
fn prepare_http_request(source: &str) -> Result<reqwest::Request, String> {
    let mut url = Url::parse(source).map_err(|_| "invalid image URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only HTTP(S) image URLs are allowed".into());
    }
    let wechat = matches!(url.host_str(), Some("mmbiz.qpic.cn" | "mmbiz.qlogo.cn"));
    if wechat && url.scheme() == "http" {
        url.set_scheme("https").map_err(|_| "invalid image URL")?;
    }
    let client = http_client(Duration::from_secs(8), Duration::from_secs(20))?;
    let mut request = client.get(url);
    if wechat {
        request = request.header(REFERER, "https://mp.weixin.qq.com");
    }
    request
        .build()
        .map_err(|e| format!("unable to build image request: {e}"))
}

fn http_client(
    connect_timeout: Duration,
    total_timeout: Duration,
) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(connect_timeout)
        .timeout(total_timeout)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("unable to create HTTP client: {e}"))
}

async fn fetch_http_with_timeouts(
    source: &str,
    connect_timeout: Duration,
    total_timeout: Duration,
) -> Result<Download, String> {
    let mut url = Url::parse(source).map_err(|_| "invalid image URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only HTTP(S) image URLs are allowed".into());
    }
    let wechat = matches!(url.host_str(), Some("mmbiz.qpic.cn" | "mmbiz.qlogo.cn"));
    if wechat && url.scheme() == "http" {
        url.set_scheme("https").map_err(|_| "invalid image URL")?;
    }
    let client = http_client(connect_timeout, total_timeout)?;
    let operation = async {
        let mut request = client.get(url.clone());
        if wechat {
            request = request.header(REFERER, "https://mp.weixin.qq.com");
        }
        let mut response = request
            .send()
            .await
            .map_err(|e| format!("image download failed: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("image server returned HTTP {}", response.status()));
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_SOURCE_BYTES as u64)
        {
            return Err("image exceeds 15 MiB limit".into());
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let file_name = response
            .headers()
            .get(CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
            .and_then(disposition_filename)
            .or_else(|| {
                url.path_segments()
                    .and_then(Iterator::last)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
            });
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| format!("image download failed: {e}"))?
        {
            if bytes.len().saturating_add(chunk.len()) > MAX_SOURCE_BYTES {
                return Err("image exceeds 15 MiB limit".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        identify_image(&bytes, content_type.as_deref())?;
        Ok(Download {
            bytes,
            content_type,
            file_name,
        })
    };
    tokio::time::timeout(total_timeout, operation)
        .await
        .map_err(|_| "image download timed out".to_string())?
}

fn disposition_filename(value: &str) -> Option<String> {
    value
        .split(';')
        .map(str::trim)
        .find_map(|part| {
            part.strip_prefix("filename=")
                .map(|v| v.trim_matches('"').to_owned())
        })
        .filter(|v| !v.is_empty())
}

fn parse_data_url(source: &str) -> Result<Download, String> {
    let (metadata, payload) = source
        .strip_prefix("data:")
        .and_then(|s| s.split_once(','))
        .ok_or("malformed data URL")?;
    let mut parts = metadata.split(';');
    let mime = parts.next().unwrap_or_default().to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return Err("data URL must contain an image".into());
    }
    let is_base64 = parts.any(|p| p.eq_ignore_ascii_case("base64"));
    if payload.len() > MAX_SOURCE_BYTES * 4 / 3 + 16 {
        return Err("image exceeds 15 MiB limit".into());
    }
    let bytes = if is_base64 {
        base64::engine::general_purpose::STANDARD
            .decode(payload)
            .map_err(|_| "malformed base64 data URL")?
    } else {
        urlencoding::decode_binary(payload.as_bytes()).into_owned()
    };
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("image exceeds 15 MiB limit".into());
    }
    identify_image(&bytes, Some(&mime))?;
    Ok(Download {
        bytes,
        content_type: Some(mime),
        file_name: None,
    })
}

#[tauri::command]
pub async fn get_preview_image_asset(source: String) -> Result<PreviewImageAsset, String> {
    let download = if source.starts_with("data:") {
        parse_data_url(&source)?
    } else {
        fetch_http_with_timeouts(&source, Duration::from_secs(8), Duration::from_secs(20)).await?
    };
    let kind = identify_image(&download.bytes, download.content_type.as_deref())?;
    Ok(PreviewImageAsset {
        file_name: build_file_name(download.file_name.as_deref(), kind),
        extension: kind.extension().into(),
        mime_type: kind.mime_type().into(),
        bytes: download.bytes,
    })
}

#[tauri::command]
pub async fn copy_preview_image(app: tauri::AppHandle, source: String) -> Result<(), String> {
    let asset = get_preview_image_asset(source).await?;
    let decoded = decode_for_clipboard(&asset.bytes, Some(&asset.mime_type))?;
    let image = tauri::image::Image::new_owned(decoded.rgba, decoded.width, decoded.height);
    app.clipboard()
        .write_image(&image)
        .map_err(|e| format!("unable to write image to clipboard: {e}"))
}
#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::Duration;

    use base64::Engine;

    use super::*;

    fn encoded(format: image::ImageFormat, width: u32, height: u32) -> Vec<u8> {
        let pixels = vec![255_u8; width as usize * height as usize * 4];
        let image = image::RgbaImage::from_raw(width, height, pixels).unwrap();
        let mut out = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut out, format)
            .unwrap();
        out.into_inner()
    }

    fn animated_gif() -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = image::codecs::gif::GifEncoder::new(&mut bytes);
            for color in [[255, 0, 0, 255], [0, 0, 255, 255]] {
                let frame =
                    image::Frame::new(image::RgbaImage::from_pixel(2, 3, image::Rgba(color)));
                encoder.encode_frame(frame).unwrap();
            }
        }
        bytes
    }

    fn svg(width: u32, height: u32) -> Vec<u8> {
        format!(r#"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"><rect width="100%" height="100%" fill="red"/></svg>"#).into_bytes()
    }

    fn serve(responses: Vec<String>, delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0_u8; 4096];
                let _ = stream.read(&mut request);
                thread::sleep(delay);
                stream.write_all(response.as_bytes()).unwrap();
            }
        });
        format!("http://{address}")
    }

    fn response(status: &str, headers: &str, body: &[u8]) -> String {
        format!(
            "HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            String::from_utf8_lossy(body)
        )
    }

    #[test]
    fn identifies_supported_formats_by_content() {
        for (format, mime, extension) in [
            (image::ImageFormat::Png, "image/png", ".png"),
            (image::ImageFormat::Jpeg, "image/jpeg", ".jpg"),
            (image::ImageFormat::Gif, "image/gif", ".gif"),
            (image::ImageFormat::WebP, "image/webp", ".webp"),
        ] {
            let bytes = encoded(format, 2, 3);
            let kind = identify_image(&bytes, Some("image/png")).unwrap();
            assert_eq!((kind.mime_type(), kind.extension()), (mime, extension));
        }
        let kind = identify_image(&svg(2, 3), Some("application/octet-stream")).unwrap();
        assert_eq!(
            (kind.mime_type(), kind.extension()),
            ("image/svg+xml", ".svg")
        );
    }

    #[test]
    fn content_signature_wins_over_declared_mime_and_invalid_content_is_rejected() {
        let jpeg = encoded(image::ImageFormat::Jpeg, 1, 1);
        assert_eq!(
            identify_image(&jpeg, Some("image/png"))
                .unwrap()
                .mime_type(),
            "image/jpeg"
        );
        assert!(identify_image(b"not an image", Some("image/png")).is_err());
    }

    #[test]
    fn sanitizes_default_and_corrects_file_names() {
        assert_eq!(
            build_file_name(Some("../bad:<name>.png"), ImageKind::Jpeg),
            "bad__name_.jpg"
        );
        assert_eq!(build_file_name(None, ImageKind::Png), "image.png");
        assert_eq!(
            build_file_name(Some("photo.gif?x=1"), ImageKind::WebP),
            "photo.webp"
        );
    }

    #[tokio::test]
    async fn data_urls_support_base64_and_percent_encoding() {
        let png = encoded(image::ImageFormat::Png, 2, 2);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
        let asset = get_preview_image_asset(format!("data:image/png;base64,{b64}"))
            .await
            .unwrap();
        assert_eq!(asset.bytes, png);
        let asset = get_preview_image_asset("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221%22%20height%3D%221%22%2F%3E".into()).await.unwrap();
        assert_eq!(asset.extension, ".svg");
    }

    #[tokio::test]
    async fn rejects_malformed_oversized_data_and_unsupported_protocols() {
        assert!(get_preview_image_asset("data:image/png;base64,%%%".into())
            .await
            .is_err());
        let oversized = "A".repeat(MAX_SOURCE_BYTES * 4 / 3 + 16);
        assert!(
            get_preview_image_asset(format!("data:image/png;base64,{oversized}"))
                .await
                .is_err()
        );
        for source in [
            "file:///tmp/a.png",
            "ftp://example/a.png",
            r"\\server\a.png",
            "data:text/plain,hi",
        ] {
            assert!(
                get_preview_image_asset(source.into()).await.is_err(),
                "{source}"
            );
        }
    }

    #[test]
    fn decodes_rgba_and_gif_first_frame_and_renders_svg() {
        for bytes in [
            encoded(image::ImageFormat::Png, 2, 3),
            encoded(image::ImageFormat::Jpeg, 2, 3),
            encoded(image::ImageFormat::WebP, 2, 3),
            animated_gif(),
            svg(2, 3),
        ] {
            let decoded = decode_for_clipboard(&bytes, None).unwrap();
            assert_eq!(
                (decoded.width, decoded.height, decoded.rgba.len()),
                (2, 3, 24)
            );
        }
        let gif = decode_for_clipboard(&animated_gif(), None).unwrap();
        assert_eq!(
            &gif.rgba[..4],
            &[255, 0, 0, 255],
            "GIF must use its first frame"
        );
    }

    #[test]
    fn enforces_dimension_and_pixel_limits_before_allocation() {
        assert!(validate_dimensions(16_385, 1).is_err());
        assert!(validate_dimensions(10_000, 4_001).is_err());
        assert!(decode_for_clipboard(&svg(16_385, 1), None).is_err());
    }

    #[tokio::test]
    async fn http_handles_status_non_images_redirects_timeout_and_overflow() {
        let not_found = serve(
            vec![response(
                "404 Not Found",
                "Content-Type: text/plain\r\n",
                b"no",
            )],
            Duration::ZERO,
        );
        assert!(fetch_http_with_timeouts(
            &not_found,
            Duration::from_secs(1),
            Duration::from_secs(1)
        )
        .await
        .is_err());

        let text = serve(
            vec![response("200 OK", "Content-Type: text/plain\r\n", b"hello")],
            Duration::ZERO,
        );
        assert!(
            fetch_http_with_timeouts(&text, Duration::from_secs(1), Duration::from_secs(1))
                .await
                .is_err()
        );

        let redirects = (0..7)
            .map(|_| response("302 Found", "Location: /again\r\n", b""))
            .collect();
        let redirect = serve(redirects, Duration::ZERO);
        assert!(fetch_http_with_timeouts(
            &format!("{redirect}/again"),
            Duration::from_secs(1),
            Duration::from_secs(1)
        )
        .await
        .is_err());

        let slow = serve(
            vec![response("200 OK", "Content-Type: image/png\r\n", b"")],
            Duration::from_millis(150),
        );
        assert!(fetch_http_with_timeouts(
            &slow,
            Duration::from_millis(50),
            Duration::from_millis(50)
        )
        .await
        .is_err());

        let streamed_body = "A".repeat(MAX_SOURCE_BYTES + 1);
        let streamed_response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nConnection: close\r\n\r\n{streamed_body}"
        );
        let streamed = serve(vec![streamed_response], Duration::ZERO);
        assert!(fetch_http_with_timeouts(
            &streamed,
            Duration::from_secs(2),
            Duration::from_secs(5)
        )
        .await
        .is_err());

        let huge_header = format!("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", MAX_SOURCE_BYTES + 1);
        let huge = serve(vec![huge_header], Duration::ZERO);
        assert!(
            fetch_http_with_timeouts(&huge, Duration::from_secs(1), Duration::from_secs(1))
                .await
                .is_err()
        );
    }

    #[test]
    fn wechat_hosts_are_upgraded_and_receive_exact_referer() {
        let request = prepare_http_request("http://mmbiz.qpic.cn/a.png").unwrap();
        assert_eq!(request.url().scheme(), "https");
        assert_eq!(
            request.headers().get(reqwest::header::REFERER).unwrap(),
            "https://mp.weixin.qq.com"
        );
        let request = prepare_http_request("https://mmbiz.qlogo.cn/a.png").unwrap();
        assert_eq!(
            request.headers().get(reqwest::header::REFERER).unwrap(),
            "https://mp.weixin.qq.com"
        );
    }
}
