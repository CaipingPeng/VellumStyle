use std::future::Future;
use std::io::Cursor;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use base64::Engine;
use image::GenericImageView;
use reqwest::header::{CONTENT_DISPOSITION, CONTENT_TYPE, LOCATION, REFERER};
use tauri_plugin_clipboard_manager::ClipboardExt;
use url::Url;

pub const MAX_SOURCE_BYTES: usize = 15 * 1024 * 1024;
const MAX_DIMENSION: u32 = 16_384;
const MAX_PIXELS: u64 = 40_000_000;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewImageAsset {
    pub bytes_base64: String,
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

fn validate_svg_url_tokens(value: &str) -> Result<(), String> {
    let lower = value.to_ascii_lowercase();
    if lower.contains("@import") {
        return Err("SVG external styles are not allowed".into());
    }

    let mut remainder = value;
    loop {
        let lower_remainder = remainder.to_ascii_lowercase();
        let Some(start) = lower_remainder.find("url(") else {
            return Ok(());
        };
        let after_open = &remainder[start + 4..];
        let Some(end) = after_open.find(')') else {
            return Err("invalid SVG URL reference".into());
        };
        let target = after_open[..end]
            .trim()
            .trim_matches(|character| matches!(character, '\'' | '"'))
            .trim();
        if !target.starts_with('#') || target.len() == 1 {
            return Err("SVG external URL references are not allowed".into());
        }
        remainder = &after_open[end + 1..];
    }
}

fn validate_svg_safety(bytes: &[u8]) -> Result<(), String> {
    let xml = std::str::from_utf8(bytes).map_err(|_| "invalid SVG XML encoding".to_string())?;
    let document =
        roxmltree::Document::parse(xml).map_err(|error| format!("invalid SVG XML: {error}"))?;
    if document.descendants().any(|node| node.is_pi()) {
        return Err("SVG processing instructions are not allowed".into());
    }

    for node in document.descendants().filter(roxmltree::Node::is_element) {
        let element_name = node.tag_name().name();
        if element_name.eq_ignore_ascii_case("script") {
            return Err("SVG scripts are not allowed".into());
        }
        if element_name.eq_ignore_ascii_case("image")
            || element_name.eq_ignore_ascii_case("feImage")
        {
            return Err("SVG raster images are not allowed".into());
        }

        for attribute in node.attributes() {
            let name = attribute.name();
            if name.len() > 2
                && name
                    .get(..2)
                    .is_some_and(|prefix| prefix.eq_ignore_ascii_case("on"))
            {
                return Err("SVG event handlers are not allowed".into());
            }
            if name.eq_ignore_ascii_case("href") {
                let target = attribute.value().trim();
                if !target.starts_with('#') || target.len() == 1 {
                    return Err("SVG external references are not allowed".into());
                }
            }
            validate_svg_url_tokens(attribute.value())?;
        }

        if element_name.eq_ignore_ascii_case("style") {
            for text in node
                .descendants()
                .filter_map(|descendant| descendant.text())
            {
                validate_svg_url_tokens(text)?;
            }
        }
    }
    Ok(())
}

fn parse_svg(bytes: &[u8]) -> Result<resvg::usvg::Tree, String> {
    if bytes.starts_with(&[0x1f, 0x8b]) {
        return Err("compressed SVG/SVGZ is not supported".into());
    }
    validate_svg_safety(bytes)?;
    let mut options = resvg::usvg::Options::default();
    options.resources_dir = None;
    options.image_href_resolver = resvg::usvg::ImageHrefResolver {
        resolve_data: Box::new(|_, _, _| None),
        resolve_string: Box::new(|_, _| None),
    };
    resvg::usvg::Tree::from_data(bytes, &options).map_err(|e| format!("invalid SVG: {e}"))
}

fn identify_image(bytes: &[u8], _declared_mime: Option<&str>) -> Result<ImageKind, String> {
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

fn decode_raster(bytes: &[u8], format: image::ImageFormat) -> Result<image::DynamicImage, String> {
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

fn straight_rgba(mut rgba: Vec<u8>) -> Vec<u8> {
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NetworkPolicy {
    Strict,
    #[cfg(test)]
    AllowLocalForTests,
}

fn ipv6_has_prefix(ip: std::net::Ipv6Addr, network: std::net::Ipv6Addr, prefix: u32) -> bool {
    let mask = u128::MAX.checked_shl(128 - prefix).unwrap_or(0);
    u128::from(ip) & mask == u128::from(network) & mask
}

fn is_globally_routable_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !matches!(
                (a, b, c),
                (0, _, _)
                    | (10, _, _)
                    | (100, 64..=127, _)
                    | (127, _, _)
                    | (169, 254, _)
                    | (172, 16..=31, _)
                    | (192, 0, 0)
                    | (192, 0, 2)
                    | (192, 88, 99)
                    | (192, 168, _)
                    | (198, 18..=19, _)
                    | (198, 51, 100)
                    | (203, 0, 113)
                    | (224..=255, _, _)
            )
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_globally_routable_ip(IpAddr::V4(mapped));
            }
            let blocked_prefixes = [
                (std::net::Ipv6Addr::UNSPECIFIED, 96),
                ("64:ff9b::".parse().unwrap(), 96),
                ("64:ff9b:1::".parse().unwrap(), 48),
                ("100::".parse().unwrap(), 64),
                ("2001::".parse().unwrap(), 32),
                ("2001:2::".parse().unwrap(), 48),
                ("2001:10::".parse().unwrap(), 28),
                ("2001:20::".parse().unwrap(), 28),
                ("2001:db8::".parse().unwrap(), 32),
                ("2002::".parse().unwrap(), 16),
                ("fc00::".parse().unwrap(), 7),
                ("fe80::".parse().unwrap(), 10),
                ("fec0::".parse().unwrap(), 10),
                ("ff00::".parse().unwrap(), 8),
            ];
            ip != std::net::Ipv6Addr::LOCALHOST
                && !blocked_prefixes
                    .iter()
                    .any(|&(network, prefix)| ipv6_has_prefix(ip, network, prefix))
        }
    }
}

fn validate_http_target(url: &Url, policy: NetworkPolicy) -> Result<(), String> {
    let _ = policy;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only HTTP(S) image URLs are allowed".into());
    }
    #[cfg(test)]
    if policy == NetworkPolicy::AllowLocalForTests {
        return Ok(());
    }
    let blocked = match url.host() {
        Some(url::Host::Domain(host)) => {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .to_ascii_lowercase()
                    .strip_suffix(".localhost")
                    .is_some()
        }
        Some(url::Host::Ipv4(ip)) => !is_globally_routable_ip(IpAddr::V4(ip)),
        Some(url::Host::Ipv6(ip)) => !is_globally_routable_ip(IpAddr::V6(ip)),
        None => true,
    };
    if blocked {
        Err("private or local image URLs are not allowed".into())
    } else {
        Ok(())
    }
}

#[derive(Debug)]
struct PreparedHttpHop {
    url: Url,
    client: reqwest::Client,
    #[cfg(test)]
    pinned_addrs: Vec<SocketAddr>,
}

fn normalize_http_url(mut url: Url) -> Result<Url, String> {
    let wechat = is_wechat_host(&url);
    if wechat && url.scheme() == "http" {
        url.set_scheme("https").map_err(|_| "invalid image URL")?;
    }
    Ok(url)
}

fn direct_http_client_builder(
    connect_timeout: Duration,
    total_timeout: Duration,
) -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(connect_timeout)
        .timeout(total_timeout)
        .redirect(reqwest::redirect::Policy::none())
}

async fn prepare_http_hop_with_resolver<R, F>(
    url: Url,
    connect_timeout: Duration,
    total_timeout: Duration,
    policy: NetworkPolicy,
    resolver: R,
) -> Result<PreparedHttpHop, String>
where
    R: FnOnce(String, u16) -> F,
    F: Future<Output = Result<Vec<SocketAddr>, String>>,
{
    let url = normalize_http_url(url)?;
    validate_http_target(&url, policy)?;
    #[cfg(test)]
    let mut pinned_addrs = None;
    let mut builder = direct_http_client_builder(connect_timeout, total_timeout);
    if let Some(url::Host::Domain(host)) = url.host() {
        let port = url
            .port_or_known_default()
            .ok_or("image URL has no usable port")?;
        let addresses = resolver(host.to_owned(), port)
            .await
            .map_err(|error| format!("unable to resolve image hostname: {error}"))?;
        if addresses.is_empty() {
            return Err("image hostname resolved to no addresses".into());
        }
        #[cfg(test)]
        let allow_local = policy == NetworkPolicy::AllowLocalForTests;
        #[cfg(not(test))]
        let allow_local = false;
        if !allow_local
            && addresses
                .iter()
                .any(|address| !is_globally_routable_ip(address.ip()))
        {
            return Err("image hostname resolves to a private or local address".into());
        }
        builder = builder.resolve_to_addrs(host, &addresses);
        #[cfg(test)]
        {
            pinned_addrs = Some(addresses);
        }
    }
    let client = builder
        .build()
        .map_err(|e| format!("unable to create HTTP client: {e}"))?;
    Ok(PreparedHttpHop {
        url,
        client,
        #[cfg(test)]
        pinned_addrs: pinned_addrs.unwrap_or_default(),
    })
}

fn is_wechat_host(url: &Url) -> bool {
    matches!(url.host_str(), Some("mmbiz.qpic.cn" | "mmbiz.qlogo.cn"))
}

fn build_request_for_url(
    client: &reqwest::Client,
    mut url: Url,
    policy: NetworkPolicy,
) -> Result<reqwest::Request, String> {
    url = normalize_http_url(url)?;
    validate_http_target(&url, policy)?;
    let wechat = is_wechat_host(&url);
    let mut request = client.get(url);
    if wechat {
        request = request.header(REFERER, "https://mp.weixin.qq.com");
    }
    request
        .build()
        .map_err(|e| format!("unable to build image request: {e}"))
}

#[cfg(test)]
fn http_client(
    connect_timeout: Duration,
    total_timeout: Duration,
) -> Result<reqwest::Client, String> {
    direct_http_client_builder(connect_timeout, total_timeout)
        .build()
        .map_err(|e| format!("unable to create HTTP client: {e}"))
}

fn is_followable_redirect(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308)
}

fn resolve_redirect_target(
    current: &Url,
    location: &str,
    policy: NetworkPolicy,
) -> Result<Url, String> {
    let target = current
        .join(location)
        .map_err(|_| "invalid image redirect URL")?;
    validate_http_target(&target, policy)?;
    Ok(target)
}

async fn fetch_http_with_policy(
    source: &str,
    connect_timeout: Duration,
    total_timeout: Duration,
    policy: NetworkPolicy,
) -> Result<Download, String> {
    let initial = Url::parse(source).map_err(|_| "invalid image URL")?;
    let operation = async {
        let mut url = initial;
        let mut redirects = 0usize;
        loop {
            let prepared = prepare_http_hop_with_resolver(
                url,
                connect_timeout,
                total_timeout,
                policy,
                |host, port| async move {
                    tokio::net::lookup_host((host.as_str(), port))
                        .await
                        .map(|addresses| addresses.collect())
                        .map_err(|e| e.to_string())
                },
            )
            .await?;
            let request = build_request_for_url(&prepared.client, prepared.url, policy)?;
            let mut response = prepared
                .client
                .execute(request)
                .await
                .map_err(|e| format!("image download failed: {e}"))?;
            if is_followable_redirect(response.status()) {
                if redirects >= 5 {
                    return Err("image redirect limit exceeded".into());
                }
                let location = response
                    .headers()
                    .get(LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .ok_or("image redirect missing Location")?;
                url = resolve_redirect_target(response.url(), location, policy)?;
                redirects += 1;
                continue;
            }
            if !response.status().is_success() {
                return Err(format!("image server returned HTTP {}", response.status()));
            }
            if response
                .content_length()
                .is_some_and(|n| n > MAX_SOURCE_BYTES as u64)
            {
                return Err("image exceeds 15 MiB limit".into());
            }
            let final_url = response.url().clone();
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
                    final_url
                        .path_segments()
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
            return Ok(Download {
                bytes,
                content_type,
                file_name,
            });
        }
    };
    tokio::time::timeout(total_timeout, operation)
        .await
        .map_err(|_| "image download timed out".to_string())?
}

#[cfg(test)]
async fn fetch_http_with_timeouts(
    source: &str,
    connect_timeout: Duration,
    total_timeout: Duration,
) -> Result<Download, String> {
    fetch_http_with_policy(
        source,
        connect_timeout,
        total_timeout,
        NetworkPolicy::AllowLocalForTests,
    )
    .await
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

fn strict_percent_decode(input: &str, max_output: usize) -> Result<Vec<u8>, String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len().min(max_output));
    let mut index = 0;
    while index < bytes.len() {
        if output.len() >= max_output {
            return Err("image exceeds 15 MiB limit".into());
        }
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("malformed percent escape in data URL".into());
            }
            let hex = |byte: u8| match byte {
                b'0'..=b'9' => Some(byte - b'0'),
                b'a'..=b'f' => Some(byte - b'a' + 10),
                b'A'..=b'F' => Some(byte - b'A' + 10),
                _ => None,
            };
            let high = hex(bytes[index + 1]).ok_or("malformed percent escape in data URL")?;
            let low = hex(bytes[index + 2]).ok_or("malformed percent escape in data URL")?;
            output.push(high * 16 + low);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    Ok(output)
}

fn encoded_payload_limit(is_base64: bool) -> usize {
    let decoded_limit = if is_base64 {
        MAX_SOURCE_BYTES.div_ceil(3) * 4
    } else {
        MAX_SOURCE_BYTES
    };
    decoded_limit.saturating_mul(3)
}

fn validate_encoded_payload_len(length: usize, is_base64: bool) -> Result<(), String> {
    if length > encoded_payload_limit(is_base64) {
        Err("image exceeds 15 MiB limit".into())
    } else {
        Ok(())
    }
}

fn parse_data_url(source: &str) -> Result<Download, String> {
    let (scheme, rest) = source.split_once(':').ok_or("malformed data URL")?;
    if !scheme.eq_ignore_ascii_case("data") {
        return Err("malformed data URL".into());
    }
    let (metadata, payload) = rest.split_once(',').ok_or("malformed data URL")?;
    if metadata.len() > 4 * 1024 {
        return Err("data URL metadata exceeds 4 KiB limit".into());
    }
    let mut parts = metadata.split(';');
    let mime = parts.next().unwrap_or_default().to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return Err("data URL must contain an image".into());
    }
    let is_base64 = parts.any(|p| p.eq_ignore_ascii_case("base64"));
    validate_encoded_payload_len(payload.len(), is_base64)?;
    let decoded_payload_limit = if is_base64 {
        MAX_SOURCE_BYTES.div_ceil(3) * 4
    } else {
        MAX_SOURCE_BYTES
    };
    let decoded_payload = strict_percent_decode(payload, decoded_payload_limit)?;
    let bytes = if is_base64 {
        base64::engine::general_purpose::STANDARD
            .decode(decoded_payload)
            .map_err(|_| "malformed base64 data URL")?
    } else {
        decoded_payload
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
#[cfg(test)]
mod tests {
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
    fn enforces_dimension_and_pixel_limits_before_allocation() {
        assert!(validate_dimensions(16_385, 1).is_err());
        assert!(validate_dimensions(10_000, 4_001).is_err());
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

        let safe_svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient><path id="p" d="M0 0h1v1z"/></defs><use href="#p"/><rect width="2" height="2" fill="url(#g)"/></svg>"##;
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
        let too_many_pixels = base64::engine::general_purpose::STANDARD.encode(svg(10_000, 4_001));
        assert!(
            get_preview_image_asset(format!("data:image/svg+xml;base64,{too_many_pixels}"))
                .await
                .is_err()
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

        for ip in ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"] {
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
        let source = include_str!("preview_image.rs");
        let production = source.split("#[cfg(test)]\nmod tests").next().unwrap();
        let helper_start = production
            .find("\nfn direct_http_client_builder(")
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
}
