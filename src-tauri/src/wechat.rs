// 微信官方图床上传 + 图片代理拉取。
// secret 不出前端：前端只调 upload_image command，凭证仅 Rust 读 config。

use crate::config::load_wechat_config;
use crate::ipc_util::request_header;
use aes::Aes128;
use block_padding::Pkcs7;
use cbc::cipher::{BlockDecryptMut, KeyIvInit};
use cbc::Decryptor;
use image::codecs::jpeg::JpegDecoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageFormat};
use jpeg_encoder::{ColorType as FastJpegColorType, Encoder as FastJpegEncoder, SamplingFactor};
use resvg::tiny_skia;
use resvg::usvg;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::net::{IpAddr, Ipv4Addr};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const MAX_SIZE: usize = 10 * 1024 * 1024; // add_material 图片限制 10MB
const TARGET_SIZE: usize = MAX_SIZE; // 实测微信接受正好 10MiB，超出 1 字节返回 45001
const MAX_SOURCE_SIZE: usize = 50 * 1024 * 1024;
const MAX_DECODED_PIXELS: u64 = 50_000_000;
const PNG_LOSSLESS_RETRY_RATIO: usize = 5;
const ALLOWED_TYPES: [&str; 3] = ["image/jpeg", "image/png", "image/gif"];

// 防盗链图片域名白名单，防 SSRF。
pub const ALLOWED_IMG_HOSTS: [&str; 5] = [
    "mmbiz.qpic.cn",
    "mmbiz.qlogo.cn",
    "wx.qlogo.cn",
    "search.c2c.weixin.qq.com",
    "wxapp.tc.qq.com",
];

// access_token 缓存：微信限频，必须复用（有效期 7200s）。
struct TokenCache {
    token: String,
    expire_at: Instant,
    credential_key: u64,
}

static TOKEN_CACHE: Mutex<Option<TokenCache>> = Mutex::new(None);
static TOKEN_FETCH_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
static IMAGE_COMPRESSION_LIMIT: OnceLock<tokio::sync::Semaphore> = OnceLock::new();

fn jpeg_probe_count() -> usize {
    match std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
    {
        16.. => 7,
        12..=15 => 5,
        6..=11 => 3,
        3..=5 => 2,
        _ => 1,
    }
}

fn compression_worker_count() -> usize {
    std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
        .div_ceil(jpeg_probe_count())
        .max(1)
}

const OUTBOUND_IP_ENDPOINTS: [&str; 4] = [
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
    "http://ipinfo.io/ip",
    "https://checkip.amazonaws.com",
];

const WECHAT_IP_WHITELIST_HINT: &str = "请去微信后台 IP 白名单设置：在微信公众平台「设置与开发 → 基本配置 → IP 白名单」添加/更换当前出口 IP；可在本软件设置页一键获取出口 IP。";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageUploadProgress {
    task_id: String,
    phase: &'static str,
    filename: String,
    original_size: Option<usize>,
    output_size: Option<usize>,
}

fn emit_upload_progress(
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

#[derive(Deserialize)]
struct MaterialListResp {
    total_count: Option<u32>,
    item_count: Option<u32>,
    item: Option<Vec<RawMaterialItem>>,
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Deserialize)]
struct MaterialActionResp {
    errcode: Option<i64>,
    errmsg: Option<String>,
}

#[derive(Deserialize)]
struct RawMaterialItem {
    media_id: Option<String>,
    name: Option<String>,
    update_time: Option<u64>,
    url: Option<String>,
    cover_url: Option<String>,
    vid: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImageItem {
    media_id: String,
    name: String,
    update_time: u64,
    url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImagePage {
    total_count: u32,
    item_count: u32,
    items: Vec<MaterialImageItem>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVideoItem {
    media_id: String,
    name: String,
    update_time: u64,
    cover_url: String,
    vid: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVideoPage {
    total_count: u32,
    item_count: u32,
    items: Vec<MaterialVideoItem>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVoiceItem {
    media_id: String,
    name: String,
    update_time: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialVoicePage {
    total_count: u32,
    item_count: u32,
    items: Vec<MaterialVoiceItem>,
}

fn credential_key(app_id: &str, app_secret: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    app_id.hash(&mut hasher);
    app_secret.hash(&mut hasher);
    hasher.finish()
}

fn cached_access_token(key: u64) -> Option<String> {
    let cache = TOKEN_CACHE.lock().unwrap();
    cache.as_ref().and_then(|cached| {
        (cached.credential_key == key && Instant::now() < cached.expire_at)
            .then(|| cached.token.clone())
    })
}

async fn fetch_access_token(app_id: &str, app_secret: &str, key: u64) -> Result<String, String> {
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={}&secret={}",
        urlencoding::encode(app_id),
        urlencoding::encode(app_secret),
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("请求 access_token 失败：{}", e.without_url()))?;
    let data: TokenResp = resp
        .json()
        .await
        .map_err(|e| format!("解析 access_token 响应失败：{}", e.without_url()))?;
    match data.access_token {
        Some(token) => {
            // 提前 5 分钟过期，避免边界上用到已失效的 token。
            let ttl = data.expires_in.unwrap_or(7200).saturating_sub(300);
            let mut cache = TOKEN_CACHE.lock().unwrap();
            *cache = Some(TokenCache {
                token: token.clone(),
                expire_at: Instant::now() + Duration::from_secs(ttl),
                credential_key: key,
            });
            Ok(token)
        }
        None => Err(format_wechat_error(
            data.errcode,
            &data.errmsg.unwrap_or_default(),
            "获取 access_token 失败",
        )),
    }
}

async fn get_access_token(app_id: &str, app_secret: &str) -> Result<String, String> {
    let key = credential_key(app_id, app_secret);
    if let Some(token) = cached_access_token(key) {
        return Ok(token);
    }
    let fetch_lock = TOKEN_FETCH_LOCK.get_or_init(|| tokio::sync::Mutex::new(()));
    let _guard = fetch_lock.lock().await;
    if let Some(token) = cached_access_token(key) {
        return Ok(token);
    }
    fetch_access_token(app_id, app_secret, key).await
}

/// 清 token 缓存（凭证变更或 token 失效时调用）。同步，供 save_config 调用。
pub fn clear_token_blocking() {
    let mut cache = TOKEN_CACHE.lock().unwrap();
    *cache = None;
}

fn invalidate_access_token(failed_token: &str) {
    let mut cache = TOKEN_CACHE.lock().unwrap();
    if cache
        .as_ref()
        .is_some_and(|cached| cached.token == failed_token)
    {
        *cache = None;
    }
}

#[tauri::command]
pub async fn get_outbound_ip() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .local_address(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
        // IP 白名单需要本机直连出口；系统代理会显示代理节点 IP，和微信后台看到的不一致。
        .no_proxy()
        .build()
        .map_err(|e| format!("创建出口 IP 查询客户端失败：{e}"))?;

    let mut last_error = String::new();
    for endpoint in OUTBOUND_IP_ENDPOINTS {
        match client.get(endpoint).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_error = format!("{endpoint} 返回 HTTP {}", resp.status());
                    continue;
                }
                match resp.text().await {
                    Ok(body) => match parse_outbound_ip_response(&body) {
                        Ok(ip) => return Ok(ip),
                        Err(msg) => last_error = format!("{endpoint}：{msg}"),
                    },
                    Err(e) => last_error = format!("{endpoint} 响应读取失败：{e}"),
                }
            }
            Err(e) => last_error = format!("{endpoint} 请求失败：{e}"),
        }
    }

    if last_error.is_empty() {
        Err("获取出口 IP 失败，请检查网络后重试".into())
    } else {
        Err(format!("获取出口 IP 失败：{last_error}"))
    }
}

fn parse_outbound_ip_response(body: &str) -> Result<String, String> {
    let value = body.trim();
    match value.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => Ok(ip.to_string()),
        Ok(IpAddr::V6(_)) => Err("出口 IP 服务返回的是 IPv6 地址，请重试获取 IPv4".to_string()),
        Err(_) => Err("出口 IP 服务返回内容不是合法 IP".to_string()),
    }
}

fn format_wechat_error(errcode: Option<i64>, errmsg: &str, context: &str) -> String {
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

fn is_wechat_ip_whitelist_error(errcode: Option<i64>, errmsg: &str) -> bool {
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

fn parse_material_page_response(body: &str) -> Result<MaterialImagePage, (Option<i64>, String)> {
    let data: MaterialListResp =
        serde_json::from_str(body).map_err(|e| (None, format!("解析素材库响应失败：{e}")))?;

    if let Some(code) = data.errcode {
        if code != 0 {
            return Err((
                Some(code),
                format_wechat_error(
                    Some(code),
                    &data.errmsg.unwrap_or_else(|| "微信素材库获取失败".into()),
                    "微信素材库获取失败",
                ),
            ));
        }
    }

    let raw_items = data.item.unwrap_or_default();
    let items: Vec<MaterialImageItem> = raw_items
        .into_iter()
        .filter_map(|item| {
            let media_id = item.media_id?.trim().to_string();
            let url = item.url?.trim().to_string();
            if media_id.is_empty() || url.is_empty() {
                return None;
            }

            let name = item
                .name
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "未命名图片".to_string());

            Some(MaterialImageItem {
                media_id,
                name,
                update_time: item.update_time.unwrap_or(0),
                url,
            })
        })
        .collect();
    let item_count = data.item_count.unwrap_or(items.len() as u32);

    Ok(MaterialImagePage {
        total_count: data.total_count.unwrap_or(0),
        item_count,
        items,
    })
}

fn parse_video_material_page_response(
    body: &str,
) -> Result<MaterialVideoPage, (Option<i64>, String)> {
    let data: MaterialListResp =
        serde_json::from_str(body).map_err(|e| (None, format!("解析素材库响应失败：{e}")))?;

    if let Some(code) = data.errcode {
        if code != 0 {
            return Err((
                Some(code),
                format_wechat_error(
                    Some(code),
                    &data.errmsg.unwrap_or_else(|| "微信素材库获取失败".into()),
                    "微信素材库获取失败",
                ),
            ));
        }
    }

    let raw_items = data.item.unwrap_or_default();
    let items: Vec<MaterialVideoItem> = raw_items
        .into_iter()
        .filter_map(|item| {
            let media_id = item.media_id?.trim().to_string();
            let vid = item.vid?.trim().to_string();
            if media_id.is_empty() || vid.is_empty() {
                return None;
            }

            let name = item
                .name
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "未命名视频".to_string());

            Some(MaterialVideoItem {
                media_id,
                name,
                update_time: item.update_time.unwrap_or(0),
                cover_url: item.cover_url.unwrap_or_default(),
                vid,
            })
        })
        .collect();
    let item_count = data.item_count.unwrap_or(items.len() as u32);

    Ok(MaterialVideoPage {
        total_count: data.total_count.unwrap_or(0),
        item_count,
        items,
    })
}

fn parse_voice_material_page_response(
    body: &str,
) -> Result<MaterialVoicePage, (Option<i64>, String)> {
    let data: MaterialListResp =
        serde_json::from_str(body).map_err(|e| (None, format!("解析素材库响应失败：{e}")))?;

    if let Some(code) = data.errcode {
        if code != 0 {
            return Err((
                Some(code),
                format_wechat_error(
                    Some(code),
                    &data.errmsg.unwrap_or_else(|| "微信素材库获取失败".into()),
                    "微信素材库获取失败",
                ),
            ));
        }
    }

    let raw_items = data.item.unwrap_or_default();
    let items: Vec<MaterialVoiceItem> = raw_items
        .into_iter()
        .filter_map(|item| {
            let media_id = item.media_id?.trim().to_string();
            if media_id.is_empty() {
                return None;
            }

            let name = item
                .name
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "未命名音频".to_string());

            Some(MaterialVoiceItem {
                media_id,
                name,
                update_time: item.update_time.unwrap_or(0),
            })
        })
        .collect();
    let item_count = data.item_count.unwrap_or(items.len() as u32);

    Ok(MaterialVoicePage {
        total_count: data.total_count.unwrap_or(0),
        item_count,
        items,
    })
}

async fn fetch_material_page_text(
    token: &str,
    material_type: &str,
    offset: u32,
    count: u32,
) -> Result<String, (Option<i64>, String)> {
    let bounded_count = count.clamp(1, 20);
    let body = serde_json::json!({
        "type": material_type,
        "offset": offset,
        "count": bounded_count,
    });
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token={token}"
    );
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| (None, format!("获取素材库请求失败：{}", e.without_url())))?;
    let status = resp.status();
    if !status.is_success() {
        return Err((None, format!("获取素材库失败：HTTP {status}")));
    }
    resp.text()
        .await
        .map_err(|e| (None, format!("读取素材库响应失败：{}", e.without_url())))
}

async fn list_image_materials_inner(
    token: &str,
    offset: u32,
    count: u32,
) -> Result<MaterialImagePage, (Option<i64>, String)> {
    let body = fetch_material_page_text(token, "image", offset, count).await?;
    parse_material_page_response(&body)
}

async fn list_video_materials_inner(
    token: &str,
    offset: u32,
    count: u32,
) -> Result<MaterialVideoPage, (Option<i64>, String)> {
    let body = fetch_material_page_text(token, "video", offset, count).await?;
    parse_video_material_page_response(&body)
}

async fn list_voice_materials_inner(
    token: &str,
    offset: u32,
    count: u32,
) -> Result<MaterialVoicePage, (Option<i64>, String)> {
    let body = fetch_material_page_text(token, "voice", offset, count).await?;
    parse_voice_material_page_response(&body)
}

/// 获取公众号永久图片素材列表。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn list_image_materials(
    app: AppHandle,
    offset: u32,
    count: u32,
) -> Result<MaterialImagePage, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }

    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match list_image_materials_inner(&token, offset, count).await {
        Ok(page) => Ok(page),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                list_image_materials_inner(&token, offset, count)
                    .await
                    .map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

/// 获取公众号永久视频素材列表。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn list_video_materials(
    app: AppHandle,
    offset: u32,
    count: u32,
) -> Result<MaterialVideoPage, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }

    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match list_video_materials_inner(&token, offset, count).await {
        Ok(page) => Ok(page),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                list_video_materials_inner(&token, offset, count)
                    .await
                    .map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

/// 获取公众号永久音频素材列表。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn list_voice_materials(
    app: AppHandle,
    offset: u32,
    count: u32,
) -> Result<MaterialVoicePage, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }

    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match list_voice_materials_inner(&token, offset, count).await {
        Ok(page) => Ok(page),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                list_voice_materials_inner(&token, offset, count)
                    .await
                    .map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

/// 获取视频素材的可流式播放直链（mp4）。
/// 流程：get_material 拿 down_url（播放页）→ 抓取页面 → 提取最高清晰度 mp4 地址。
/// mp4 地址带签名时效，每次播放前应重新获取。
#[tauri::command]
pub async fn get_video_play_url(app: AppHandle, media_id: String) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }

    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    let body = serde_json::json!({ "media_id": media_id });
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/get_material?access_token={token}"
    );
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("获取视频素材详情失败：{}", e.without_url()))?;
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析视频素材详情失败：{}", e.without_url()))?;
    let down_url = data
        .get("down_url")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "视频播放页地址获取失败".to_string())?;

    let page = reqwest::get(&down_url)
        .await
        .map_err(|e| format!("打开视频播放页失败：{}", e.without_url()))?
        .text()
        .await
        .map_err(|e| format!("读取视频播放页失败：{}", e.without_url()))?;

    extract_video_mp4_url(&page).ok_or_else(|| "视频播放页未找到可播放地址".to_string())
}

// 从播放页 HTML 提取最高清晰度 mp4 地址（url: '...mp4?...'，按 .f1000X 清晰度取最大）。
fn extract_video_mp4_url(html: &str) -> Option<String> {
    let mut best: Option<(u32, String)> = None;
    for capture in html.match_indices("url: '") {
        let start = capture.0 + "url: '".len();
        let rest = &html[start..];
        let end = rest.find('\'')?;
        let candidate = &rest[..end];
        if !candidate.contains(".mp4") {
            continue;
        }
        let decoded = candidate.replace("\\x26amp;", "&");
        let quality = decoded
            .split(".f")
            .nth(1)
            .and_then(|part| part.split('.').next())
            .and_then(|num| num.parse::<u32>().ok())
            .unwrap_or(0);
        if best.as_ref().map(|(q, _)| quality > *q).unwrap_or(true) {
            best = Some((quality, decoded));
        }
    }
    best.map(|(_, url)| url)
}

fn parse_delete_material_response(body: &str) -> Result<(), (Option<i64>, String)> {
    let data: MaterialActionResp =
        serde_json::from_str(body).map_err(|e| (None, format!("解析素材删除响应失败：{e}")))?;
    match data.errcode {
        Some(0) => Ok(()),
        errcode => Err((
            errcode,
            format_wechat_error(
                errcode,
                &data.errmsg.unwrap_or_else(|| "微信素材删除失败".into()),
                "微信素材删除失败",
            ),
        )),
    }
}

async fn delete_image_material_inner(
    token: &str,
    media_id: &str,
) -> Result<(), (Option<i64>, String)> {
    let url =
        format!("https://api.weixin.qq.com/cgi-bin/material/del_material?access_token={token}");
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({"media_id": media_id}))
        .send()
        .await
        .map_err(|e| (None, format!("删除素材请求失败：{}", e.without_url())))?;
    let status = resp.status();
    if !status.is_success() {
        return Err((None, format!("删除素材失败：HTTP {status}")));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| (None, format!("读取素材删除响应失败：{}", e.without_url())))?;
    parse_delete_material_response(&body)
}

/// 删除公众号永久图片素材。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn delete_image_material(app: AppHandle, media_id: String) -> Result<(), String> {
    let media_id = media_id.trim();
    if media_id.is_empty() {
        return Err("素材 ID 不能为空".into());
    }

    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }

    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match delete_image_material_inner(&token, media_id).await {
        Ok(()) => Ok(()),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                delete_image_material_inner(&token, media_id)
                    .await
                    .map_err(|(_, message)| message)
            } else {
                Err(msg)
            }
        }
    }
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
        .map_err(|e| (None, format!("上传请求失败：{}", e.without_url())))?;
    let data: UploadResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析上传响应失败：{}", e.without_url())))?;
    match data.url {
        Some(u) => Ok(u),
        None => Err((
            data.errcode,
            format_wechat_error(
                data.errcode,
                &data.errmsg.unwrap_or_else(|| "微信上传失败".into()),
                "微信上传失败",
            ),
        )),
    }
}

/// File/Blob 使用原始二进制 IPC 请求体，避免把大图片扩展成巨大的 JSON 数字数组。
#[tauri::command]
pub async fn upload_image(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        tauri::ipc::InvokeBody::Json(_) => return Err("图片上传请求必须使用二进制数据".into()),
    };
    let encoded_filename = request_header(&request, "x-vellum-filename")?;
    let filename = urlencoding::decode(&encoded_filename)
        .map_err(|_| "图片文件名编码无效".to_string())?
        .into_owned();
    let mime = request_header(&request, "x-vellum-mime")?;
    let task_id = request_header(&request, "x-vellum-task-id").ok();
    upload_image_bytes(app, bytes, filename, mime, task_id).await
}

#[tauri::command]
pub async fn upload_local_image(
    app: AppHandle,
    path: String,
    task_id: Option<String>,
) -> Result<String, String> {
    let display_name = Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("本地图片");
    emit_upload_progress(&app, &task_id, "reading", display_name, None, None);
    let path = fs::canonicalize(path).map_err(|e| format!("读取本地图片路径失败：{e}"))?;
    if !path.is_file() {
        return Err("本地图片不存在".into());
    }
    let meta = fs::metadata(&path).map_err(|e| format!("读取本地图片信息失败：{e}"))?;
    if meta.len() as usize > MAX_SOURCE_SIZE {
        return Err("原始图片不能超过 50MB".into());
    }

    // 检查是否为 SVG 文件
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    let (bytes, filename, mime) = if ext == "svg" {
        // SVG 转 PNG
        let png_bytes = convert_svg_to_png(&path)?;

        let original_name = path.file_stem().and_then(|v| v.to_str()).unwrap_or("image");
        let new_filename = format!("{}.png", original_name);

        (png_bytes, new_filename, "image/png")
    } else {
        // 常规图片处理
        let mime =
            mime_from_path(&path).ok_or_else(|| "仅支持 jpg/png/gif/svg 图片".to_string())?;
        let filename = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("image")
            .to_string();
        let bytes = fs::read(&path).map_err(|e| format!("读取本地图片失败：{e}"))?;

        (bytes, filename, mime)
    };

    upload_image_bytes(app, bytes, filename, mime.into(), task_id).await
}

struct DownloadedImage {
    bytes: Vec<u8>,
    filename: String,
    mime: String,
}

#[tauri::command]
pub async fn upload_remote_image(
    app: AppHandle,
    url: String,
    task_id: Option<String>,
) -> Result<String, String> {
    emit_upload_progress(&app, &task_id, "downloading", "远程图片", None, None);
    let image = download_remote_image(&url).await?;
    upload_image_bytes(app, image.bytes, image.filename, image.mime, task_id).await
}

async fn download_remote_image(raw_url: &str) -> Result<DownloadedImage, String> {
    let mut target =
        url::Url::parse(raw_url.trim()).map_err(|_| "图片 URL 格式错误".to_string())?;
    let mut redirect_count = 0usize;
    let resp = loop {
        let client = remote_image_client(&target).await?;
        let mut request = client.get(target.clone());
        if ALLOWED_IMG_HOSTS.contains(&target.host_str().unwrap_or("")) {
            request = request.header("Referer", "https://mp.weixin.qq.com");
        }
        let response = request
            .send()
            .await
            .map_err(|e| format!("下载远程图片失败：{}", e.without_url()))?;
        if matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
            if redirect_count >= 5 {
                return Err("远程图片重定向次数过多".into());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "远程图片重定向缺少有效 Location".to_string())?
                .to_owned();
            target = target
                .join(&location)
                .map_err(|_| "远程图片重定向地址无效".to_string())?;
            redirect_count += 1;
            continue;
        }
        break response;
    };
    if !resp.status().is_success() {
        return Err(format!("下载远程图片失败：HTTP {}", resp.status()));
    }

    if let Some(len) = resp.content_length() {
        if len as usize > MAX_SOURCE_SIZE {
            return Err("原始图片不能超过 50MB".into());
        }
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(normalize_mime)
        .map(str::to_string);
    let mut resp = resp;
    let mut bytes = Vec::with_capacity(
        resp.content_length()
            .unwrap_or(0)
            .min(MAX_SOURCE_SIZE as u64) as usize,
    );
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("读取远程图片失败：{}", e.without_url()))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_SOURCE_SIZE {
            return Err("原始图片不能超过 50MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }

    // 优先按真实字节识别：微信表情 CDN 的 Content-Type（如 image/jpg）可能不可信，
    // 以文件头实际格式为准。
    let mime = mime_from_bytes(&bytes)
        .map(str::to_string)
        .or(content_type)
        .or_else(|| mime_from_url_path(target.path()).map(str::to_string))
        .ok_or_else(|| "远程资源不是支持的 jpg/png/gif 图片".to_string())?;
    if !looks_like_image_bytes(&bytes, &mime) {
        return Err("远程资源不是有效图片".into());
    }

    let filename = filename_from_remote_url(&target, &mime);
    Ok(DownloadedImage {
        bytes,
        filename,
        mime,
    })
}

async fn remote_image_client(target: &url::Url) -> Result<reqwest::Client, String> {
    ensure_public_remote_url(target)?;
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none());

    if let Some(url::Host::Domain(host)) = target.host() {
        let port = target
            .port_or_known_default()
            .ok_or_else(|| "图片 URL 缺少有效端口".to_string())?;
        let addresses = tokio::net::lookup_host((host, port))
            .await
            .map_err(|e| format!("解析图片域名失败：{e}"))?
            .collect::<Vec<_>>();
        if addresses.is_empty() {
            return Err("图片域名没有可用地址".into());
        }
        validate_remote_addresses(&addresses)?;
        // 固定本次连接使用刚校验过的地址，消除校验与连接之间的 DNS 重绑定窗口。
        builder = builder.resolve_to_addrs(host, &addresses);
    }

    builder
        .build()
        .map_err(|e| format!("创建下载客户端失败：{}", e.without_url()))
}

fn validate_remote_addresses(addresses: &[std::net::SocketAddr]) -> Result<(), String> {
    if addresses.is_empty() {
        return Err("图片域名没有可用地址".into());
    }
    if addresses
        .iter()
        .any(|address| !crate::preview_image::is_globally_routable_ip(address.ip()))
    {
        return Err("图片域名解析到了内网或本机地址".into());
    }
    Ok(())
}

#[derive(Debug)]
struct PreparedUpload {
    bytes: Vec<u8>,
    filename: String,
    mime: String,
}

async fn prepare_upload_async(
    bytes: Vec<u8>,
    filename: String,
    mime: String,
) -> Result<PreparedUpload, String> {
    if bytes.len() <= MAX_SIZE {
        return Ok(PreparedUpload {
            bytes,
            filename,
            mime,
        });
    }
    let compression_limit = IMAGE_COMPRESSION_LIMIT
        .get_or_init(|| tokio::sync::Semaphore::new(compression_worker_count()));
    let _permit = compression_limit
        .acquire()
        .await
        .map_err(|_| "图片压缩队列已关闭".to_string())?;
    tokio::task::spawn_blocking(move || {
        prepare_upload_for_limit(bytes, filename, mime, MAX_SIZE, TARGET_SIZE)
    })
    .await
    .map_err(|e| format!("图片压缩任务失败：{e}"))?
}

fn prepare_upload_for_limit(
    bytes: Vec<u8>,
    filename: String,
    mime: String,
    max_size: usize,
    target_size: usize,
) -> Result<PreparedUpload, String> {
    if bytes.len() > MAX_SOURCE_SIZE {
        return Err("原始图片不能超过 50MB".into());
    }
    if bytes.len() <= max_size {
        return Ok(PreparedUpload {
            bytes,
            filename,
            mime,
        });
    }
    if mime == "image/gif" {
        return Err("GIF 超过 10MB，暂时无法在保留动画的情况下自动压缩".into());
    }

    let format = match mime.as_str() {
        "image/jpeg" => ImageFormat::Jpeg,
        "image/png" => ImageFormat::Png,
        _ => return Err("仅支持 jpg/png/gif 图片".into()),
    };
    let (width, height) = image::ImageReader::with_format(Cursor::new(bytes.as_slice()), format)
        .into_dimensions()
        .map_err(|e| format!("读取图片尺寸失败：{e}"))?;
    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_DECODED_PIXELS {
        return Err("图片像素过大，最大支持 5000 万像素".into());
    }

    let image = decode_for_reencoding(&bytes, format)?;
    let original_size = bytes.len();
    let prepared = if mime == "image/jpeg" {
        compress_jpeg(image, filename, target_size)?
    } else {
        compress_png(image, filename, target_size, original_size)?
    };
    if prepared.bytes.len() > max_size {
        return Err("图片在保持原分辨率后仍超过 10MB，请先转换或裁剪图片".into());
    }
    eprintln!(
        "图片已自动压缩：{:.2}MB -> {:.2}MB",
        original_size as f64 / 1024.0 / 1024.0,
        prepared.bytes.len() as f64 / 1024.0 / 1024.0
    );
    Ok(prepared)
}

fn decode_for_reencoding(bytes: &[u8], format: ImageFormat) -> Result<DynamicImage, String> {
    if format == ImageFormat::Jpeg {
        let mut decoder =
            JpegDecoder::new(Cursor::new(bytes)).map_err(|e| format!("解码 JPEG 失败：{e}"))?;
        let orientation = decoder
            .orientation()
            .map_err(|e| format!("读取 JPEG 方向失败：{e}"))?;
        let mut image =
            DynamicImage::from_decoder(decoder).map_err(|e| format!("解码 JPEG 失败：{e}"))?;
        image.apply_orientation(orientation);
        Ok(image)
    } else {
        image::load_from_memory_with_format(bytes, format).map_err(|e| format!("解码图片失败：{e}"))
    }
}

fn compress_jpeg(
    image: DynamicImage,
    filename: String,
    target_size: usize,
) -> Result<PreparedUpload, String> {
    let encoded = best_jpeg_under(&image, target_size)?;
    if let Some(candidate) = encoded {
        eprintln!("JPEG 自动压缩采用质量 {}", candidate.quality);
        return Ok(PreparedUpload {
            bytes: candidate.bytes,
            filename: replace_extension(&filename, "jpg"),
            mime: "image/jpeg".into(),
        });
    }
    Err("图片在保持原分辨率后仍超过 10MB，请先转换或裁剪图片".into())
}

fn compress_png(
    image: DynamicImage,
    filename: String,
    target_size: usize,
    original_size: usize,
) -> Result<PreparedUpload, String> {
    if original_size <= target_size.saturating_mul(PNG_LOSSLESS_RETRY_RATIO) / 4 {
        let encoded = encode_png(&image, CompressionType::Fast)?;
        if encoded.len() <= target_size {
            return Ok(PreparedUpload {
                bytes: encoded,
                filename: replace_extension(&filename, "png"),
                mime: "image/png".into(),
            });
        }
    }

    compress_jpeg(image, replace_extension(&filename, "jpg"), target_size)
}

#[derive(Debug)]
struct JpegCandidate {
    quality: u8,
    bytes: Vec<u8>,
}

fn best_jpeg_under(
    image: &DynamicImage,
    target_size: usize,
) -> Result<Option<JpegCandidate>, String> {
    let rgb = rgb_on_white(image);
    let probe_count = jpeg_probe_count();
    let mut low_quality = 0u16;
    let mut high_quality = 101u16;
    let mut best: Option<JpegCandidate> = None;

    while high_quality > low_quality + 1 {
        let span = usize::from(high_quality - low_quality);
        let mut qualities = (1..=probe_count)
            .map(|index| low_quality + ((span * index) / (probe_count + 1)) as u16)
            .filter(|quality| *quality > low_quality && *quality < high_quality)
            .map(|quality| quality as u8)
            .collect::<Vec<_>>();
        qualities.sort_unstable();
        qualities.dedup();
        if qualities.is_empty() {
            qualities.push((low_quality + 1) as u8);
        }

        let mut candidates = std::thread::scope(|scope| {
            let rgb = &rgb;
            let handles = qualities
                .into_iter()
                .map(|quality| {
                    scope.spawn(move || encode_jpeg(rgb, quality).map(|bytes| (quality, bytes)))
                })
                .collect::<Vec<_>>();
            handles
                .into_iter()
                .map(|handle| {
                    handle
                        .join()
                        .map_err(|_| "JPEG 并行编码任务异常退出".to_string())?
                })
                .collect::<Result<Vec<_>, String>>()
        })?;
        candidates.sort_unstable_by_key(|candidate| candidate.0);

        for (quality, bytes) in candidates {
            if bytes.len() <= target_size {
                low_quality = u16::from(quality);
                best = Some(JpegCandidate { quality, bytes });
            } else {
                high_quality = u16::from(quality);
                break;
            }
        }
    }

    Ok(best)
}

fn encode_jpeg(image: &image::RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let width =
        u16::try_from(image.width()).map_err(|_| "图片宽度超过 JPEG 编码上限".to_string())?;
    let height =
        u16::try_from(image.height()).map_err(|_| "图片高度超过 JPEG 编码上限".to_string())?;
    let mut bytes = Vec::new();
    let mut encoder = FastJpegEncoder::new(&mut bytes, quality);
    encoder.set_sampling_factor(SamplingFactor::F_1_1);
    encoder
        .encode(image.as_raw(), width, height, FastJpegColorType::Rgb)
        .map_err(|e| format!("JPEG 编码失败：{e}"))?;
    Ok(bytes)
}

fn rgb_on_white(image: &DynamicImage) -> image::RgbImage {
    if !image.color().has_alpha() {
        return image.to_rgb8();
    }
    let rgba = image.to_rgba8();
    image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let pixel = rgba.get_pixel(x, y).0;
        let alpha = u16::from(pixel[3]);
        let blend =
            |channel: u8| ((u16::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
        image::Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])])
    })
}

fn encode_png(image: &DynamicImage, compression: CompressionType) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    PngEncoder::new_with_quality(&mut bytes, compression, FilterType::Paeth)
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .map_err(|e| format!("PNG 编码失败：{e}"))?;
    Ok(bytes)
}

fn replace_extension(filename: &str, extension: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("image");
    format!("{stem}.{extension}")
}

async fn upload_image_bytes(
    app: AppHandle,
    bytes: Vec<u8>,
    filename: String,
    mime: String,
    task_id: Option<String>,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    if !ALLOWED_TYPES.contains(&mime.as_str()) {
        return Err("仅支持 jpg/png/gif 图片".into());
    }
    let name = if filename.is_empty() {
        "image".to_string()
    } else {
        filename
    };
    let original_size = bytes.len();
    let phase = if original_size > MAX_SIZE {
        "compressing"
    } else {
        "preparing"
    };
    emit_upload_progress(&app, &task_id, phase, &name, Some(original_size), None);
    let prepared = prepare_upload_async(bytes, name, mime).await?;
    emit_upload_progress(
        &app,
        &task_id,
        "uploading",
        &prepared.filename,
        Some(original_size),
        Some(prepared.bytes.len()),
    );
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match upload_to_wechat(
        &token,
        prepared.bytes.clone(),
        &prepared.filename,
        &prepared.mime,
    )
    .await
    {
        Ok(url) => Ok(url),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                upload_to_wechat(&token, prepared.bytes, &prepared.filename, &prepared.mime)
                    .await
                    .map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

fn ensure_public_remote_url(target: &url::Url) -> Result<(), String> {
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
fn is_allowed_redirect_target(target: &url::Url) -> bool {
    ensure_public_remote_url(target).is_ok()
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

// 微信 normal 表情加密格式（实测 + 社区逆向结论一致）：
// AES-128-CBC，key 与 IV 都是响应的 aes_key 十六进制串（32 字符 = 16 字节），
// PKCS7 填充。openssl 等价命令：
//   openssl enc -d -aes-128-cbc -in <加密文件> -K <aeskey> -iv <aeskey>
fn decrypt_wechat_emoji(cipher: &[u8], aes_key_hex: &str) -> Result<Vec<u8>, String> {
    let key_hex = aes_key_hex.trim();
    if key_hex.len() != 32 {
        return Err("表情解密密钥格式错误（应为 32 位十六进制）".into());
    }
    let mut key = [0u8; 16];
    for (index, byte) in key.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&key_hex[index * 2..index * 2 + 2], 16)
            .map_err(|_| "表情解密密钥不是有效十六进制".to_string())?;
    }
    if cipher.len() < 16 || cipher.len() % 16 != 0 {
        return Err("表情内容长度不是 16 的整数倍，无法解密".into());
    }
    let decryptor = Decryptor::<Aes128>::new_from_slices(&key, &key)
        .map_err(|_| "表情解密初始化失败".to_string())?;
    let plain = decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(cipher)
        .map_err(|_| "表情解密失败（密钥不匹配或内容损坏）".to_string())?;
    Ok(plain)
}

// 部分微信表情 CDN 响应不带 Content-Type 且 URL 无扩展名，
// 直接从文件头识别图片类型。
fn mime_from_bytes(bytes: &[u8]) -> Option<&'static str> {
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

fn convert_svg_to_png(svg_path: &Path) -> Result<Vec<u8>, String> {
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

fn normalize_mime(content_type: &str) -> Option<&'static str> {
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

/// 带微信 Referer 拉取图片，返回 (content_type, bytes)。
/// 供 wximg 自定义协议处理器调用，绕过防盗链。
/// aes_key 存在时按微信 normal 表情规则解密后再返回。
pub async fn fetch_proxied_image(
    raw_url: &str,
    aes_key: Option<&str>,
) -> Result<(String, Vec<u8>), String> {
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
    let bytes = match aes_key.filter(|key| !key.trim().is_empty()) {
        Some(key) => decrypt_wechat_emoji(&bytes, key)?,
        None => bytes,
    };
    let mime = mime_from_bytes(&bytes)
        .map(str::to_string)
        .unwrap_or(content_type);
    Ok((mime, bytes))
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
        .map_err(|e| (None, format!("上传请求失败：{}", e.without_url())))?;
    let data: UploadResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析上传响应失败：{}", e.without_url())))?;
    match data.media_id {
        Some(id) => Ok(id),
        None => Err((
            data.errcode,
            format_wechat_error(
                data.errcode,
                &data.errmsg.unwrap_or_else(|| "微信上传失败".into()),
                "微信上传失败",
            ),
        )),
    }
}

/// 上传封面图到微信永久素材，返回 media_id（供 add_draft 用）。未配置返回 "NOT_CONFIGURED"。
/// 与 upload_image 一致，使用原始二进制 IPC 请求体，元数据经 header 传递。
#[tauri::command]
pub async fn upload_thumb(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        tauri::ipc::InvokeBody::Json(_) => return Err("图片上传请求必须使用二进制数据".into()),
    };
    let encoded_filename = request_header(&request, "x-vellum-filename")?;
    let filename = urlencoding::decode(&encoded_filename)
        .map_err(|_| "图片文件名编码无效".to_string())?
        .into_owned();
    let mime = request_header(&request, "x-vellum-mime")?;
    let task_id = request_header(&request, "x-vellum-task-id").ok();
    upload_thumb_bytes(app, bytes, filename, mime, task_id).await
}

#[tauri::command]
pub async fn upload_remote_thumb(
    app: AppHandle,
    url: String,
    task_id: Option<String>,
) -> Result<String, String> {
    emit_upload_progress(&app, &task_id, "downloading", "远程封面", None, None);
    let image = download_remote_image(&url).await?;
    upload_thumb_bytes(app, image.bytes, image.filename, image.mime, task_id).await
}

async fn upload_thumb_bytes(
    app: AppHandle,
    bytes: Vec<u8>,
    filename: String,
    mime: String,
    task_id: Option<String>,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    if !ALLOWED_TYPES.contains(&mime.as_str()) {
        return Err("仅支持 jpg/png/gif 图片".into());
    }
    let name = if filename.is_empty() {
        "thumb".to_string()
    } else {
        filename
    };
    let original_size = bytes.len();
    let phase = if original_size > MAX_SIZE {
        "compressing"
    } else {
        "preparing"
    };
    emit_upload_progress(&app, &task_id, phase, &name, Some(original_size), None);
    let prepared = prepare_upload_async(bytes, name, mime).await?;
    emit_upload_progress(
        &app,
        &task_id,
        "uploading",
        &prepared.filename,
        Some(original_size),
        Some(prepared.bytes.len()),
    );
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match upload_thumb_inner(
        &token,
        prepared.bytes.clone(),
        &prepared.filename,
        &prepared.mime,
    )
    .await
    {
        Ok(id) => Ok(id),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                upload_thumb_inner(&token, prepared.bytes, &prepared.filename, &prepared.mime)
                    .await
                    .map_err(|(_, m)| m)
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
    author: &str,
    need_open_comment: u8,
    only_fans_can_comment: u8,
) -> Result<String, (Option<i64>, String)> {
    let body = build_add_draft_body(
        title,
        content,
        thumb_media_id,
        author,
        need_open_comment,
        only_fans_can_comment,
    );
    let url = format!("https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}");
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| (None, format!("发布请求失败：{}", e.without_url())))?;
    let data: DraftResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析发布响应失败：{}", e.without_url())))?;
    match data.media_id {
        Some(id) => Ok(id),
        None => Err((
            data.errcode,
            format_wechat_error(
                data.errcode,
                &data.errmsg.unwrap_or_else(|| "微信发布失败".into()),
                "微信发布失败",
            ),
        )),
    }
}

fn build_add_draft_body(
    title: &str,
    content: &str,
    thumb_media_id: &str,
    author: &str,
    need_open_comment: u8,
    only_fans_can_comment: u8,
) -> serde_json::Value {
    serde_json::json!({
        "articles": [{
            "title": title,
            "content": content,
            "thumb_media_id": thumb_media_id,
            "author": author,
            "digest": "",
            "content_source_url": "",
            "need_open_comment": normalize_comment_flag(need_open_comment),
            "only_fans_can_comment": normalize_comment_flag(only_fans_can_comment)
        }]
    })
}

fn normalize_comment_flag(value: u8) -> u8 {
    if value == 1 {
        1
    } else {
        0
    }
}

/// 发布到公众号草稿箱（draft/add）。
/// 返回草稿 media_id。未配置返回 "NOT_CONFIGURED"。
#[tauri::command]
pub async fn add_draft(
    app: AppHandle,
    title: String,
    content: String,
    thumb_media_id: String,
    author: String,
    need_open_comment: u8,
    only_fans_can_comment: u8,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match add_draft_inner(
        &token,
        &title,
        &content,
        &thumb_media_id,
        &author,
        need_open_comment,
        only_fans_can_comment,
    )
    .await
    {
        Ok(id) => Ok(id),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                add_draft_inner(
                    &token,
                    &title,
                    &content,
                    &thumb_media_id,
                    &author,
                    need_open_comment,
                    only_fans_can_comment,
                )
                .await
                .map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_add_draft_body, decode_for_reencoding, format_wechat_error, get_outbound_ip,
        extract_video_mp4_url, is_allowed_redirect_target, parse_delete_material_response,
        parse_material_page_response, parse_outbound_ip_response, parse_video_material_page_response,
        prepare_upload_for_limit, parse_voice_material_page_response, validate_remote_addresses,
        decrypt_wechat_emoji, OUTBOUND_IP_ENDPOINTS,
    };
    use aes::Aes128;
    use block_padding::Pkcs7;
    use cbc::cipher::{BlockEncryptMut, KeyIvInit};
    use cbc::Encryptor;
    use image::{DynamicImage, ImageFormat, Rgb, RgbImage, Rgba, RgbaImage};
    use std::io::Cursor;
    use std::net::SocketAddr;

    fn hex_key(key_hex: &str) -> [u8; 16] {
        let mut key = [0u8; 16];
        for (index, byte) in key.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&key_hex[index * 2..index * 2 + 2], 16).unwrap();
        }
        key
    }

    #[test]
    fn decrypts_wechat_normal_emoji_with_key_as_iv() {
        // 真实 normal 表情（wxapp.tc.qq.com）解密后的 GIF 文件头，密钥取自接口响应的 aes_key。
        let key_hex = "0cd0499ac22a9de26a653c89d019b24e";
        let header: [u8; 16] = [
            0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xF0, 0x00, 0xF0, 0x00, 0xF7, 0x00, 0x00, 0x00,
            0x00, 0x00,
        ];
        let key = hex_key(key_hex);
        let encryptor = Encryptor::<Aes128>::new_from_slices(&key, &key).unwrap();
        let cipher = encryptor.encrypt_padded_vec_mut::<Pkcs7>(&header);

        let plain = decrypt_wechat_emoji(&cipher, key_hex).unwrap();
        assert!(plain.starts_with(b"GIF89a"));
        assert_eq!(&plain[..16], &header[..]);
    }

    #[test]
    fn rejects_invalid_emoji_keys_and_lengths() {
        let ciphertext = vec![0u8; 32];
        assert!(decrypt_wechat_emoji(&ciphertext, "short").is_err());
        assert!(decrypt_wechat_emoji(&ciphertext, "zz0499ac22a9de26a653c89d019b24e").is_err());
        assert!(decrypt_wechat_emoji(&[0u8; 17], "0cd0499ac22a9de26a653c89d019b24e").is_err());
        // 用错误密钥解密不会恢复出真实 GIF 头（可能解密失败，也可能得到乱码）
        let other_key = "ffffffffffffffffffffffffffffffff";
        let plain = decrypt_wechat_emoji(&ciphertext, other_key).unwrap_or_default();
        assert!(!plain.starts_with(b"GIF89a"));
    }

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
        let actual = tauri::async_runtime::block_on(get_outbound_ip()).unwrap();

        assert_eq!(actual, expected);
    }
}
