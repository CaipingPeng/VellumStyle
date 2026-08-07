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

/// 打开素材上传页：复用后台窗口并跳转到官方上传页（大文件由微信官方页面上传），
/// 上传完成后前端回到素材库弹窗刷新列表即可取到新素材。
/// media_type 支持 "video"（视频）与 "voice"（音频）。
#[tauri::command]
pub async fn open_material_upload_page(
    app: AppHandle,
    media_type: String,
) -> Result<String, String> {
    let expression = material_upload_page_expr(&media_type)?;
    open_wechat_backend_impl(&app, true).await?;
    // 新建窗口首次加载需要时间：在 about:blank / 导航中间态执行脚本会读不到 cookie
    // （SecurityError），先等窗口 URL 落到微信域再注入。
    for _ in 0..30 {
        if backend_window_is_on_wechat(&app) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    // 页面就绪判定存在短暂竞态，脚本异常或明确返回"页面未就绪"时重试。
    for attempt in 0..4 {
        match eval_backend_expr(app.clone(), expression.clone(), "素材上传页").await {
            Ok(text) => {
                let retryable = serde_json::from_str::<serde_json::Value>(&text)
                    .map(|value| {
                        value
                            .get("source")
                            .and_then(|source| source.as_str())
                            .unwrap_or_default()
                            == "error"
                    })
                    .unwrap_or(false);
                if retryable {
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                    continue;
                }
                return Ok(text);
            }
            Err(err) => {
                if attempt < 3 && err.contains("后台页面脚本异常") {
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                    continue;
                }
                return Err(err);
            }
        }
    }
    Err("打开素材上传页失败：后台页面长时间未就绪".into())
}

/// 后台窗口是否已导航到微信公众平台域名（此时文档才可读 cookie）。
fn backend_window_is_on_wechat(app: &AppHandle) -> bool {
    app.get_webview_window(BACKEND_WINDOW_LABEL)
        .and_then(|window| window.url().ok())
        .map(|url| url.to_string())
        .is_some_and(|url| url.starts_with("https://mp.weixin.qq.com/"))
}

/// 素材上传页跳转脚本：token 优先从后台窗口当前 URL 提取，取不到时回退到 cookie
/// （精确 token 键 → 纯数字值兜底），返回目标地址 JSON 便于前端校验。
/// video → 视频上传编辑页；voice → 音频素材库页（官方在该页提供上传入口）。
fn material_upload_page_expr(media_type: &str) -> Result<String, String> {
    let path = match media_type {
        "video" => {
            "/cgi-bin/appmsg?t=media/videomsg_edit&action=video_edit&type=15&isNew=1&lang=zh_CN"
        }
        "voice" => "/cgi-bin/filepage?type=3&begin=0&count=20&lang=zh_CN",
        other => return Err(format!("不支持的素材类型：{other}")),
    };
    Ok(format!(
        r#"(function () {{
          function pickToken() {{
            try {{
              var value = "";
              try {{ value = new URL(location.href).searchParams.get("token") || ""; }} catch (e) {{}}
              if (value) return {{ value: value, source: "url" }};
              var parts = document.cookie.split(";");
              var numeric = "";
              for (var i = 0; i < parts.length; i++) {{
                var eq = parts[i].indexOf("=");
                if (eq < 0) continue;
                var key = parts[i].slice(0, eq).trim().toLowerCase();
                var raw = parts[i].slice(eq + 1).trim();
                var val = raw;
                try {{ val = decodeURIComponent(raw); }} catch (e) {{}}
                if (key === "token" && val) return {{ value: val, source: "cookie:token" }};
                if (!numeric && /^\d{{6,12}}$/.test(val)) numeric = val;
              }}
              if (numeric) return {{ value: numeric, source: "cookie:numeric" }};
              for (var i = 0; i < parts.length; i++) {{
                var eq = parts[i].indexOf("=");
                if (eq < 0) continue;
                var key = parts[i].slice(0, eq).trim().toLowerCase();
                var raw = parts[i].slice(eq + 1).trim();
                var val = raw;
                try {{ val = decodeURIComponent(raw); }} catch (e) {{}}
                if (key.indexOf("token") >= 0 && val) return {{ value: val, source: "cookie:" + key }};
              }}
              return {{ value: "", source: "none" }};
            }} catch (e) {{
              return {{ value: "", source: "error" }};
            }}
          }}
          var token = pickToken();
          var target = "{path}&token=" + encodeURIComponent(token.value);
          if (!token.value) {{
            if (token.source === "error") {{
              return JSON.stringify({{ vs_error: "后台页面尚未就绪，请稍后重试", target: target, source: token.source }});
            }}
            location.href = "/";
            return JSON.stringify({{ vs_error: "未获取到登录 token（URL 与 cookie 均无），请在内嵌后台窗口登录后重试", target: target, source: token.source }});
          }}
          try {{
            location.href = target;
            return JSON.stringify({{ vs_ok: true, target: target, source: token.source }});
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e), target: target, source: token.source }});
          }}
        }})()"#,
        path = path,
    ))
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

/// 在后台窗口上下文里搜索 QQ 音乐（finder_music?action=search，单曲 type=1）。
/// 返回原始 JSON 响应文本；窗口未打开时返回 "WECHAT_BACKEND_NOT_OPENED"。
#[tauri::command]
pub async fn search_music(app: AppHandle, key: String) -> Result<String, String> {
    eval_backend_expr(app, music_search_expr(&key), "音乐搜索").await
}

/// 获取单曲最终信息（finder_music?action=get_music_info），插入前调用。
/// 与官方流程一致：搜索结果只用于展示，插入前再拉一次确定信息。
#[tauri::command]
pub async fn get_music_info(
    app: AppHandle,
    id: String,
    music_type: u32,
    source: u32,
) -> Result<String, String> {
    eval_backend_expr(app, music_info_expr(&id, music_type, source), "音乐插入").await
}

fn music_search_expr(key: &str) -> String {
    let encoded_key = urlencoding::encode(key);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var url = "/cgi-bin/finder_music?action=search&key={key}&type=1&count=20&context_buf=" +
              "&token=" + encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            xhr.send();
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        key = encoded_key
    )
}

fn music_info_expr(id: &str, music_type: u32, source: u32) -> String {
    let encoded_id = urlencoding::encode(id);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var body = "token=" + encodeURIComponent(token) +
              "&lang=zh_CN&f=json&ajax=1&fingerprint=&random=" + Math.random() +
              "&count=1&type0={music_type}&source0={source}&id0={id}";
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "/cgi-bin/finder_music?action=get_music_info", false);
            xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            xhr.send(body);
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        music_type = music_type,
        source = source,
        id = encoded_id,
    )
}

/// 在后台窗口上下文里搜索视频号账号（videosnap?action=search）。
/// 返回原始 JSON 响应文本；窗口未打开时返回 "WECHAT_BACKEND_NOT_OPENED"。
#[tauri::command]
pub async fn search_video_account(
    app: AppHandle,
    key: String,
    buffer: String,
) -> Result<String, String> {
    eval_backend_expr(app, video_account_search_expr(&key, &buffer), "视频号搜索").await
}

/// 获取视频号账号的视频列表（videosnap?action=get_feed_list），插入前展示用。
#[tauri::command]
pub async fn get_video_feed_list(
    app: AppHandle,
    username: String,
    buffer: String,
) -> Result<String, String> {
    eval_backend_expr(app, video_feed_list_expr(&username, &buffer), "视频号内容").await
}

/// 获取选中视频的媒体信息（videosnap?action=get_media_list），插入前调用。
#[tauri::command]
pub async fn get_video_media_list(
    app: AppHandle,
    export_id: String,
) -> Result<String, String> {
    eval_backend_expr(app, video_media_list_expr(&export_id), "视频号插入").await
}

fn video_account_search_expr(key: &str, buffer: &str) -> String {
    let encoded_key = urlencoding::encode(key);
    let encoded_buffer = urlencoding::encode(buffer);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var url = "/cgi-bin/videosnap?action=search&scene=1&buffer={buffer}&query={key}&count=21" +
              "&token=" + encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            xhr.send();
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        key = encoded_key,
        buffer = encoded_buffer,
    )
}

fn video_feed_list_expr(username: &str, buffer: &str) -> String {
    let encoded_username = urlencoding::encode(username);
    let encoded_buffer = urlencoding::encode(buffer);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var url = "/cgi-bin/videosnap?action=get_feed_list&username={username}&buffer={buffer}&count=15&scene=0" +
              "&token=" + encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            xhr.send();
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        username = encoded_username,
        buffer = encoded_buffer,
    )
}

fn video_media_list_expr(export_id: &str) -> String {
    let encoded_export = urlencoding::encode(export_id);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var url = "/cgi-bin/videosnap?action=get_media_list&video_snap_num=1&exportid_0={export}" +
              "&token=" + encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            xhr.send();
            return xhr.responseText;
          }} catch (e) {{
            return JSON.stringify({{ vs_error: String(e) }});
          }}
        }})()"#,
        export = encoded_export,
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
        music_search_expr, music_info_expr, material_upload_page_expr, video_account_search_expr,
        video_feed_list_expr, video_media_list_expr,
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
    fn music_search_expr_encodes_key_and_targets_search_action() {
        let expr = music_search_expr("壁上观");
        assert!(expr.contains("action=search"));
        assert!(expr.contains("type=1"));
        assert!(expr.contains("key=%E5%A3%81%E4%B8%8A%E8%A7%82"));
        assert!(expr.contains("lang=zh_CN&f=json&ajax=1"));
    }

    #[test]
    fn music_info_expr_encodes_id_and_source_fields() {
        let expr = music_info_expr("78332210375265471", 1, 1);
        assert!(expr.contains("action=get_music_info"));
        assert!(expr.contains("count=1&type0=1&source0=1"));
        assert!(expr.contains("id0=78332210375265471"));
        assert!(expr.contains("random="));
    }

    #[test]
    fn video_account_search_expr_encodes_key_and_buffer() {
        let expr = video_account_search_expr("中国军号", "CBU=");
        assert!(expr.contains("action=search"));
        assert!(expr.contains("scene=1"));
        assert!(expr.contains("query=%E4%B8%AD%E5%9B%BD%E5%86%9B%E5%8F%B7"));
        assert!(expr.contains("buffer=CBU%3D"));
        assert!(expr.contains("count=21"));
    }

    #[test]
    fn video_feed_list_expr_encodes_username() {
        let expr = video_feed_list_expr("v2_xxx@finder", "");
        assert!(expr.contains("action=get_feed_list"));
        assert!(expr.contains("username=v2_xxx%40finder"));
        assert!(expr.contains("count=15&scene=0"));
    }

    #[test]
    fn video_media_list_expr_encodes_export_id() {
        let expr = video_media_list_expr("export/UzFfBgAAxP-gPEl3UXWTjMzT4DCLVAxPvGbNv0GI5lK9vJLNgA");
        assert!(expr.contains("action=get_media_list"));
        assert!(expr.contains("video_snap_num=1"));
        assert!(expr.contains("exportid_0=export%2FUzFfBgAAxP-gPEl3UXWTjMzT4DCLVAxPvGbNv0GI5lK9vJLNgA"));
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
    fn material_upload_page_expr_targets_video_edit_page() {
        let expr = material_upload_page_expr("video").unwrap();
        assert!(expr.contains("action=video_edit"));
        assert!(expr.contains("type=15&isNew=1"));
        assert!(expr.contains("location.href"));
        assert!(expr.contains("token"));
        assert!(expr.contains("document.cookie"));
    }

    #[test]
    fn material_upload_page_expr_targets_voice_library_page() {
        let expr = material_upload_page_expr("voice").unwrap();
        assert!(expr.contains("/cgi-bin/filepage?type=3&begin=0&count=20&lang=zh_CN"));
    }

    #[test]
    fn material_upload_page_expr_rejects_unknown_type() {
        assert!(material_upload_page_expr("image").is_err());
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
