// 单元测试（原样搬运：去掉外层 `mod tests { ... }` 包裹、统一去掉 4 空格缩进，
// 并把唯一一处自读源文件的 include_str! 从 wechat.rs 改指 image_proxy.rs）。
// 由原 wechat.rs 按域拆分而来，纯搬运，未改行为。

use super::{
    build_add_draft_body, decode_for_reencoding, extract_video_mp4_url, fetch_proxied_image,
    format_wechat_error, is_allowed_redirect_target, parse_delete_material_response,
    parse_material_page_response, parse_outbound_ip_response,
    parse_video_material_page_response, parse_voice_material_page_response,
    prepare_upload_for_limit, validate_remote_addresses, OUTBOUND_IP_ENDPOINTS,
};
use image::{DynamicImage, ImageFormat, Rgb, RgbImage, Rgba, RgbaImage};
use std::io::Cursor;
use std::net::SocketAddr;

fn noisy_rgb(width: u32, height: u32) -> DynamicImage {
    DynamicImage::ImageRgb8(RgbImage::from_fn(width, height, |x, y| {
        let value = x.wrapping_mul(73_856_093) ^ y.wrapping_mul(19_349_663);
        Rgb([
            value as u8,
            value.rotate_left(9) as u8,
            value.rotate_left(17) as u8,
        ])
    }))
}

#[tokio::test]
async fn proxied_image_rejects_non_whitelisted_host() {
    let err = fetch_proxied_image("https://evil.example.com/x.png")
        .await
        .unwrap_err();
    assert!(
        err.contains("forbidden host") && err.contains("evil.example.com"),
        "报错应带被拒域名: {err}"
    );
}

fn noisy_rgba(width: u32, height: u32) -> DynamicImage {
    DynamicImage::ImageRgba8(RgbaImage::from_fn(width, height, |x, y| {
        let value = x.wrapping_mul(83_492_791) ^ y.wrapping_mul(2_654_435_761);
        Rgba([
            value as u8,
            value.rotate_left(7) as u8,
            value.rotate_left(15) as u8,
            64 + value.rotate_left(23) as u8 % 192,
        ])
    }))
}

fn encode(image: &DynamicImage, format: ImageFormat) -> Vec<u8> {
    let mut cursor = Cursor::new(Vec::new());
    image.write_to(&mut cursor, format).unwrap();
    cursor.into_inner()
}

fn with_exif_orientation(jpeg: &[u8], orientation: u8) -> Vec<u8> {
    let mut exif = vec![
        b'E',
        b'x',
        b'i',
        b'f',
        0,
        0,
        b'I',
        b'I',
        0x2a,
        0,
        8,
        0,
        0,
        0,
        1,
        0,
        0x12,
        1,
        3,
        0,
        1,
        0,
        0,
        0,
        orientation,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    ];
    let segment_len = (exif.len() + 2) as u16;
    let mut result = Vec::with_capacity(jpeg.len() + exif.len() + 4);
    result.extend_from_slice(&jpeg[..2]);
    result.extend_from_slice(&[0xff, 0xe1]);
    result.extend_from_slice(&segment_len.to_be_bytes());
    result.append(&mut exif);
    result.extend_from_slice(&jpeg[2..]);
    result
}

#[test]
fn jpeg_exif_orientation_is_applied_before_reencoding() {
    let jpeg = encode(&noisy_rgb(3, 2), ImageFormat::Jpeg);
    let oriented = with_exif_orientation(&jpeg, 6);
    let decoded = decode_for_reencoding(&oriented, ImageFormat::Jpeg).unwrap();

    assert_eq!((decoded.width(), decoded.height()), (2, 3));
}

#[test]
fn images_within_the_limit_pass_through_unchanged() {
    let bytes = vec![1, 2, 3];
    let prepared = prepare_upload_for_limit(
        bytes.clone(),
        "small.jpg".into(),
        "image/jpeg".into(),
        10,
        9,
    )
    .unwrap();

    assert_eq!(prepared.bytes, bytes);
    assert_eq!(prepared.filename, "small.jpg");
    assert_eq!(prepared.mime, "image/jpeg");
}

#[test]
fn oversized_jpeg_is_reencoded_below_the_target() {
    let original = encode(&noisy_rgb(512, 512), ImageFormat::Jpeg);
    assert!(original.len() > 80_000);

    let prepared = prepare_upload_for_limit(
        original,
        "photo.jpeg".into(),
        "image/jpeg".into(),
        80_000,
        70_000,
    )
    .unwrap();

    assert!(prepared.bytes.len() <= 70_000);
    assert_eq!(prepared.filename, "photo.jpg");
    assert_eq!(prepared.mime, "image/jpeg");
    let decoded =
        image::load_from_memory_with_format(&prepared.bytes, ImageFormat::Jpeg).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (512, 512));
}

#[test]
fn oversized_opaque_png_can_become_a_jpeg() {
    let original = encode(&noisy_rgb(256, 256), ImageFormat::Png);
    assert!(original.len() > 50_000);

    let prepared = prepare_upload_for_limit(
        original,
        "screenshot.png".into(),
        "image/png".into(),
        50_000,
        40_000,
    )
    .unwrap();

    assert!(prepared.bytes.len() <= 40_000);
    assert_eq!(prepared.filename, "screenshot.jpg");
    assert_eq!(prepared.mime, "image/jpeg");
    let decoded =
        image::load_from_memory_with_format(&prepared.bytes, ImageFormat::Jpeg).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (256, 256));
}

#[test]
fn oversized_transparent_png_is_flattened_without_changing_dimensions() {
    let original_image = noisy_rgba(256, 256);
    let original = encode(&original_image, ImageFormat::Png);
    assert!(original.len() > 50_000);

    let prepared = prepare_upload_for_limit(
        original,
        "overlay.png".into(),
        "image/png".into(),
        50_000,
        40_000,
    )
    .unwrap();
    let decoded =
        image::load_from_memory_with_format(&prepared.bytes, ImageFormat::Jpeg).unwrap();

    assert!(prepared.bytes.len() <= 40_000);
    assert_eq!(prepared.filename, "overlay.jpg");
    assert_eq!(prepared.mime, "image/jpeg");
    assert_eq!((decoded.width(), decoded.height()), (256, 256));
}

#[test]
fn oversized_gif_is_not_flattened() {
    let mut bytes = b"GIF89a".to_vec();
    bytes.resize(101, 0);
    let error =
        prepare_upload_for_limit(bytes, "animation.gif".into(), "image/gif".into(), 100, 90)
            .err()
            .unwrap();

    assert!(error.contains("保留动画"));
}

#[test]
fn jpeg_search_returns_the_highest_quality_that_fits() {
    let image = noisy_rgb(256, 256);
    let rgb = image.to_rgb8();
    let target = super::encode_jpeg(&rgb, 63).unwrap().len();
    let candidate = super::best_jpeg_under(&image, target).unwrap().unwrap();

    assert!(candidate.bytes.len() <= target);
    assert!(candidate.quality >= 63);
    if candidate.quality < 100 {
        let next = super::encode_jpeg(&rgb, candidate.quality + 1).unwrap();
        assert!(next.len() > target);
    }
}

#[test]
fn redirect_targets_must_remain_public_http_urls() {
    assert!(is_allowed_redirect_target(
        &url::Url::parse("https://example.com/image.png").unwrap()
    ));
    assert!(!is_allowed_redirect_target(
        &url::Url::parse("http://127.0.0.1/admin").unwrap()
    ));
    assert!(!is_allowed_redirect_target(
        &url::Url::parse("http://localhost/admin").unwrap()
    ));
    assert!(!is_allowed_redirect_target(
        &url::Url::parse("file:///etc/passwd").unwrap()
    ));
}

#[test]
fn remote_dns_validation_rejects_any_private_answer() {
    let public: SocketAddr = "8.8.8.8:443".parse().unwrap();
    let private: SocketAddr = "127.0.0.1:443".parse().unwrap();

    assert!(validate_remote_addresses(&[public]).is_ok());
    assert!(validate_remote_addresses(&[public, private]).is_err());
    assert!(validate_remote_addresses(&[]).is_err());
}

#[test]
fn whitelist_errors_get_a_specific_setup_hint() {
    let msg = format_wechat_error(
        Some(40164),
        "invalid ip 203.0.113.42, not in whitelist",
        "获取 access_token 失败",
    );

    assert!(msg.contains("40164"));
    assert!(msg.contains("invalid ip 203.0.113.42"));
    assert!(msg.contains("微信后台 IP 白名单"));
    assert!(msg.contains("设置与开发"));
    assert!(msg.contains("出口 IP"));
}

#[test]
fn non_whitelist_errors_keep_their_original_context() {
    let msg = format_wechat_error(Some(40013), "invalid appid", "获取 access_token 失败");

    assert_eq!(msg, "获取 access_token 失败：40013 invalid appid");
}

#[test]
fn outbound_ip_response_must_be_a_plain_ipv4_address() {
    assert_eq!(
        parse_outbound_ip_response(" 198.51.100.42\n").unwrap(),
        "198.51.100.42"
    );
    assert!(parse_outbound_ip_response(" 2001:db8::8\n").is_err());
    assert!(parse_outbound_ip_response("{\"ip\":\"198.51.100.42\"}").is_err());
}

#[test]
fn outbound_ip_endpoints_match_redundant_echo_services() {
    assert_eq!(
        OUTBOUND_IP_ENDPOINTS.as_slice(),
        &[
            "https://ifconfig.me/ip",
            "https://icanhazip.com",
            "http://ipinfo.io/ip",
            "https://checkip.amazonaws.com",
        ]
    );
}

#[test]
fn video_play_page_extracts_highest_quality_mp4() {
    let html = r#"<script>
      url: 'http://mpvideo.qpic.cn/abc.f10002.mp4?dis_k=1\x26amp;dis_t=2',
      url: 'http://mpvideo.qpic.cn/abc.f10004.mp4?dis_k=3\x26amp;dis_t=4',
      url: 'http://mpvideo.qpic.cn/abc.f10001.mp4?dis_k=5\x26amp;dis_t=6',
    </script>"#;
    let url = extract_video_mp4_url(html).expect("should extract");
    assert!(url.starts_with("http://mpvideo.qpic.cn/abc.f10004.mp4?dis_k=3&dis_t=4"));
}

#[test]
fn video_play_page_without_mp4_returns_none() {
    assert_eq!(extract_video_mp4_url("<p>没有视频</p>"), None);
}

#[test]
fn material_page_response_maps_wechat_items_for_frontend() {
    let body = r#"{
        "total_count": 8,
        "item_count": 2,
        "item": [
            {
                "media_id": "MEDIA_ID_1",
                "name": "series-cover.png",
                "update_time": 1780000000,
                "url": "http://mmbiz.qpic.cn/mmbiz_png/example/0"
            },
            {
                "media_id": "MEDIA_ID_2",
                "name": "",
                "update_time": 1780000060,
                "url": "https://mmbiz.qlogo.cn/mmbiz_jpg/example/1"
            }
        ]
    }"#;

    let page = parse_material_page_response(body).expect("material list should parse");
    assert_eq!(page.total_count, 8);
    assert_eq!(page.item_count, 2);
    assert_eq!(page.items[0].media_id, "MEDIA_ID_1");
    assert_eq!(page.items[0].name, "series-cover.png");
    assert_eq!(page.items[1].name, "未命名图片");

    let json = serde_json::to_value(&page).expect("page should serialize");
    assert_eq!(json["items"][0]["mediaId"], "MEDIA_ID_1");
    assert_eq!(json["items"][0]["updateTime"], 1780000000);
    assert!(json["items"][0]["media_id"].is_null());
}

#[test]
fn video_material_page_response_maps_vid_and_cover_for_frontend() {
    let body = r#"{
        "total_count": 1,
        "item_count": 1,
        "item": [
            {
                "media_id": "VIDEO_MEDIA_ID_1",
                "name": "和自己赛跑",
                "update_time": 1666258618,
                "cover_url": "http://mmbiz.qpic.cn/mmbiz_jpg/example/0?wx_fmt=jpeg",
                "description": "",
                "newcat": "教育",
                "vid": "wxv_2628424322221359104"
            }
        ]
    }"#;

    let page = parse_video_material_page_response(body).expect("video list should parse");
    assert_eq!(page.total_count, 1);
    assert_eq!(page.item_count, 1);
    assert_eq!(page.items[0].media_id, "VIDEO_MEDIA_ID_1");
    assert_eq!(page.items[0].name, "和自己赛跑");
    assert_eq!(page.items[0].vid, "wxv_2628424322221359104");
    assert_eq!(
        page.items[0].cover_url,
        "http://mmbiz.qpic.cn/mmbiz_jpg/example/0?wx_fmt=jpeg"
    );

    let json = serde_json::to_value(&page).expect("page should serialize");
    assert_eq!(json["items"][0]["vid"], "wxv_2628424322221359104");
    assert_eq!(json["items"][0]["coverUrl"], page.items[0].cover_url);
    assert!(json["items"][0]["cover_url"].is_null());
}

#[test]
fn voice_material_page_response_maps_name_and_time_for_frontend() {
    let body = r#"{
        "total_count": 1,
        "item_count": 1,
        "item": [
            {
                "media_id": "VOICE_MEDIA_ID_1",
                "name": "测试音频",
                "update_time": 1785982723,
                "tags": []
            }
        ]
    }"#;

    let page = parse_voice_material_page_response(body).expect("voice list should parse");
    assert_eq!(page.total_count, 1);
    assert_eq!(page.item_count, 1);
    assert_eq!(page.items[0].media_id, "VOICE_MEDIA_ID_1");
    assert_eq!(page.items[0].name, "测试音频");
    assert_eq!(page.items[0].update_time, 1785982723);

    let json = serde_json::to_value(&page).expect("page should serialize");
    assert_eq!(json["items"][0]["mediaId"], "VOICE_MEDIA_ID_1");
    assert_eq!(json["items"][0]["updateTime"], 1785982723);
}

#[test]
fn delete_material_response_accepts_success_and_preserves_wechat_error() {
    assert!(parse_delete_material_response(r#"{"errcode":0,"errmsg":"ok"}"#).is_ok());

    let (code, message) =
        parse_delete_material_response(r#"{"errcode":40007,"errmsg":"invalid media_id"}"#)
            .unwrap_err();
    assert_eq!(code, Some(40007));
    assert_eq!(message, "微信素材删除失败：40007 invalid media_id");
}

#[test]
fn delete_material_response_rejects_missing_result_code() {
    let (_, message) =
        parse_delete_material_response(r#"{"errmsg":"unexpected"}"#).unwrap_err();
    assert!(message.contains("微信素材删除失败"));
    assert!(message.contains("unexpected"));
}

#[test]
fn draft_body_includes_author_and_comment_settings() {
    let body = build_add_draft_body("标题", "<p>正文</p>", "THUMB_ID", "作者名", 1, 1);

    assert_eq!(
        body,
        serde_json::json!({
            "articles": [{
                "title": "标题",
                "content": "<p>正文</p>",
                "thumb_media_id": "THUMB_ID",
                "author": "作者名",
                "digest": "",
                "content_source_url": "",
                "need_open_comment": 1,
                "only_fans_can_comment": 1
            }]
        })
    );
}

#[cfg(windows)]
#[test]
#[ignore = "live network check for Windows proxy behavior"]
fn live_outbound_ip_matches_direct_curl() {
    let curl = std::process::Command::new("curl.exe")
        .args(["-s", "https://ifconfig.me/ip"])
        .output()
        .expect("curl.exe should run");
    assert!(curl.status.success(), "curl.exe failed: {curl:?}");

    let expected = String::from_utf8(curl.stdout)
        .expect("curl output should be utf-8")
        .trim()
        .to_string();
    let actual = tauri::async_runtime::block_on(super::get_outbound_ip()).unwrap();

    assert_eq!(actual, expected);
}

#[test]
fn proxied_image_client_is_shared_and_bypasses_system_proxies() {
    // 拆分后 proxied_image_client / fetch_proxied_image 落在同目录的 image_proxy.rs，
    // 原来读的是 wechat.rs，拆完就找不到这个文件了。
    let production = include_str!("image_proxy.rs");

    let helper_start = production
        // 不加前导 \n：顶层项统一加宽成了 `pub(crate) fn`，前面不再是行首。
        .find("fn proxied_image_client(")
        .expect("wximg 必须走共用的客户端构造函数");
    let helper = &production[helper_start
        ..production[helper_start..]
            .find("\n}")
            .map(|offset| helper_start + offset + 2)
            .unwrap()];
    assert!(
        helper.contains(".no_proxy()"),
        "wximg 预览图客户端必须显式绕开系统代理：reqwest 默认 auto_sys_proxy = true，\
         会读 HTTPS_PROXY；用户配了代理但没启动时，预览里的图会整片加载失败"
    );
    assert!(
        helper.contains("OnceLock"),
        "wximg 客户端必须进程内共用一条连接池，不能每张图新建（每张图一次 TLS 握手）"
    );

    let fetch_start = production
        .find("\npub async fn fetch_proxied_image(")
        .expect("fetch_proxied_image 必须存在");
    let fetch_end = production[fetch_start + 1..]
        .find("\n}\n")
        .map(|offset| fetch_start + 1 + offset)
        .unwrap_or(production.len());
    let fetch = &production[fetch_start..fetch_end];
    assert!(
        fetch.contains("proxied_image_client()?"),
        "fetch_proxied_image 必须复用共用客户端"
    );
    assert!(
        !fetch.contains("Client::builder()"),
        "fetch_proxied_image 不应再自己构造 Client"
    );
}
