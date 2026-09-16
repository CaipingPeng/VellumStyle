// 封面图上传与草稿箱发布（draft/add）。
// 由原 wechat.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

#[derive(Deserialize)]
pub(crate) struct DraftResp {
    pub(crate) media_id: Option<String>,
    pub(crate) errcode: Option<i64>,
    pub(crate) errmsg: Option<String>,
}

// 上传封面图，走 add_material(type=image)，取 media_id（区别于 upload_image 取 url）。
pub(crate) async fn upload_thumb_inner(
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

pub(crate) async fn upload_thumb_bytes(
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
pub(crate) async fn add_draft_inner(
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

pub(crate) fn build_add_draft_body(
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

pub(crate) fn normalize_comment_flag(value: u8) -> u8 {
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
