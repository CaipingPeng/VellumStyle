// wximg 自定义协议：防盗链白名单校验 + 带微信 Referer 代理拉图。
// 由原 wechat.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

// 防盗链图片域名白名单，防 SSRF。
pub const ALLOWED_IMG_HOSTS: [&str; 13] = [
    "mmbiz.qpic.cn",
    "mmbiz.qlogo.cn",
    "res.wx.qq.com",
    "emoji.sz.wx.qq.com",
    "wx.qlogo.cn",
    "search.c2c.weixin.qq.com",
    "wxapp.tc.qq.com",
    "vweixinf.tc.qq.com",
    "y.gtimg.cn",
    "wx.y.gtimg.cn",
    "findermp.video.qq.com",
    "dldir1v6.qq.com",
    "dldir1.qq.com",
];
pub(crate) fn ensure_public_remote_url(target: &url::Url) -> Result<(), String> {
    if !matches!(target.scheme(), "http" | "https") {
        return Err("仅支持 http/https 图片".into());
    }

    match target.host() {
        Some(url::Host::Domain(host)) => {
            let lower = host.to_ascii_lowercase();
            if lower == "localhost" || lower.ends_with(".localhost") {
                return Err("不支持下载本机地址图片".into());
            }
        }
        Some(url::Host::Ipv4(ip)) => {
            if !crate::preview_image::is_globally_routable_ip(IpAddr::V4(ip)) {
                return Err("不支持下载内网地址图片".into());
            }
        }
        Some(url::Host::Ipv6(ip)) => {
            if !crate::preview_image::is_globally_routable_ip(IpAddr::V6(ip)) {
                return Err("不支持下载内网地址图片".into());
            }
        }
        None => return Err("图片 URL 缺少主机名".into()),
    }

    Ok(())
}
#[cfg(test)]
pub(crate) fn is_allowed_redirect_target(target: &url::Url) -> bool {
    ensure_public_remote_url(target).is_ok()
}
/// wximg 预览图专用客户端：整个进程共用一条连接池。
/// 以前每张图都 `Client::builder()...build()` 一次，等于每张图重新握手
/// （一篇文章 40 张图就是 40 次 TLS 握手）；共用之后自动复用连接。
pub(crate) fn proxied_image_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(8))
                .timeout(Duration::from_secs(20))
                // 不自动跟随重定向：避免白名单域名被 302 到非白名单地址；
                // 微信 CDN 图片正常不重定向，若未来遇到再按 is_allowed_redirect_target 逐跳校验。
                .redirect(reqwest::redirect::Policy::none())
                // 必须显式绕开系统代理。reqwest 默认 `auto_sys_proxy = true`，
                // 会读 HTTPS_PROXY / HTTP_PROXY 等环境变量与系统代理设置：
                // 用户机器上代理常「配着但没启动」，那样预览里的图会整片加载失败。
                // get_outbound_ip 与 preview_image 的下载路径都写了 .no_proxy()，这里补齐。
                .no_proxy()
                .build()
                .map_err(|e| format!("创建 wximg 客户端失败：{e}"))
        })
        .as_ref()
        .map_err(|e| e.clone())
}
/// 带微信 Referer 拉取图片，返回 (content_type, bytes)。
/// 供 wximg 自定义协议处理器调用，绕过防盗链。
pub async fn fetch_proxied_image(raw_url: &str) -> Result<(String, Vec<u8>), String> {
    let mut target = url::Url::parse(raw_url).map_err(|_| "bad url".to_string())?;
    let host = target.host_str().unwrap_or("");
    if !ALLOWED_IMG_HOSTS.contains(&host) {
        eprintln!("[wximg] 拒绝代理非白名单域名: {host}");
        return Err(format!("forbidden host: {host}"));
    }
    // 微信返回 http 链接，统一升级 https；vweixinf.tc.qq.com（表情动图 CDN）
    // 不支持 https（TLS 握手失败），保持 http 拉取。
    let host = target.host_str().unwrap_or("");
    if target.scheme() == "http" && host != "vweixinf.tc.qq.com" {
        let _ = target.set_scheme("https");
    }
    let client = proxied_image_client()?;
    let resp = client
        .get(target.as_str())
        .header("Referer", "https://mp.weixin.qq.com")
        .send()
        .await
        .map_err(|e| format!("proxy error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("upstream error: {}", resp.status()));
    }
    // 预检 Content-Length，避免下载超大响应体到内存。
    if let Some(len) = resp.content_length() {
        if len > MAX_PROXY_BYTES as u64 {
            return Err("upstream image too large".into());
        }
    }
    let upstream_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read error: {e}"))?
        .to_vec();
    if bytes.len() > MAX_PROXY_BYTES {
        return Err("upstream image too large".into());
    }
    // 微信表情动图 CDN（vweixinf.tc.qq.com）返回的 Content-Type 是
    // application/octet-stream，浏览器不会按 GIF 播放动画；
    // 按内容魔数嗅探，把真正的 GIF 修正为 image/gif。
    let content_type = if bytes.starts_with(b"GIF8") {
        "image/gif".to_string()
    } else if bytes.starts_with(b"\x89PNG") {
        "image/png".to_string()
    } else if bytes.starts_with(b"\xFF\xD8") {
        "image/jpeg".to_string()
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp".to_string()
    } else {
        upstream_type.to_string()
    };
    if content_type != upstream_type {
        eprintln!(
            "[wximg] sniff {upstream_type} -> {content_type} bytes={}",
            bytes.len()
        );
    } else if upstream_type.contains("octet") {
        let head = bytes
            .iter()
            .take(16)
            .map(|b| format!("{b:02x}"))
            .collect::<Vec<_>>()
            .join(" ");
        eprintln!("[wximg] octet head: {head} bytes={}", bytes.len());
    }
    Ok((content_type, bytes))
}
