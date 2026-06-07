// 微信官方图床上传 + 图片代理拉取。
// secret 不出前端：前端只调 upload_image command，凭证仅 Rust 读 config。

use crate::config::load_wechat_config;
use reqwest::redirect::Policy;
use serde::Deserialize;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::AppHandle;

const MAX_SIZE: usize = 10 * 1024 * 1024; // add_material 图片限制 10MB
const ALLOWED_TYPES: [&str; 3] = ["image/jpeg", "image/png", "image/gif"];

// 防盗链图片域名白名单，防 SSRF。
pub const ALLOWED_IMG_HOSTS: [&str; 2] = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];

// access_token 缓存：微信限频，必须复用（有效期 7200s）。
struct TokenCache {
    token: String,
    expire_at: Instant,
}

static TOKEN_CACHE: Mutex<Option<TokenCache>> = Mutex::new(None);

#[derive(Deserialize)]
struct TokenResp {
    access_token: Option<String>,
    expires_in: Option<u64>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Deserialize)]
struct UploadResp {
    url: Option<String>,
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

async fn fetch_access_token(app_id: &str, app_secret: &str) -> Result<String, String> {
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={}&secret={}",
        urlencoding::encode(app_id),
        urlencoding::encode(app_secret),
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("请求 access_token 失败：{e}"))?;
    let data: TokenResp = resp
        .json()
        .await
        .map_err(|e| format!("解析 access_token 响应失败：{e}"))?;
    match data.access_token {
        Some(token) => {
            // 提前 5 分钟过期，避免边界上用到已失效的 token。
            let ttl = data.expires_in.unwrap_or(7200).saturating_sub(300);
            let mut cache = TOKEN_CACHE.lock().unwrap();
            *cache = Some(TokenCache {
                token: token.clone(),
                expire_at: Instant::now() + Duration::from_secs(ttl),
            });
            Ok(token)
        }
        None => Err(format!(
            "获取 access_token 失败：{} {}",
            data.errcode.unwrap_or(0),
            data.errmsg.unwrap_or_default()
        )
        .trim()
        .to_string()),
    }
}

async fn get_access_token(app_id: &str, app_secret: &str) -> Result<String, String> {
    {
        let cache = TOKEN_CACHE.lock().unwrap();
        if let Some(c) = cache.as_ref() {
            if Instant::now() < c.expire_at {
                return Ok(c.token.clone());
            }
        }
    }
    fetch_access_token(app_id, app_secret).await
}

/// 清 token 缓存（凭证变更或 token 失效时调用）。同步，供 save_config 调用。
pub fn clear_token_blocking() {
    let mut cache = TOKEN_CACHE.lock().unwrap();
    *cache = None;
}

// 调微信 add_material（type=image）；返回永久 mmbiz 链接，errcode 时返回 (errcode, msg)。
async fn upload_to_wechat(
    token: &str,
    bytes: Vec<u8>,
    filename: &str,
    mime: &str,
) -> Result<String, (Option<i64>, String)> {
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str(mime)
        .map_err(|e| (None, format!("构造表单失败：{e}")))?;
    let form = reqwest::multipart::Form::new().part("media", part);

    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    );
    let resp = reqwest::Client::new()
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| (None, format!("上传请求失败：{e}")))?;
    let data: UploadResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析上传响应失败：{e}")))?;
    match data.url {
        Some(u) => Ok(u),
        None => Err((data.errcode, data.errmsg.unwrap_or_else(|| "微信上传失败".into()))),
    }
}

/// 上传图片到微信图床。bytes+filename+mime 由前端从 File/Blob 传入
/// （上传按钮与粘贴共用一条路径）。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn upload_image(
    app: AppHandle,
    bytes: Vec<u8>,
    filename: String,
    mime: String,
) -> Result<String, String> {
    upload_image_bytes(app, bytes, filename, mime).await
}

#[tauri::command]
pub async fn upload_local_image(app: AppHandle, path: String) -> Result<String, String> {
    let path = fs::canonicalize(path).map_err(|e| format!("读取本地图片路径失败：{e}"))?;
    if !path.is_file() {
        return Err("本地图片不存在".into());
    }

    let meta = fs::metadata(&path).map_err(|e| format!("读取本地图片信息失败：{e}"))?;
    if meta.len() as usize > MAX_SIZE {
        return Err("图片不能超过 10MB".into());
    }

    let mime = mime_from_path(&path).ok_or_else(|| "仅支持 jpg/png/gif 图片".to_string())?;
    let filename = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("image")
        .to_string();
    let bytes = fs::read(&path).map_err(|e| format!("读取本地图片失败：{e}"))?;

    upload_image_bytes(app, bytes, filename, mime.into()).await
}

#[tauri::command]
pub async fn upload_remote_image(app: AppHandle, url: String) -> Result<String, String> {
    let target = url::Url::parse(url.trim()).map_err(|_| "图片 URL 格式错误".to_string())?;
    if !matches!(target.scheme(), "http" | "https") {
        return Err("仅支持 http/https 图片".into());
    }
    ensure_public_remote_url(&target)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(Policy::limited(5))
        .build()
        .map_err(|e| format!("创建下载客户端失败：{e}"))?;

    let mut req = client.get(target.clone());
    if ALLOWED_IMG_HOSTS.contains(&target.host_str().unwrap_or("")) {
        req = req.header("Referer", "https://mp.weixin.qq.com");
    }

    let resp = req.send().await.map_err(|e| format!("下载远程图片失败：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载远程图片失败：HTTP {}", resp.status()));
    }

    if let Some(len) = resp.content_length() {
        if len as usize > MAX_SIZE {
            return Err("图片不能超过 10MB".into());
        }
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(normalize_mime)
        .map(str::to_string);
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取远程图片失败：{e}"))?
        .to_vec();
    if bytes.len() > MAX_SIZE {
        return Err("图片不能超过 10MB".into());
    }

    let mime = content_type
        .or_else(|| mime_from_url_path(target.path()).map(str::to_string))
        .ok_or_else(|| "远程资源不是支持的 jpg/png/gif 图片".to_string())?;
    if !looks_like_image_bytes(&bytes, &mime) {
        return Err("远程资源不是有效图片".into());
    }

    let filename = filename_from_remote_url(&target, &mime);
    upload_image_bytes(app, bytes, filename, mime).await
}

async fn upload_image_bytes(
    app: AppHandle,
    bytes: Vec<u8>,
    filename: String,
    mime: String,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    if !ALLOWED_TYPES.contains(&mime.as_str()) {
        return Err("仅支持 jpg/png/gif 图片".into());
    }
    if bytes.len() > MAX_SIZE {
        return Err("图片不能超过 10MB".into());
    }

    let name = if filename.is_empty() { "image".to_string() } else { filename };
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match upload_to_wechat(&token, bytes.clone(), &name, &mime).await {
        Ok(url) => Ok(url),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                clear_token_blocking();
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                upload_to_wechat(&token, bytes, &name, &mime)
                    .await
                    .map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

fn ensure_public_remote_url(target: &url::Url) -> Result<(), String> {
    let host = target.host_str().unwrap_or("");
    if host.eq_ignore_ascii_case("localhost") {
        return Err("不支持下载本机地址图片".into());
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_or_local_ip(ip) {
            return Err("不支持下载内网地址图片".into());
        }
    }

    Ok(())
}

fn is_private_or_local_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip == Ipv4Addr::UNSPECIFIED
                || ip.octets()[0] == 169 && ip.octets()[1] == 254
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || matches!(ip.segments()[0] & 0xfe00, 0xfc00)
                || matches!(ip.segments()[0] & 0xffc0, 0xfe80)
                || ip == Ipv6Addr::LOCALHOST
        }
    }
}

fn mime_from_path(path: &Path) -> Option<&'static str> {
    path.extension()
        .and_then(|v| v.to_str())
        .and_then(|ext| mime_from_ext(ext))
}

fn mime_from_url_path(path: &str) -> Option<&'static str> {
    Path::new(path)
        .extension()
        .and_then(|v| v.to_str())
        .and_then(mime_from_ext)
}

fn mime_from_ext(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

fn normalize_mime(content_type: &str) -> Option<&'static str> {
    let mime = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    match mime.as_str() {
        "image/jpeg" | "image/jpg" => Some("image/jpeg"),
        "image/png" => Some("image/png"),
        "image/gif" => Some("image/gif"),
        _ => None,
    }
}

fn looks_like_image_bytes(bytes: &[u8], mime: &str) -> bool {
    match mime {
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        _ => false,
    }
}

fn filename_from_remote_url(target: &url::Url, mime: &str) -> String {
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

fn ext_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        _ => "jpg",
    }
}

/// 带微信 Referer 拉取 mmbiz 图片，返回 (content_type, bytes)。
/// 供 wximg 自定义协议处理器调用，绕过防盗链。
pub async fn fetch_proxied_image(raw_url: &str) -> Result<(String, Vec<u8>), String> {
    let mut target = url::Url::parse(raw_url).map_err(|_| "bad url".to_string())?;
    let host = target.host_str().unwrap_or("");
    if !ALLOWED_IMG_HOSTS.contains(&host) {
        return Err("forbidden host".into());
    }
    // 微信返回 http 链接，统一升级 https。
    if target.scheme() == "http" {
        let _ = target.set_scheme("https");
    }
    let resp = reqwest::Client::new()
        .get(target.as_str())
        .header("Referer", "https://mp.weixin.qq.com")
        .send()
        .await
        .map_err(|e| format!("proxy error: {e}"))?;
    if !resp.status().is_success() {
        return Err("upstream error".into());
    }
    let content_type = resp
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
    Ok((content_type, bytes))
}

#[derive(Deserialize)]
struct DraftResp {
    media_id: Option<String>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

// 上传封面图，走 add_material(type=image)，取 media_id（区别于 upload_image 取 url）。
async fn upload_thumb_inner(
    token: &str,
    bytes: Vec<u8>,
    filename: &str,
    mime: &str,
) -> Result<String, (Option<i64>, String)> {
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str(mime)
        .map_err(|e| (None, format!("构造表单失败：{e}")))?;
    let form = reqwest::multipart::Form::new().part("media", part);
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    );
    let resp = reqwest::Client::new()
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| (None, format!("上传请求失败：{e}")))?;
    let data: UploadResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析上传响应失败：{e}")))?;
    match data.media_id {
        Some(id) => Ok(id),
        None => Err((data.errcode, data.errmsg.unwrap_or_else(|| "微信上传失败".into()))),
    }
}

/// 上传封面图到微信永久素材，返回 media_id（供 add_draft 用）。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn upload_thumb(
    app: AppHandle,
    bytes: Vec<u8>,
    filename: String,
    mime: String,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    if !ALLOWED_TYPES.contains(&mime.as_str()) {
        return Err("仅支持 jpg/png/gif 图片".into());
    }
    if bytes.len() > MAX_SIZE {
        return Err("图片不能超过 10MB".into());
    }
    let name = if filename.is_empty() { "thumb".to_string() } else { filename };
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match upload_thumb_inner(&token, bytes.clone(), &name, &mime).await {
        Ok(id) => Ok(id),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                clear_token_blocking();
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                upload_thumb_inner(&token, bytes, &name, &mime).await.map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

async fn add_draft_inner(
    token: &str,
    title: &str,
    content: &str,
    thumb_media_id: &str,
) -> Result<String, (Option<i64>, String)> {
    let body = serde_json::json!({
        "articles": [{
            "title": title,
            "content": content,
            "thumb_media_id": thumb_media_id,
            "author": "",
            "digest": "",
            "content_source_url": ""
        }]
    });
    let url = format!("https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}");
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| (None, format!("发布请求失败：{e}")))?;
    let data: DraftResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析发布响应失败：{e}")))?;
    match data.media_id {
        Some(id) => Ok(id),
        None => Err((data.errcode, data.errmsg.unwrap_or_else(|| "微信发布失败".into()))),
    }
}

/// 发布到公众号草稿箱（draft/add）。author/digest/content_source_url 暂空。
/// 返回草稿 media_id。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn add_draft(
    app: AppHandle,
    title: String,
    content: String,
    thumb_media_id: String,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match add_draft_inner(&token, &title, &content, &thumb_media_id).await {
        Ok(id) => Ok(id),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                clear_token_blocking();
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                add_draft_inner(&token, &title, &content, &thumb_media_id).await.map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}
