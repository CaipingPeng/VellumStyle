// 单元测试（原样搬运，仅去掉外层 `mod tests { ... }` 包裹并统一去掉 4 空格缩进）。
// 由原 preview_image.rs 按域拆分而来，纯搬运，未改行为。

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use base64::Engine;

use super::*;

static HTTP_TEST_LOCK: Mutex<()> = Mutex::new(());

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
            stream.flush().unwrap();
            stream.shutdown(std::net::Shutdown::Write).unwrap();
        }
    });
    format!("http://{address}")
}

fn serve_streaming_overflow() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 4096];
        stream.read(&mut request).unwrap();
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n")
            .unwrap();
        write!(stream, "{:X}\r\n", MAX_SOURCE_BYTES).unwrap();
        stream.write_all(&vec![b'A'; MAX_SOURCE_BYTES]).unwrap();
        stream.write_all(b"\r\n1\r\nB\r\n0\r\n\r\n").unwrap();
        stream.flush().unwrap();
        stream.shutdown(std::net::Shutdown::Write).unwrap();
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
fn optimizes_large_pdf_raster_to_target_width() {
    let download = Download {
        bytes: encoded(image::ImageFormat::Png, 2400, 1200),
        content_type: Some("image/png".into()),
        file_name: Some("large.png".into()),
    };
    let data_url = optimize_pdf_image_download(&download, 1600)
        .unwrap()
        .expect("large raster should be optimized");
    let payload = data_url
        .strip_prefix("data:image/png;base64,")
        .expect("alpha image should remain PNG");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .unwrap();
    let image = image::load_from_memory(&bytes).unwrap();
    assert_eq!(image.dimensions(), (1600, 800));
}

#[test]
fn leaves_small_rasters_and_svg_untouched_for_pdf() {
    let small = Download {
        bytes: encoded(image::ImageFormat::Jpeg, 1200, 800),
        content_type: Some("image/jpeg".into()),
        file_name: Some("small.jpg".into()),
    };
    assert!(optimize_pdf_image_download(&small, 1600).unwrap().is_none());

    let vector = Download {
        bytes: svg(2400, 1200),
        content_type: Some("image/svg+xml".into()),
        file_name: Some("vector.svg".into()),
    };
    assert!(optimize_pdf_image_download(&vector, 1600)
        .unwrap()
        .is_none());
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
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(asset.bytes_base64)
            .unwrap(),
        png
    );
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
fn enforces_single_dimension_limit_before_allocation() {
    assert!(validate_dimensions(16_385, 1).is_err());
    assert!(validate_dimensions(10_000, 4_001).is_ok());
    assert!(decode_for_clipboard(&svg(16_385, 1), None).is_err());
}

#[tokio::test]
async fn http_handles_status_non_images_redirects_timeout_and_overflow() {
    let _guard = HTTP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
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

    let mut five_redirects: Vec<_> = (0..5)
        .map(|_| response("302 Found", "Location: /again\r\n", b""))
        .collect();
    five_redirects.push(response(
        "200 OK",
        "Content-Type: image/svg+xml\r\n",
        &svg(1, 1),
    ));
    let redirect = serve(five_redirects, Duration::ZERO);
    let five_result = fetch_http_with_timeouts(
        &format!("{redirect}/again"),
        Duration::from_secs(1),
        Duration::from_secs(1),
    )
    .await;
    assert!(
        five_result.is_ok(),
        "exactly five redirects must be allowed: {:?}",
        five_result.err()
    );

    let six_redirects = (0..6)
        .map(|_| response("302 Found", "Location: /again\r\n", b""))
        .collect();
    let redirect = serve(six_redirects, Duration::ZERO);
    assert_eq!(
        fetch_http_with_timeouts(
            &format!("{redirect}/again"),
            Duration::from_secs(1),
            Duration::from_secs(1)
        )
        .await
        .err()
        .unwrap(),
        "image redirect limit exceeded"
    );

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

    let huge_header = format!("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", MAX_SOURCE_BYTES + 1);
    let huge = serve(vec![huge_header], Duration::ZERO);
    assert_eq!(
        fetch_http_with_timeouts(&huge, Duration::from_secs(1), Duration::from_secs(1))
            .await
            .err()
            .unwrap(),
        "image exceeds 15 MiB limit"
    );
}

#[tokio::test]
async fn streaming_overflow_is_rejected_before_image_identification() {
    let _guard = HTTP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let streamed = serve_streaming_overflow();
    assert_eq!(
        fetch_http_with_timeouts(&streamed, Duration::from_secs(2), Duration::from_secs(10))
            .await
            .err()
            .unwrap(),
        "image exceeds 15 MiB limit"
    );
}

#[test]
fn wechat_hosts_are_upgraded_and_receive_exact_referer() {
    let client = http_client(Duration::from_secs(1), Duration::from_secs(1)).unwrap();
    let request = build_request_for_url(
        &client,
        Url::parse("http://mmbiz.qpic.cn/a.png").unwrap(),
        NetworkPolicy::Strict,
    )
    .unwrap();
    assert_eq!(request.url().scheme(), "https");
    assert_eq!(
        request.headers().get(reqwest::header::REFERER).unwrap(),
        "https://mp.weixin.qq.com"
    );
    let request = build_request_for_url(
        &client,
        Url::parse("https://mmbiz.qlogo.cn/a.png").unwrap(),
        NetworkPolicy::Strict,
    )
    .unwrap();
    assert_eq!(
        request.headers().get(reqwest::header::REFERER).unwrap(),
        "https://mp.weixin.qq.com"
    );
}

#[test]
fn identify_rejects_active_or_external_svg_content() {
    let unsafe_svgs: &[&[u8]] = &[
        br#"<?xml-stylesheet href="https://example.com/a.css"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">active</div></foreignObject></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml" width="1" height="1"><h:img src="https://example.com/a.png"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml" width="1" height="1"><h:iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="\75rl(https://example.com/a.svg#x)"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="u/**/rl(https://example.com/a.svg#x)"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><style>\40 import 'https://example.com/a.css';</style></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><style>@im/**/port 'https://example.com/a.css';</style></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:evil="urn:evil" width="1" height="1"><evil:ScRiPt>alert(1)</evil:ScRiPt></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" onClick="alert(1)"/>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><image href="https://example.com/a.png"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><IMAGE href="file:///tmp/a.png"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><feImage href="data:image/png;base64,AA=="/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1" height="1"><use xlink:href="http://example.com/a.svg#x"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><use href="other.svg#x"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect style="fill:url(https://example.com/a.svg#x)"/></svg>"#,
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><style>@import url('https://example.com/a.css');</style></svg>"#,
    ];

    for bytes in unsafe_svgs {
        assert!(
            identify_image(bytes, Some("image/svg+xml")).is_err(),
            "unsafe SVG was accepted: {}",
            String::from_utf8_lossy(bytes)
        );
    }
    assert!(identify_image(
        br#"<svg xmlns="http://www.w3.org/2000/svg"><path></svg>"#,
        Some("image/svg+xml")
    )
    .is_err());
}

#[test]
fn svg_safety_validation_handles_unicode_attribute_names() {
    let safe_svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" 属性="值"><rect width="1" height="1"/></svg>"#;
    assert_eq!(
        identify_image(safe_svg.as_bytes(), Some("image/svg+xml")).unwrap(),
        ImageKind::Svg
    );
}

#[tokio::test]
async fn asset_rejects_unsafe_svg_and_preserves_safe_original_bytes() {
    let unsafe_svg =
        br#"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" onload="alert(1)"/>"#;
    let unsafe_source = format!(
        "data:image/svg+xml;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(unsafe_svg)
    );
    assert!(get_preview_image_asset(unsafe_source).await.is_err());

    let safe_svg = br##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2" height="2"><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient><path id="p" d="M0 0h1v1z"/></defs><use href="#p"/><use xlink:href="#p"/><rect width="2" height="2" fill="url(#g)"/></svg>"##;
    assert_eq!(
        identify_image(safe_svg, Some("image/svg+xml")).unwrap(),
        ImageKind::Svg
    );
    let source = format!(
        "data:image/svg+xml;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(safe_svg)
    );
    let asset = get_preview_image_asset(source).await.unwrap();
    assert_eq!(asset.mime_type, "image/svg+xml");
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(asset.bytes_base64)
            .unwrap(),
        safe_svg
    );
}

#[test]
fn svg_pixels_are_straight_not_premultiplied_rgba() {
    let bytes = br##"<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#ff0000" fill-opacity="0.5"/></svg>"##;
    assert_eq!(
        &decode_for_clipboard(bytes, None).unwrap().rgba[..4],
        &[255, 0, 0, 128]
    );
}

#[tokio::test]
async fn public_asset_rejects_oversized_svg_dimensions() {
    let oversized = base64::engine::general_purpose::STANDARD.encode(svg(16_385, 1));
    assert!(
        get_preview_image_asset(format!("data:image/svg+xml;base64,{oversized}"))
            .await
            .is_err()
    );
    let high_resolution = base64::engine::general_purpose::STANDARD.encode(svg(10_000, 4_001));
    assert!(
        get_preview_image_asset(format!("data:image/svg+xml;base64,{high_resolution}"))
            .await
            .is_ok()
    );
}

#[test]
fn rejects_truncated_raster_payloads_after_full_decode_validation() {
    for format in [
        image::ImageFormat::Png,
        image::ImageFormat::Jpeg,
        image::ImageFormat::Gif,
        image::ImageFormat::WebP,
    ] {
        let mut bytes = encoded(format, 16, 16);
        bytes.truncate(bytes.len() / 2);
        assert!(
            identify_image(&bytes, None).is_err(),
            "truncated {format:?} was accepted"
        );
    }
}

#[test]
fn rejects_svgz_gzip_magic() {
    let svgz = base64::engine::general_purpose::STANDARD.decode("H4sIAAAAAAAC/7MpLkksS1UoLcpPzSvJzE21VTLUM9QzMNIzMjJVKEstKs7Mz7NSyM3JK7ZSKsovAgDQhNEZOgAAAA==").unwrap();
    assert_eq!(&svgz[..2], &[0x1f, 0x8b]);
    assert!(identify_image(&svgz, Some("image/svg+xml")).is_err());
}

#[tokio::test]
async fn data_url_parsing_is_strict_case_insensitive_and_decodes_base64_percent_escapes() {
    assert!(get_preview_image_asset("data:image/svg+xml,%ZZ".into())
        .await
        .is_err());
    let png = encoded(image::ImageFormat::Png, 1, 1);
    let escaped = base64::engine::general_purpose::STANDARD
        .encode(&png)
        .replace('+', "%2B")
        .replace('/', "%2F")
        .replace('=', "%3D");
    let asset = get_preview_image_asset(format!("DATA:IMAGE/PNG;BASE64,{escaped}"))
        .await
        .unwrap();
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(asset.bytes_base64)
            .unwrap(),
        png
    );
}

#[test]
fn production_request_policy_is_applied_per_target_without_referer_leaks() {
    let client = http_client(Duration::from_secs(1), Duration::from_secs(1)).unwrap();
    let wx = build_request_for_url(
        &client,
        Url::parse("http://mmbiz.qpic.cn/a").unwrap(),
        NetworkPolicy::Strict,
    )
    .unwrap();
    assert_eq!(wx.url().scheme(), "https");
    assert_eq!(
        wx.headers().get(REFERER).unwrap(),
        "https://mp.weixin.qq.com"
    );
    let ordinary = build_request_for_url(
        &client,
        Url::parse("https://example.com/a").unwrap(),
        NetworkPolicy::Strict,
    )
    .unwrap();
    assert!(ordinary.headers().get(REFERER).is_none());
}

#[tokio::test]
async fn redirected_final_url_supplies_fallback_filename() {
    let _guard = HTTP_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let body = svg(1, 1);
    let server = serve(
        vec![
            response("302 Found", "Location: /final-name.bin\r\n", b""),
            response("200 OK", "Content-Type: image/svg+xml\r\n", &body),
        ],
        Duration::ZERO,
    );
    let download = fetch_http_with_timeouts(
        &format!("{server}/initial-name.png"),
        Duration::from_secs(1),
        Duration::from_secs(1),
    )
    .await
    .unwrap();
    let kind = identify_image(&download.bytes, download.content_type.as_deref()).unwrap();
    assert_eq!(
        build_file_name(download.file_name.as_deref(), kind),
        "final-name.svg"
    );
}

#[test]
fn sanitizes_windows_device_names_and_long_unicode_safely() {
    for name in [
        "CON.png",
        "prn.jpg",
        "AUX",
        "nul.txt",
        "CLOCK$.gif",
        "com1.webp",
        "LPT9.svg",
        "CON.backup.jpg",
        "NuL.archive.tar",
        "com1.backup.webp",
        "lPt9.notes.svg",
    ] {
        let result = build_file_name(Some(name), ImageKind::Png);
        assert!(
            result.starts_with('_'),
            "reserved device name was not escaped: {name} -> {result}"
        );
    }
    let long = format!("{}😀.jpg", "a".repeat(179));
    let result =
        std::panic::catch_unwind(|| build_file_name(Some(&long), ImageKind::Jpeg)).unwrap();
    assert!(result.len() <= 180 + ".jpg".len());
    assert!(result.ends_with(".jpg"));
}

#[test]
fn encoded_data_payload_limits_allow_worst_case_percent_escaping() {
    let old_limit = MAX_SOURCE_BYTES * 4 / 3 + 16;
    let raw_percent_limit = encoded_payload_limit(false);
    let base64_len = MAX_SOURCE_BYTES.div_ceil(3) * 4;
    let escaped_base64_limit = encoded_payload_limit(true);

    assert_eq!(raw_percent_limit, MAX_SOURCE_BYTES * 3);
    assert_eq!(escaped_base64_limit, base64_len * 3);
    assert!(raw_percent_limit > old_limit);
    assert!(escaped_base64_limit > old_limit);
    assert!(validate_encoded_payload_len(raw_percent_limit, false).is_ok());
    assert!(validate_encoded_payload_len(escaped_base64_limit, true).is_ok());
    assert!(validate_encoded_payload_len(raw_percent_limit + 1, false).is_err());
    assert!(validate_encoded_payload_len(escaped_base64_limit + 1, true).is_err());
}

#[test]
fn strict_ssrf_policy_rejects_local_and_private_literal_addresses() {
    for source in [
        "http://localhost/a.png",
        "http://127.0.0.1/a.png",
        "http://10.0.0.1/a.png",
        "http://172.16.0.1/a.png",
        "http://192.168.1.1/a.png",
        "http://169.254.1.1/a.png",
        "http://0.0.0.0/a.png",
        "http://[::1]/a.png",
        "http://[::]/a.png",
        "http://[fc00::1]/a.png",
        "http://[fe80::1]/a.png",
        "http://[::ffff:127.0.0.1]/a.png",
        "http://[::ffff:192.168.1.1]/a.png",
        "http://100.64.0.1/a.png",
        "http://198.18.0.1/a.png",
        "http://192.0.2.1/a.png",
        "http://198.51.100.1/a.png",
        "http://203.0.113.1/a.png",
        "http://224.0.0.1/a.png",
        "http://240.0.0.1/a.png",
        "http://255.255.255.255/a.png",
        "http://[ff02::1]/a.png",
        "http://[64:ff9b::808:808]/a.png",
        "http://[64:ff9b:1::808:808]/a.png",
        "http://[2001:db8::1]/a.png",
        "http://[2002:0808:0808::1]/a.png",
        "http://[::ffff:198.18.0.1]/a.png",
        "http://[100:0:0:1::1]/a.png",
        "http://[3fff::1]/a.png",
        "http://[5f00::1]/a.png",
        "http://[2001:2::1]/a.png",
        "http://[2001:10::1]/a.png",
        "http://[2001:40::1]/a.png",
        "http://[2001:100::1]/a.png",
    ] {
        let url = Url::parse(source).unwrap();
        assert!(
            validate_http_target(&url, NetworkPolicy::Strict).is_err(),
            "allowed {source}"
        );
        assert!(
            validate_http_target(&url, NetworkPolicy::AllowLocalForTests).is_ok(),
            "test policy rejected {source}"
        );
    }
    for source in [
        "https://8.8.8.8/a.png",
        "https://1.1.1.1/a.png",
        "https://[2606:4700:4700::1111]/a.png",
        "https://[2001:1::1]/a.png",
        "https://[2001:1::2]/a.png",
        "https://[2001:1::3]/a.png",
        "https://[2001:3::1]/a.png",
        "https://[2001:4:112::1]/a.png",
        "https://[2001:20::1]/a.png",
        "https://[2001:30::1]/a.png",
        "https://example.com/a.png",
    ] {
        assert!(
            validate_http_target(&Url::parse(source).unwrap(), NetworkPolicy::Strict).is_ok(),
            "rejected globally routable target {source}"
        );
    }
    let current = Url::parse("https://example.com/start").unwrap();
    assert!(resolve_redirect_target(
        &current,
        "http://127.0.0.1/secret",
        NetworkPolicy::Strict
    )
    .is_err());
    assert!(resolve_redirect_target(
        &current,
        "http://[::ffff:10.0.0.1]/secret",
        NetworkPolicy::Strict
    )
    .is_err());
    assert!(resolve_redirect_target(
        &current,
        "https://example.org/image",
        NetworkPolicy::Strict
    )
    .is_ok());
}

#[tokio::test]
async fn production_fetch_rejects_local_initial_target_before_connecting() {
    assert_eq!(
        fetch_http_with_policy(
            "http://127.0.0.1:9/image.png",
            Duration::from_secs(1),
            Duration::from_secs(1),
            NetworkPolicy::Strict,
        )
        .await
        .err()
        .unwrap(),
        "private or local image URLs are not allowed"
    );
}

#[tokio::test]
async fn strict_dns_validation_rejects_private_answers_and_localhost_domains() {
    let private = prepare_http_hop_with_resolver(
        Url::parse("https://attacker.example/image.png").unwrap(),
        Duration::from_secs(1),
        Duration::from_secs(1),
        NetworkPolicy::Strict,
        |_, port| async move { Ok(vec![SocketAddr::from(([192, 168, 1, 20], port))]) },
    )
    .await
    .err()
    .unwrap();
    assert_eq!(
        private,
        "image hostname resolves to a private or local address"
    );

    let mut called = false;
    let localhost = prepare_http_hop_with_resolver(
        Url::parse("https://foo.localhost/image.png").unwrap(),
        Duration::from_secs(1),
        Duration::from_secs(1),
        NetworkPolicy::Strict,
        |_, _| {
            called = true;
            async { Ok(vec![]) }
        },
    )
    .await
    .err()
    .unwrap();
    assert_eq!(localhost, "private or local image URLs are not allowed");
    assert!(!called, ".localhost must be rejected before DNS");

    let url = Url::parse("https://attacker.example/image.png").unwrap();
    let mixed = prepare_http_hop_with_resolver(
        url.clone(),
        Duration::from_secs(1),
        Duration::from_secs(1),
        NetworkPolicy::Strict,
        |_, port| async move {
            Ok(vec![
                SocketAddr::from(([8, 8, 8, 8], port)),
                SocketAddr::from(([127, 0, 0, 1], port)),
            ])
        },
    )
    .await
    .err()
    .unwrap();
    assert_eq!(
        mixed,
        "image hostname resolves to a private or local address"
    );

    let empty = prepare_http_hop_with_resolver(
        url.clone(),
        Duration::from_secs(1),
        Duration::from_secs(1),
        NetworkPolicy::Strict,
        |_, _| async { Ok(vec![]) },
    )
    .await
    .err()
    .unwrap();
    assert_eq!(empty, "image hostname resolved to no addresses");

    let failed = prepare_http_hop_with_resolver(
        url,
        Duration::from_secs(1),
        Duration::from_secs(1),
        NetworkPolicy::Strict,
        |_, _| async { Err("synthetic DNS failure".into()) },
    )
    .await
    .err()
    .unwrap();
    assert_eq!(
        failed,
        "unable to resolve image hostname: synthetic DNS failure"
    );
}

#[tokio::test]
async fn strict_dns_validation_rejects_every_non_global_answer() {
    let unsafe_addresses: &[IpAddr] = &[
        "100.64.0.1".parse().unwrap(),
        "198.18.0.1".parse().unwrap(),
        "192.0.2.1".parse().unwrap(),
        "198.51.100.1".parse().unwrap(),
        "203.0.113.1".parse().unwrap(),
        "224.0.0.1".parse().unwrap(),
        "240.0.0.1".parse().unwrap(),
        "255.255.255.255".parse().unwrap(),
        "ff02::1".parse().unwrap(),
        "64:ff9b::808:808".parse().unwrap(),
        "64:ff9b:1::808:808".parse().unwrap(),
        "2001:db8::1".parse().unwrap(),
        "2002:0808:0808::1".parse().unwrap(),
        "::ffff:198.18.0.1".parse().unwrap(),
        "100:0:0:1::1".parse().unwrap(),
        "3fff::1".parse().unwrap(),
        "5f00::1".parse().unwrap(),
        "2001:2::1".parse().unwrap(),
        "2001:10::1".parse().unwrap(),
        "2001:40::1".parse().unwrap(),
        "2001:100::1".parse().unwrap(),
    ];

    for &ip in unsafe_addresses {
        let result = prepare_http_hop_with_resolver(
            Url::parse("https://attacker.example/image.png").unwrap(),
            Duration::from_secs(1),
            Duration::from_secs(1),
            NetworkPolicy::Strict,
            |_, port| async move { Ok(vec![SocketAddr::new(ip, port)]) },
        )
        .await;
        assert!(result.is_err(), "DNS answer {ip} was accepted");
    }

    for ip in [
        "8.8.8.8",
        "1.1.1.1",
        "2606:4700:4700::1111",
        "2001:1::1",
        "2001:1::2",
        "2001:1::3",
        "2001:3::1",
        "2001:4:112::1",
        "2001:20::1",
        "2001:30::1",
    ] {
        let ip: IpAddr = ip.parse().unwrap();
        let prepared = prepare_http_hop_with_resolver(
            Url::parse("https://public.example/image.png").unwrap(),
            Duration::from_secs(1),
            Duration::from_secs(1),
            NetworkPolicy::Strict,
            |_, port| async move { Ok(vec![SocketAddr::new(ip, port)]) },
        )
        .await
        .unwrap();
        assert_eq!(prepared.pinned_addrs, vec![SocketAddr::new(ip, 443)]);
    }
}

#[tokio::test]
async fn validated_public_dns_answers_are_pinned_after_wechat_upgrade() {
    let prepared = prepare_http_hop_with_resolver(
        Url::parse("http://mmbiz.qpic.cn/image.png").unwrap(),
        Duration::from_secs(1),
        Duration::from_secs(1),
        NetworkPolicy::Strict,
        |host, port| async move {
            assert_eq!(host, "mmbiz.qpic.cn");
            assert_eq!(port, 443, "resolution must happen after HTTPS upgrade");
            Ok(vec![SocketAddr::from(([1, 1, 1, 1], port))])
        },
    )
    .await
    .unwrap();
    assert_eq!(prepared.url.scheme(), "https");
    assert_eq!(
        prepared.pinned_addrs,
        vec![SocketAddr::from(([1, 1, 1, 1], 443))]
    );
}

#[test]
fn preview_http_clients_explicitly_bypass_system_proxies() {
    // 拆分后 direct_http_client_builder 与所有建 client 的地方都在同目录的 http.rs。
    // 原来读的是 preview_image.rs（已不存在）；全 preview_image 域里确实只有 http.rs 会
    // 构造 reqwest 客户端（见下面的计数断言）。
    let production = include_str!("http.rs");
    let helper_start = production
        .find("fn direct_http_client_builder(")
        .expect("preview HTTP clients must share a direct builder");
    let helper = &production[helper_start
        ..production[helper_start..]
            .find("\n}")
            .map(|offset| helper_start + offset + 2)
            .unwrap()];
    assert!(
        helper.contains(".no_proxy()"),
        "the shared preview HTTP builder must explicitly bypass system proxies"
    );
    assert_eq!(
        production.matches("reqwest::Client::builder()").count(),
        1,
        "all preview HTTP clients must be created by the no-proxy builder"
    );
    assert!(
        production.matches("direct_http_client_builder(").count() >= 3,
        "production and test clients must both use the shared builder"
    );
}

#[test]
fn redirect_statuses_are_explicitly_allowlisted() {
    for code in [301, 302, 303, 307, 308] {
        assert!(is_followable_redirect(
            reqwest::StatusCode::from_u16(code).unwrap()
        ));
    }
    for code in [300, 304, 305, 306] {
        assert!(!is_followable_redirect(
            reqwest::StatusCode::from_u16(code).unwrap()
        ));
    }
}

#[test]
fn percent_decoder_and_metadata_limits_fail_early() {
    let input = "A".repeat(1025);
    assert_eq!(
        strict_percent_decode(&input, 1024).unwrap_err(),
        "image exceeds 15 MiB limit"
    );
    let metadata = "x".repeat(4097);
    assert_eq!(
        parse_data_url(&format!("data:image/png;{metadata},x"))
            .err()
            .unwrap(),
        "data URL metadata exceeds 4 KiB limit"
    );
}

#[tokio::test]
async fn asset_serializes_base64_and_roundtrips_original_bytes() {
    let png = encoded(image::ImageFormat::Png, 2, 2);
    let source = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png)
    );
    let asset = get_preview_image_asset(source).await.unwrap();
    let json = serde_json::to_value(&asset).unwrap();
    assert!(json.get("bytes").is_none());
    assert_eq!(
        json.get("bytesBase64").and_then(|v| v.as_str()),
        Some(asset.bytes_base64.as_str())
    );
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(&asset.bytes_base64)
            .unwrap(),
        png
    );
}

#[tokio::test]
async fn write_asset_validates_base64_size_and_preserves_bytes() {
    let path = std::env::temp_dir().join(format!(
        "vellumstyle-preview-write-{}.png",
        std::process::id()
    ));
    let png = encoded(image::ImageFormat::Png, 2, 2);
    write_preview_image_asset(
        path.to_string_lossy().into_owned(),
        base64::engine::general_purpose::STANDARD.encode(&png),
    )
    .await
    .unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), png);
    std::fs::remove_file(&path).unwrap();
    assert_eq!(
        write_preview_image_asset(path.to_string_lossy().into_owned(), "%%%".into())
            .await
            .unwrap_err(),
        "malformed base64 image data"
    );
    let oversized = vec![0_u8; MAX_SOURCE_BYTES + 1];
    assert_eq!(
        write_preview_image_asset(
            path.to_string_lossy().into_owned(),
            base64::engine::general_purpose::STANDARD.encode(oversized)
        )
        .await
        .unwrap_err(),
        "image exceeds 15 MiB limit"
    );
    assert!(!path.exists());
}
