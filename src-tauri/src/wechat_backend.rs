// 微信公众平台后台静默同步：
// 软件内嵌一个后台窗口（用户扫码登录一次），登录态保存在 WebView 数据目录，
// 之后用 DevTools Protocol 在页面上下文里同步调用 filepage 素材接口拉取音频列表，
// 拿到官方 API 不提供的 voice_encode_fileid，供素材库批量绑定。
// 注意：这是模拟后台内部接口，微信改版可能导致失效。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const BACKEND_WINDOW_LABEL: &str = "wechat-backend";
const BACKEND_HOME: &str = "https://mp.weixin.qq.com/";

/// 音频素材列表拉取脚本（同步 XHR，返回接口响应文本）。
/// fingerprint 参数实测不校验，可以省略；token 从后台首页 URL 提取。
#[cfg(windows)]
const VOICE_LIST_EXPR: &str = r#"(function () {
  function diag(info) {
    return JSON.stringify(Object.assign({ vs_error: true }, info));
  }
  try {
    var url = location.href || "";
    var token = "";
    try {
      token = new URL(url).searchParams.get("token") || "";
    } catch (e) {
      return diag({ reason: "url_parse", url: url, message: String(e) });
    }
    var xhr = new XMLHttpRequest();
    xhr.open(
      "GET",
      "/cgi-bin/filepage?action=select&type=3&begin=0&count=50&query=&lang=zh_CN&f=json&ajax=1&token=" +
        encodeURIComponent(token),
      false
    );
    xhr.send();
    var text = xhr.responseText || "";
    if (xhr.status === 200 && text.charAt(0) === "{") {
      return text;
    }
    return diag({
      reason: "non_json",
      url: url,
      token: token,
      status: xhr.status,
      body: text.slice(0, 200)
    });
  } catch (e) {
    return diag({ reason: "exception", url: location.href || "", message: String(e) });
  }
})()"#;

/// 打开（或聚焦）微信后台登录窗口。已登录时窗口保留 cookie，再次打开无需登录。
#[tauri::command]
pub async fn open_wechat_backend(app: AppHandle) -> Result<(), String> {
    open_wechat_backend_impl(&app, true).await
}

/// 隐藏创建微信后台窗口（静默搜索场景：已有登录态时用户不应看到窗口闪动）。
#[tauri::command]
pub async fn open_wechat_backend_hidden(app: AppHandle) -> Result<(), String> {
    open_wechat_backend_impl(&app, false).await
}

/// 显示后台窗口（仅在需要用户扫码登录时调用）。
#[tauri::command]
pub async fn show_wechat_backend(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(BACKEND_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

async fn open_wechat_backend_impl(app: &AppHandle, visible: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(BACKEND_WINDOW_LABEL) {
        if visible {
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Ok(());
    }

    let url = WebviewUrl::External(
        BACKEND_HOME
            .parse()
            .map_err(|err| format!("微信后台地址无效：{err}"))?,
    );
    let mut builder = WebviewWindowBuilder::new(app, BACKEND_WINDOW_LABEL, url)
        .title("微信公众平台登录")
        .inner_size(960.0, 720.0);
    if !visible {
        builder = builder.visible(false);
    }
    builder
        .build()
        .map_err(|err| format!("打开微信后台窗口失败：{err}"))?;
    Ok(())
}

/// 返回后台窗口当前 URL（未打开时返回 null），用于前端判断登录状态。
#[tauri::command]
pub async fn backend_window_url(app: AppHandle) -> Result<Option<String>, String> {
    Ok(app
        .get_webview_window(BACKEND_WINDOW_LABEL)
        .and_then(|window| window.url().ok())
        .map(|url| url.to_string()))
}

/// 关闭后台窗口（同步完成后调用）。
#[tauri::command]
pub async fn close_wechat_backend(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(BACKEND_WINDOW_LABEL) {
        window
            .close()
            .map_err(|err| format!("关闭后台窗口失败：{err}"))?;
    }
    Ok(())
}

/// 在后台窗口页面上下文里静默拉取音频素材列表接口，返回原始 JSON 响应文本。
/// 窗口未打开时返回 "WECHAT_BACKEND_NOT_OPENED"；未登录时返回接口的错误 JSON。
#[tauri::command]
pub async fn fetch_backend_voice_list(app: AppHandle) -> Result<String, String> {
    #[cfg(windows)]
    {
        eval_in_backend_window(app, VOICE_LIST_EXPR.to_string()).await
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("微信后台同步目前仅支持 Windows".into())
    }
}

#[cfg(windows)]
async fn eval_in_backend_window(app: AppHandle, expression: String) -> Result<String, String> {
    use tokio::sync::oneshot;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::ICoreWebView2,
        CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR,
    };

    let window = app
        .get_webview_window(BACKEND_WINDOW_LABEL)
        .ok_or_else(|| "WECHAT_BACKEND_NOT_OPENED".to_string())?;

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let tx_for_closure = tx.clone();

    window
        .with_webview(move |platform_webview| {
            let result = (|| -> Result<(), String> {
                let webview: ICoreWebView2 = unsafe {
                    platform_webview
                        .controller()
                        .CoreWebView2()
                        .map_err(|err| format!("获取 WebView2 页面失败：{err}"))?
                };

                let tx = tx_for_closure.clone();
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |error_code, response_json| {
                        let result = match error_code {
                            Ok(()) => parse_evaluate_response(&response_json),
                            Err(err) => Err(format!("后台同步脚本执行失败：{err}")),
                        };
                        if let Ok(mut tx_guard) = tx.lock() {
                            if let Some(tx) = tx_guard.take() {
                                let _ = tx.send(result);
                            }
                        }
                        Ok(())
                    },
                ));
                let method = CoTaskMemPWSTR::from("Runtime.evaluate");
                let params = CoTaskMemPWSTR::from(
                    serde_json::json!({
                        "expression": expression,
                        "returnByValue": true,
                    })
                    .to_string()
                    .as_str(),
                );

                unsafe {
                    webview
                        .CallDevToolsProtocolMethod(
                            *method.as_ref().as_pcwstr(),
                            *params.as_ref().as_pcwstr(),
                            &handler,
                        )
                        .map_err(|err| format!("启动后台同步失败：{err}"))?;
                }

                Ok(())
            })();

            if let Err(err) = result {
                if let Ok(mut tx_guard) = tx.lock() {
                    if let Some(tx) = tx_guard.take() {
                        let _ = tx.send(Err(err));
                    }
                }
            }
        })
        .map_err(|err| format!("访问后台窗口 WebView 失败：{err}"))?;

    match tokio::time::timeout(std::time::Duration::from_secs(8), rx).await {
        Ok(result) => result.unwrap_or_else(|_| Err("后台同步任务意外中断".to_string())),
        Err(_) => Err("后台窗口无响应，请确认页面已加载后重试".into()),
    }
}

/// 在后台窗口上下文里搜索微信表情（operateremoticon?action=search_all）。
/// 返回原始 JSON 响应文本；窗口未打开时返回 "WECHAT_BACKEND_NOT_OPENED"。
#[tauri::command]
pub async fn search_remoticon(
    app: AppHandle,
    query: String,
    size: u32,
    offset: u32,
) -> Result<String, String> {
    #[cfg(windows)]
    {
        let expression = remoticon_search_expr(&query, size.clamp(1, 60), offset);
        eval_in_backend_window(app, expression).await
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("表情搜索目前仅支持 Windows".into())
    }
}

#[cfg(windows)]
fn remoticon_search_expr(query: &str, size: u32, offset: u32) -> String {
    let encoded_query = urlencoding::encode(query);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var body =
              "size={size}&offset={offset}&query={query}&firstFlush=1&fingerprint=&token=" +
              encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "/cgi-bin/operateremoticon?action=search_all", false);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            xhr.send(body);
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        size = size,
        offset = offset,
        query = encoded_query,
    )
}

/// 在后台窗口上下文里把微信表情 CDN 链接转换为 mmbiz 永久链接（官方插入流程：
/// 点击表情后调用 operateremoticon?action=get_cdn_url，返回可直接使用的 cdn_url）。
/// gen 表情 emoticonType=1 且 aesKey 为空；normal 表情 emoticonType=0 且带 aesKey。
#[tauri::command]
pub async fn get_emoji_cdn_url(
    app: AppHandle,
    url: String,
    thumb_url: String,
    aes_key: Option<String>,
    emoticon_type: u32,
) -> Result<String, String> {
    #[cfg(windows)]
    {
        let expression = remoticon_cdn_url_expr(
            &url,
            &thumb_url,
            aes_key.as_deref(),
            emoticon_type.clamp(0, 1),
        );
        eval_in_backend_window(app, expression).await
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("表情转换目前仅支持 Windows".into())
    }
}

// Linux 下仅测试引用，避免 dead_code 警告。
#[cfg_attr(not(windows), allow(dead_code))]
fn remoticon_cdn_url_expr(
    url: &str,
    thumb_url: &str,
    aes_key: Option<&str>,
    emoticon_type: u32,
) -> String {
    let enc_url = urlencoding::encode(url);
    let enc_thumb = urlencoding::encode(thumb_url);
    let enc_aes = urlencoding::encode(aes_key.unwrap_or(""));
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var fp = "";
            try {{ fp = window.fingerprint || ""; }} catch (e) {{}}
            var body =
              "action=get_cdn_url&url={url}&thumb_url={thumb}&emoticonType={etype}&aesKey={aes}&fingerprint=" +
              encodeURIComponent(fp) + "&token=" + encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "/cgi-bin/operateremoticon?action=get_cdn_url", false);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            xhr.send(body);
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        url = enc_url,
        thumb = enc_thumb,
        etype = emoticon_type,
        aes = enc_aes,
    )
}

/// 在后台窗口上下文执行注入脚本（Windows），非 Windows 返回平台不支持提示。
async fn eval_backend_expr(app: AppHandle, expression: String, unsupported_hint: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        let _ = unsupported_hint;
        eval_in_backend_window(app, expression).await
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        let _ = expression;
        Err(format!("{unsupported_hint}目前仅支持 Windows"))
    }
}

/// 获取手机传图二维码：返回 get_wxa_qrcode 原始 JSON（qrcode_uuid + qrcode_tmp_url）。
#[tauri::command]
pub async fn get_phone_upload_qrcode(app: AppHandle) -> Result<String, String> {
    eval_backend_expr(app, phone_upload_qrcode_expr(), "手机传图").await
}

/// 轮询手机扫码上传结果：返回 get_upload_pic_info_list 原始 JSON（upload_pic_info_list）。
#[tauri::command]
pub async fn get_phone_upload_pic_list(app: AppHandle, qrcode_uuid: String) -> Result<String, String> {
    eval_backend_expr(
        app,
        phone_upload_pic_list_expr(&qrcode_uuid),
        "手机传图",
    )
    .await
}

/// 确认保存手机上传的图片：返回 confirm_save 原始 JSON（fileid + cdn_url）。
/// data 为前端组装的完整 JSON 字符串（qrcode_uuid + pic_info_list + seq + svr_time）。
#[tauri::command]
pub async fn confirm_phone_upload_pic(app: AppHandle, data: String) -> Result<String, String> {
    eval_backend_expr(app, phone_upload_confirm_expr(&data), "手机传图").await
}

fn phone_upload_qrcode_expr() -> String {
    r#"(function () {
      try {
        var token = new URL(location.href).searchParams.get("token") || "";
        var fp = "";
        try { fp = window.fingerprint || ""; } catch (e) {}
        var url =
          "/cgi-bin/phoneuploadpic?action=get_wxa_qrcode&count=20&fingerprint=" +
          encodeURIComponent(fp) + "&token=" + encodeURIComponent(token) +
          "&lang=zh_CN&f=json&ajax=1";
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.send();
        return xhr.responseText;
      } catch (e) {
        return JSON.stringify({ vs_error: String(e) });
      }
    })()"#
        .to_string()
}

fn phone_upload_pic_list_expr(qrcode_uuid: &str) -> String {
    let enc_uuid = urlencoding::encode(qrcode_uuid);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var fp = "";
            try {{ fp = window.fingerprint || ""; }} catch (e) {{}}
            var url =
              "/cgi-bin/phoneuploadpic?action=get_upload_pic_info_list&qrcode_uuid={uuid}&fingerprint=" +
              encodeURIComponent(fp) + "&token=" + encodeURIComponent(token) +
              "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.send();
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        uuid = enc_uuid,
    )
}

fn phone_upload_confirm_expr(data: &str) -> String {
    let enc_data = urlencoding::encode(data);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var fp = "";
            try {{ fp = window.fingerprint || ""; }} catch (e) {{}}
            var body =
              "data={data}&fingerprint=" + encodeURIComponent(fp) + "&token=" +
              encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "/cgi-bin/phoneuploadpic?action=confirm_save", false);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            xhr.send(body);
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        data = enc_data,
    )
}

/// AI 配图：GET 类接口（get_session / get_style / related_search / get_ai_pic）。
/// params 为已编码的追加查询参数（以 & 开头）。token 从后台首页 URL 提取。
fn ai_image_get_expr(action: &str, params: &str) -> String {
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
        action = action,
        params = params,
    )
}

/// AI 配图：POST 类接口（start_ai_creation / insert_ai_pic）。
/// data 为前端组装的完整 JSON 字符串，作为 urlencoded 的 data 字段提交。
fn ai_image_post_expr(action: &str, data_json: &str) -> String {
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

// 后台脚本执行结果的统一解析；Linux 下仅测试引用，避免 dead_code 警告。
#[cfg_attr(not(windows), allow(dead_code))]
fn parse_evaluate_response(response_json: &str) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(response_json)
        .map_err(|err| format!("解析后台同步响应失败：{err}"))?;
    if let Some(exception) = value
        .get("exceptionDetails")
        .or_else(|| value.get("result").and_then(|result| result.get("exceptionDetails")))
    {
        return Err(format!("后台页面脚本异常：{exception}"));
    }
    match value
        .get("result")
        .and_then(|result| result.get("value"))
    {
        Some(serde_json::Value::String(text)) => Ok(text.clone()),
        Some(other) => Ok(other.to_string()),
        None => {
            let snippet = response_json.chars().take(300).collect::<String>();
            Err(format!("后台同步未返回数据，原始响应：{snippet}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ai_image_get_expr, ai_image_post_expr, parse_evaluate_response, phone_upload_confirm_expr,
        phone_upload_pic_list_expr, phone_upload_qrcode_expr, remoticon_cdn_url_expr,
    };

    #[test]
    fn evaluate_response_extracts_string_value() {
        let response = r#"{"id":1,"result":{"type":"string","value":"{\"file_item\":[]}"}}"#;
        assert_eq!(
            parse_evaluate_response(response).unwrap(),
            r#"{"file_item":[]}"#
        );
    }

    #[test]
    fn evaluate_response_reports_script_exception() {
        let response = r#"{"id":1,"result":{"exceptionDetails":{"text":"Uncaught"}}}"#;
        let error = parse_evaluate_response(response).unwrap_err();
        assert!(error.contains("脚本异常"));
        assert!(error.contains("Uncaught"));
    }

    #[test]
    fn evaluate_response_reports_missing_value_with_snippet() {
        let response = r#"{"id":1,"result":{"type":"undefined"}}"#;
        let error = parse_evaluate_response(response).unwrap_err();
        assert!(error.contains("后台同步未返回数据"));
        assert!(error.contains("undefined"));
    }

    #[test]
    fn cdn_url_expr_encodes_emoji_params() {
        // normal 表情：emoticonType=0 + aesKey
        let expr = remoticon_cdn_url_expr(
            "http://search.c2c.weixin.qq.com/download?a=1&b=2",
            "http://thumb.cdn/x",
            Some("0cd0499ac22a9de26a653c89d019b24e"),
            0,
        );
        assert!(expr.contains("action=get_cdn_url"));
        assert!(expr.contains("url=http%3A%2F%2Fsearch.c2c.weixin.qq.com%2Fdownload%3Fa%3D1%26b%3D2"));
        assert!(expr.contains("thumb_url=http%3A%2F%2Fthumb.cdn%2Fx"));
        assert!(expr.contains("emoticonType=0"));
        assert!(expr.contains("aesKey=0cd0499ac22a9de26a653c89d019b24e"));

        // gen 表情：emoticonType=1 + aesKey 为空
        let gen_expr = remoticon_cdn_url_expr(
            "http://search.c2c.weixin.qq.com/download?a=1&b=2",
            "http://thumb.cdn/x",
            None,
            1,
        );
        assert!(gen_expr.contains("emoticonType=1"));
        assert!(gen_expr.contains("aesKey="));
    }

    #[test]
    fn phone_upload_qrcode_expr_requests_wxa_qrcode() {
        let expr = phone_upload_qrcode_expr();
        assert!(expr.contains("action=get_wxa_qrcode"));
        assert!(expr.contains("count=20"));
        assert!(expr.contains("lang=zh_CN&f=json&ajax=1"));
    }

    #[test]
    fn phone_upload_pic_list_expr_encodes_uuid() {
        let expr = phone_upload_pic_list_expr("aeaf4a5f9fad864e9f9a45625320301b");
        assert!(expr.contains("action=get_upload_pic_info_list"));
        assert!(expr.contains("qrcode_uuid=aeaf4a5f9fad864e9f9a45625320301b"));
    }

    #[test]
    fn phone_upload_confirm_expr_encodes_data() {
        let data = r#"{"qrcode_uuid":"u1","pic_info_list":[],"seq":123,"svr_time":"456"}"#;
        let expr = phone_upload_confirm_expr(data);
        assert!(expr.contains("action=confirm_save"));
        assert!(expr.contains("data=%7B%22qrcode_uuid%22%3A%22u1%22"));
    }

    #[test]
    fn ai_image_get_expr_builds_action_and_params() {
        let expr = ai_image_get_expr(
            "get_style",
            "&session_id=43429653065318400%230",
        );
        assert!(expr.contains("/cgi-bin/mpaigenpicv2?action=get_style"));
        assert!(expr.contains("&session_id=43429653065318400%230"));
        assert!(expr.contains("&lang=zh_CN&f=json&ajax=1"));
        assert!(expr.contains("Math.random()"));
    }

    #[test]
    fn ai_image_get_expr_encodes_chinese_query() {
        let expr = ai_image_get_expr(
            "related_search",
            "&session_id=s%230&prompt=%E4%B8%80%E6%9C%B5%E4%BA%91&ratio=2.35%3A1&limit=10&offset=0",
        );
        assert!(expr.contains("action=related_search"));
        assert!(expr.contains("prompt=%E4%B8%80%E6%9C%B5%E4%BA%91"));
        assert!(expr.contains("ratio=2.35%3A1"));
    }

    #[test]
    fn ai_image_post_expr_encodes_data_json() {
        let data = r#"{"session_id":"s#0","prompt":"一朵云","scale":"1024x436","gen_type":5,"style":"宫崎骏风格"}"#;
        let expr = ai_image_post_expr("start_ai_creation", data);
        assert!(expr.contains("?action=start_ai_creation"));
        assert!(expr.contains("data=%7B%22session_id%22%3A%22s%230%22"));
        assert!(expr.contains("Content-Type"));
        assert!(expr.contains("xhr.open(\"POST\""));
    }
}
