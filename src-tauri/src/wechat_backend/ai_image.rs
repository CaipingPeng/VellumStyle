// AI 配图：会话、风格、参考图、生成与插入。
// 由原 wechat_backend.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

/// AI 配图：GET 类接口（get_session / get_style / related_search / get_ai_pic）。
/// params 为调用方已 urlencoding 的追加查询参数（以 & 开头，含用户输入时必须编码，
/// 否则可逃逸 JS 字符串字面量）。token 从后台首页 URL 提取。
pub(crate) fn ai_image_get_expr(action: &str, params: &str) -> String {
    // action 目前全为硬编码常量，仍与其余 builder 一致做 urlencoding，防未来引入用户输入。
    let enc_action = urlencoding::encode(action);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var url =
              "/cgi-bin/mpaigenpicv2?action={action}&token=" + encodeURIComponent(token) +
              "&lang=zh_CN&f=json&ajax=1&random=" + Math.random() + "{params}";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.send();
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        action = enc_action,
        params = params,
    )
}

/// AI 配图：POST 类接口（start_ai_creation / insert_ai_pic）。
/// data 为前端组装的完整 JSON 字符串，作为 urlencoded 的 data 字段提交。
pub(crate) fn ai_image_post_expr(action: &str, data_json: &str) -> String {
    let enc_data = urlencoding::encode(data_json);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var body =
              "data={data}&token=" + encodeURIComponent(token) +
              "&lang=zh_CN&f=json&ajax=1&random=" + Math.random();
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "/cgi-bin/mpaigenpicv2?action={action}", false);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            xhr.send(body);
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        action = action,
        data = enc_data,
    )
}

/// 创建 AI 配图会话：返回 get_session 原始 JSON（session_id）。
#[tauri::command]
pub async fn ai_image_get_session(app: AppHandle) -> Result<String, String> {
    eval_backend_expr(app, ai_image_get_expr("get_session", ""), "AI配图").await
}

/// 获取 AI 配图比例与风格选项：返回 get_style 原始 JSON（scale_info + style_info）。
#[tauri::command]
pub async fn ai_image_get_style(app: AppHandle, session_id: String) -> Result<String, String> {
    let params = format!("&session_id={}", urlencoding::encode(&session_id));
    eval_backend_expr(app, ai_image_get_expr("get_style", &params), "AI配图").await
}

/// 获取 AI 配图示例提示词：返回 get_example 原始 JSON（example[]）。
#[tauri::command]
pub async fn ai_image_get_example(app: AppHandle, session_id: String) -> Result<String, String> {
    let params = format!("&session_id={}", urlencoding::encode(&session_id));
    eval_backend_expr(app, ai_image_get_expr("get_example", &params), "AI配图").await
}

/// 获取 AI 配图历史会话：返回 get_biz_recent_img_list 原始 JSON
/// （session_list.session_info[]，含 session_id 与已生成图片）。
#[tauri::command]
pub async fn ai_image_get_biz_recent_img_list(
    app: AppHandle,
    limit: u32,
) -> Result<String, String> {
    let params = format!("&limit={}", limit.clamp(1, 50));
    eval_backend_expr(app, ai_image_get_expr("get_biz_recent_img_list", &params), "AI配图").await
}

/// 相关图搜索：返回 related_search 原始 JSON（list.image[] 带 search_url）。
#[tauri::command]
pub async fn ai_image_related_search(
    app: AppHandle,
    session_id: String,
    prompt: String,
    ratio: String,
    limit: u32,
    offset: u32,
) -> Result<String, String> {
    let params = format!(
        "&session_id={}&prompt={}&ratio={}&limit={}&offset={}",
        urlencoding::encode(&session_id),
        urlencoding::encode(&prompt),
        urlencoding::encode(&ratio),
        limit.clamp(1, 60),
        offset,
    );
    eval_backend_expr(app, ai_image_get_expr("related_search", &params), "AI配图").await
}

/// 把相关图注册到当前会话，返回 append_related_search 原始 JSON（id）。
/// data 形如 {"session_id":"...","task_id":"...","img_url":"https://..."}。
#[tauri::command]
pub async fn ai_image_append_related_search(
    app: AppHandle,
    data: String,
) -> Result<String, String> {
    eval_backend_expr(app, ai_image_post_expr("append_related_search", &data), "AI配图").await
}

/// 提交 AI 生成任务：返回 start_ai_creation 原始 JSON（task_id + is_sensitive_prompt）。
/// data 形如 {"session_id":"...","prompt":"...","scale":"1024x436","gen_type":5,"style":"宫崎骏风格"}。
#[tauri::command]
pub async fn ai_image_start_creation(app: AppHandle, data: String) -> Result<String, String> {
    eval_backend_expr(app, ai_image_post_expr("start_ai_creation", &data), "AI配图").await
}

/// 轮询 AI 生成结果：返回 get_ai_pic 原始 JSON（ai_image_info_list.list[].image[]）。
#[tauri::command]
pub async fn ai_image_get_pic(
    app: AppHandle,
    task_id: String,
    session_id: String,
) -> Result<String, String> {
    let params = format!(
        "&task_id={}&session_id={}",
        urlencoding::encode(&task_id),
        urlencoding::encode(&session_id),
    );
    eval_backend_expr(app, ai_image_get_expr("get_ai_pic", &params), "AI配图").await
}

/// 把 AI 生成图转换为永久素材：返回 insert_ai_pic 原始 JSON（fileid + cdn_url）。
/// data 形如 {"pic_id":"...","task_id":"...","session_id":"..."}。
#[tauri::command]
pub async fn ai_image_insert_pic(app: AppHandle, data: String) -> Result<String, String> {
    eval_backend_expr(app, ai_image_post_expr("insert_ai_pic", &data), "AI配图").await
}
