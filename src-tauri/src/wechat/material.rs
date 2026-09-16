// 永久素材列表 / 删除，以及视频播放地址解析。
// 由原 wechat.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

pub(crate) fn parse_material_page_response(body: &str) -> Result<MaterialImagePage, (Option<i64>, String)> {
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

pub(crate) fn parse_video_material_page_response(
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

pub(crate) fn parse_voice_material_page_response(
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
pub(crate) async fn fetch_material_page_text(
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

pub(crate) async fn list_image_materials_inner(
    token: &str,
    offset: u32,
    count: u32,
) -> Result<MaterialImagePage, (Option<i64>, String)> {
    let body = fetch_material_page_text(token, "image", offset, count).await?;
    parse_material_page_response(&body)
}

pub(crate) async fn list_video_materials_inner(
    token: &str,
    offset: u32,
    count: u32,
) -> Result<MaterialVideoPage, (Option<i64>, String)> {
    let body = fetch_material_page_text(token, "video", offset, count).await?;
    parse_video_material_page_response(&body)
}

pub(crate) async fn list_voice_materials_inner(
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
    let url =
        format!("https://api.weixin.qq.com/cgi-bin/material/get_material?access_token={token}");
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
pub(crate) fn extract_video_mp4_url(html: &str) -> Option<String> {
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
pub(crate) fn parse_delete_material_response(body: &str) -> Result<(), (Option<i64>, String)> {
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

pub(crate) async fn delete_image_material_inner(
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
