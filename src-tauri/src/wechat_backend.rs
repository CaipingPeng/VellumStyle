// 微信公众平台后台静默同步：
// 软件内嵌一个后台窗口（用户扫码登录一次），登录态保存在 WebView 数据目录，
// 之后用 DevTools Protocol 在页面上下文里同步调用 filepage 素材接口拉取音频列表，
// 拿到官方 API 不提供的 voice_encode_fileid，供素材库批量绑定。
// 注意：这是模拟后台内部接口，微信改版可能导致失效。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2CookieList;

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

/// 最近一次向服务器换取的新鲜 token 缓存（避免每次点上传都发一次会话请求）。
const UPLOAD_TOKEN_TTL: std::time::Duration = std::time::Duration::from_secs(10 * 60);
static UPLOAD_TOKEN_CACHE: std::sync::Mutex<Option<(String, std::time::Instant)>> =
    std::sync::Mutex::new(None);

/// 命中缓存且未过期时返回 token，否则返回 None。
#[cfg_attr(not(windows), allow(dead_code))]
fn cached_upload_token() -> Option<String> {
    let guard = UPLOAD_TOKEN_CACHE.lock().ok()?;
    let (token, at) = guard.as_ref()?;
    if at.elapsed() <= UPLOAD_TOKEN_TTL {
        Some(token.clone())
    } else {
        None
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn cache_upload_token(token: String) {
    if let Ok(mut guard) = UPLOAD_TOKEN_CACHE.lock() {
        *guard = Some((token, std::time::Instant::now()));
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn clear_upload_token_cache() {
    if let Ok(mut guard) = UPLOAD_TOKEN_CACHE.lock() {
        *guard = None;
    }
}

/// 打开素材上传页：复用后台窗口并跳转到官方上传页（大文件由微信官方页面上传），
/// 上传完成后前端回到素材库弹窗刷新列表即可取到新素材。
/// media_type 支持 "video"（视频）与 "voice"（音频）。
///
/// 快路径（Windows）：从 WebView2 CookieManager 读整套真实会话 cookie（含 HttpOnly），
/// 用它们向服务器换取一个新鲜 token 再直接导航目标页——不依赖隐藏窗口先把主页加载完，
/// 也不使用 cookie 仓库里同名 token 值当参数（微信不认可，之前实测必弹登录）。
/// 未登录或换 token 失败时回退到页面注入流程（显示窗口引导扫码）。
#[tauri::command]
pub async fn open_material_upload_page(
    app: AppHandle,
    media_type: String,
) -> Result<String, String> {
    #[cfg(windows)]
    {
        let token = match cached_upload_token() {
            Some(token) => Some(token),
            None => match fetch_wechat_session_token(&app).await {
                Ok(Some(token)) => {
                    cache_upload_token(token.clone());
                    Some(token)
                }
                Ok(None) => None,
                Err(_) => None,
            },
        };
        if let Some(token) = token {
            let path = material_upload_path(&media_type)?;
            open_wechat_backend_impl(&app, false).await?;
            return match navigate_with_token(&app, &path, &media_type, &token).await {
                Ok(text) => Ok(text),
                Err(err) => {
                    // token 失效时清掉缓存，下次点击重新换取。
                    clear_upload_token_cache();
                    Err(err)
                }
            };
        }
    }
    // 兜底：页面注入流程（未登录或 cookie 读取失败时显示窗口引导扫码）。
    open_wechat_backend_impl(&app, false).await?;
    page_based_upload_flow(app, &media_type).await
}

/// 用已知 token 直接跳转上传页：navigate 不依赖页面上下文，窗口刚创建
/// （about:blank）时也能跳；随后立即显示窗口，让目标页直接开始加载。
#[cfg_attr(not(windows), allow(dead_code))]
async fn navigate_with_token(
    app: &AppHandle,
    path: &str,
    media_type: &str,
    token: &str,
) -> Result<String, String> {
    let target = material_upload_target(path, token)?;
    let url = url::Url::parse(&target).map_err(|err| format!("上传页地址无效：{err}"))?;
    app.get_webview_window(BACKEND_WINDOW_LABEL)
        .ok_or_else(|| "WECHAT_BACKEND_NOT_OPENED".to_string())?
        .navigate(url)
        .map_err(|err| format!("跳转上传页失败：{err}"))?;
    show_wechat_backend(app.clone()).await?;
    if !wait_backend_url_contains(app, material_url_marker(media_type)).await {
        return Err("跳转后未到达上传页，会话可能已过期，请在打开的窗口内重新登录".into());
    }
    Ok(serde_json::json!({"vs_ok": true, "target": target, "source": "session"}).to_string())
}

/// 拼出上传页完整地址（绝对 URL，避免在 about:blank 上设置相对 href 被 Chromium 拒绝）。
#[cfg_attr(not(windows), allow(dead_code))]
fn material_upload_target(path: &str, token: &str) -> Result<String, String> {
    let target = format!(
        "https://mp.weixin.qq.com{path}&token={}",
        urlencoding::encode(token)
    );
    url::Url::parse(&target)
        .map(|_| target)
        .map_err(|err| format!("上传页地址无效：{err}"))
}

/// 用 WebView2 真实会话 cookie 向服务器换取当前会话的新鲜 token：
/// 先请求后台首页（登录态会 302 到带 token 的地址，或 HTML 内嵌 token），
/// 两个来源都解析不出数字 token 视为未登录。
#[cfg(windows)]
async fn fetch_wechat_session_token(app: &AppHandle) -> Result<Option<String>, String> {
    let Some(cookie_header) = read_wechat_session_cookies(app).await? else {
        return Ok(None);
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|err| format!("创建会话请求客户端失败：{err}"))?;

    // 后台首页：已登录会带 token 落地，未登录会跳到登录页。
    let resp = client
        .get("https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN")
        .header(reqwest::header::COOKIE, &cookie_header)
        .send()
        .await
        .map_err(|err| format!("获取微信后台会话失败：{err}"))?;
    if let Some(token) = extract_token_from_url(resp.url().as_str()) {
        return Ok(Some(token));
    }
    let html = resp
        .text()
        .await
        .map_err(|err| format!("读取微信后台响应失败：{err}"))?;
    if let Some(token) = extract_token_from_html(&html) {
        return Ok(Some(token));
    }

    // 兜底：裸主页 HTML 里通常也内嵌当前会话 token（SPA 用它拼所有 /cgi-bin 地址）。
    let resp = client
        .get("https://mp.weixin.qq.com/")
        .header(reqwest::header::COOKIE, &cookie_header)
        .send()
        .await
        .map_err(|err| format!("获取微信主页会话失败：{err}"))?;
    if let Some(token) = extract_token_from_url(resp.url().as_str()) {
        return Ok(Some(token));
    }
    let html = resp
        .text()
        .await
        .map_err(|err| format!("读取微信主页失败：{err}"))?;
    Ok(extract_token_from_html(&html))
}

/// 从 URL 查询参数里取 token（必须是 6-12 位纯数字，避免把空串或其它参数当 token）。
#[cfg_attr(not(windows), allow(dead_code))]
fn extract_token_from_url(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    parsed
        .query_pairs()
        .find(|(key, _)| key == "token")
        .map(|(_, value)| value.into_owned())
        .filter(|value| is_token_like(value))
}

/// 从 HTML 里提取内嵌 token：优先 token=xxx / token: "xxx" 形态，
/// 其次主页 SPA 的 t 字段（t: "xxx" || ""）。
#[cfg_attr(not(windows), allow(dead_code))]
fn extract_token_from_html(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut pos = 0usize;
    while let Some(rel) = lower[pos..].find("token") {
        let start = pos + rel;
        if let Some(token) = token_from_rest(&lower[start + 5..]) {
            return Some(token);
        }
        pos = start + 5;
    }
    // 主页 SPA：t: "123456789" || ""（未登录时是 t: "" || ""）
    let mut pos = 0usize;
    while let Some(rel) = lower[pos..].find("t: \"") {
        let start = pos + rel;
        let rest = &lower[start + 4..];
        let digits: String = rest
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if is_token_like(&digits) {
            let after = rest[digits.len()..].trim_start();
            let after = after.strip_prefix('"').unwrap_or(after).trim_start();
            if after.starts_with("||") {
                return Some(digits);
            }
        }
        pos = start + 4;
    }
    None
}

/// rest 指向 "token" 之后的文本，允许 `= / : / 引号 / & / ?` 等分隔后跟数字。
#[cfg_attr(not(windows), allow(dead_code))]
fn token_from_rest(rest: &str) -> Option<String> {
    let mut s = rest;
    while let Some(c) = s.chars().next() {
        if c.is_whitespace() || matches!(c, '=' | ':' | '"' | '\'' | '&' | '?') {
            s = &s[1..];
            continue;
        }
        break;
    }
    let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
    if is_token_like(&digits) {
        Some(digits)
    } else {
        None
    }
}

/// 微信后台 token 是 6-12 位纯数字（与页面内兜底规则一致）。
#[cfg_attr(not(windows), allow(dead_code))]
fn is_token_like(value: &str) -> bool {
    (6..=12).contains(&value.len()) && value.chars().all(|c| c.is_ascii_digit())
}

/// 从 WebView2 CookieManager 读取 mp.weixin.qq.com 的真实会话 cookie 头
/// （含 HttpOnly；主窗口与后台窗口共享同一份 cookie 仓库）。
/// 没有会话 cookie（未登录）时返回 Ok(None)。
#[cfg(windows)]
async fn read_wechat_session_cookies(app: &AppHandle) -> Result<Option<String>, String> {
    use tokio::sync::oneshot;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_2},
        CoTaskMemPWSTR, GetCookiesCompletedHandler,
    };
    use windows::core::Interface;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    let (tx, rx) = oneshot::channel::<Result<Option<String>, String>>();
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
                let cookie_manager = unsafe {
                    webview
                        .cast::<ICoreWebView2_2>()
                        .map_err(|err| format!("获取 WebView2 CookieManager 失败：{err}"))?
                        .CookieManager()
                        .map_err(|err| format!("获取 WebView2 CookieManager 失败：{err}"))?
                };

                let tx = tx_for_closure.clone();
                let handler = GetCookiesCompletedHandler::create(Box::new(move |result, list| {
                    let outcome = match result {
                        Ok(()) => collect_session_cookie_header(list),
                        Err(err) => Err(format!("读取微信会话 cookie 失败：{err}")),
                    };
                    if let Ok(mut tx_guard) = tx.lock() {
                        if let Some(tx) = tx_guard.take() {
                            let _ = tx.send(outcome);
                        }
                    }
                    Ok(())
                }));
                // 用深层路径查询，避免漏掉 Path=/cgi-bin 这类路径作用域的会话 cookie。
                let uri =
                    CoTaskMemPWSTR::from("https://mp.weixin.qq.com/cgi-bin/appmsg");
                unsafe {
                    cookie_manager
                        .GetCookies(*uri.as_ref().as_pcwstr(), &handler)
                        .map_err(|err| format!("启动 cookie 读取失败：{err}"))?;
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
        .map_err(|err| format!("访问主窗口 WebView 失败：{err}"))?;

    match tokio::time::timeout(std::time::Duration::from_secs(8), rx).await {
        Ok(result) => result.unwrap_or_else(|_| Err("后台 cookie 读取任务意外中断".to_string())),
        Err(_) => Err("后台窗口无响应，请确认页面已加载后重试".into()),
    }
}

/// 把 WebView2 的 cookie 列表拼成 Cookie 头；包含 HttpOnly 的会话 cookie。
/// 没有任何会话关键 cookie（slave_sid / data_bizuin / token）时视为未登录。
#[cfg(windows)]
fn collect_session_cookie_header(
    cookie_list: Option<ICoreWebView2CookieList>,
) -> Result<Option<String>, String> {
    let Some(list) = cookie_list else {
        return Ok(None);
    };
    let mut count = 0u32;
    unsafe {
        list.Count(&mut count)
            .map_err(|err| format!("读取 cookie 数量失败：{err}"))?;
    }
    let mut parts: Vec<String> = Vec::new();
    let mut has_session = false;
    for index in 0..count {
        let cookie = unsafe {
            list.GetValueAtIndex(index)
                .map_err(|err| format!("读取第 {index} 个 cookie 失败：{err}"))?
        };
        let mut name_ptr = windows::core::PWSTR::null();
        unsafe {
            cookie
                .Name(&mut name_ptr)
                .map_err(|err| format!("读取 cookie 名称失败：{err}"))?;
        }
        let name = webview2_com::take_pwstr(name_ptr);
        let mut value_ptr = windows::core::PWSTR::null();
        unsafe {
            cookie
                .Value(&mut value_ptr)
                .map_err(|err| format!("读取 cookie 值失败：{err}"))?;
        }
        let value = webview2_com::take_pwstr(value_ptr);
        if name.is_empty() || value.is_empty() {
            continue;
        }
        if matches!(name.as_str(), "slave_sid" | "data_bizuin" | "token") {
            has_session = true;
        }
        parts.push(format!("{name}={value}"));
    }
    if !has_session || parts.is_empty() {
        return Ok(None);
    }
    Ok(Some(parts.join("; ")))
}

/// 页面注入流程：窗口加载到微信域后，用页面上下文提取 token（URL → 页面 cookie），
/// 未登录时返回可读错误并显示窗口引导扫码。
async fn page_based_upload_flow(app: AppHandle, media_type: &str) -> Result<String, String> {
    let expression = material_upload_page_expr(media_type)?;
    // 新建窗口首次加载需要时间：在 about:blank / 导航中间态执行脚本会读不到 cookie
    // （SecurityError），先等窗口 URL 落到微信域再注入。
    for _ in 0..30 {
        if backend_window_is_on_wechat(&app) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    // 页面就绪判定存在短暂竞态，脚本异常或明确返回"页面未就绪"时重试。
    let mut output: Result<String, String> =
        Err("打开素材上传页失败：后台页面长时间未就绪".into());
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
                output = Ok(text);
                break;
            }
            Err(err) => {
                if attempt < 3 && err.contains("后台页面脚本异常") {
                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
                    continue;
                }
                output = Err(err);
                break;
            }
        }
    }
    // 跳转成功后等目标页开始加载再显示，避免闪主页；
    // 失败（如未登录无 token）则立即显示窗口让用户登录。
    let navigated = output
        .as_ref()
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(text).ok())
        .and_then(|value| value.get("vs_ok").and_then(|ok| ok.as_bool()))
        .unwrap_or(false);
    if navigated {
        wait_backend_url_contains(&app, material_url_marker(&media_type)).await;
    }
    show_wechat_backend(app.clone()).await?;
    output
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
    let path = material_upload_path(media_type)?;
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

/// 素材上传页相对路径：video → 视频上传编辑页；voice → 音频素材库页（官方在该页提供上传入口）。
fn material_upload_path(media_type: &str) -> Result<&'static str, String> {
    match media_type {
        "video" => Ok(
            "/cgi-bin/appmsg?t=media/videomsg_edit&action=video_edit&type=15&isNew=1&lang=zh_CN",
        ),
        "voice" => Ok("/cgi-bin/filepage?type=3&begin=0&count=20&lang=zh_CN"),
        other => Err(format!("不支持的素材类型：{other}")),
    }
}

/// 目标页 URL 标记，用于判断上传页是否已开始加载。
fn material_url_marker(media_type: &str) -> &'static str {
    if media_type == "video" {
        "action=video_edit"
    } else {
        "filepage"
    }
}

/// 等待后台窗口 URL 出现目标页标记（最多约 4 秒），返回是否到达。
async fn wait_backend_url_contains(app: &AppHandle, marker: &str) -> bool {
    for _ in 0..20 {
        let url = app
            .get_webview_window(BACKEND_WINDOW_LABEL)
            .and_then(|window| window.url().ok())
            .map(|url| url.to_string());
        if url.as_deref().is_some_and(|url| url.contains(marker)) {
            return true;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    false
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

/// 在后台窗口上下文里搜索微信表情。与官方编辑器一致，同时请求
/// operateremoticon?action=search_all（"全部表情"）和 action=search_gen
/// （"合成表情"），合并后返回原始 JSON 响应文本。
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

// Linux 下仅测试引用，避免 dead_code 警告。
#[cfg_attr(not(windows), allow(dead_code))]
fn remoticon_search_expr(query: &str, size: u32, offset: u32) -> String {
    let encoded_query = urlencoding::encode(query);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var fp = "";
            try {{ fp = window.fingerprint || ""; }} catch (e) {{}}
            var body =
              "size={size}&offset={offset}&query={query}&firstFlush=1&fingerprint=" +
              encodeURIComponent(fp) + "&token=" +
              encodeURIComponent(token) + "&lang=zh_CN&f=json&ajax=1";
            function post(action) {{
              var xhr = new XMLHttpRequest();
              xhr.open("POST", "/cgi-bin/operateremoticon?action=" + action, false);
              xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
              xhr.send(body);
              return xhr.responseText;
            }}
            // 官方编辑器同时请求"全部表情"与"合成表情"两个接口：
            // search_all 返回的 emoji_url 是加密数据（网页端也只能显示静态），
            // search_gen 返回未加密的 search.c2c 链接，可直接播放动图。
            // 这里合并两者，合成表情排前，让搜索结果的动图直接显示动画。
            var merged = {{}};
            var lastBase = null;
            function merge(parsed) {{
              if (!parsed) return;
              if (parsed.base_resp) {{
                lastBase = parsed.base_resp;
                if (parsed.base_resp.ret === 0) merged.base_resp = parsed.base_resp;
              }}
              if (parsed.normal_emoji_result) merged.normal_emoji_result = parsed.normal_emoji_result;
              if (parsed.gen_emoji_result) merged.gen_emoji_result = parsed.gen_emoji_result;
              if (parsed.query_type !== undefined) merged.query_type = parsed.query_type;
              if (parsed.search_id !== undefined) merged.search_id = parsed.search_id;
            }}
            try {{
              merge(JSON.parse(post("search_all")));
            }} catch (e) {{
              merged.search_all_error = String(e);
            }}
            try {{
              merge(JSON.parse(post("search_gen")));
            }} catch (e) {{
              merged.search_gen_error = String(e);
            }}
            var ok = merged.base_resp && merged.base_resp.ret === 0;
            if (ok) return JSON.stringify(merged);
            if (merged.search_all_error) return JSON.stringify({{ vs_error: "全部表情搜索: " + merged.search_all_error }});
            if (merged.search_gen_error) return JSON.stringify({{ vs_error: "合成表情搜索: " + merged.search_gen_error }});
            if (lastBase) merged.base_resp = lastBase;
            return JSON.stringify(merged);
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

/// 在视频号账号内按视频描述搜索（videosnap?action=search_feeds），
/// 返回结构与 get_feed_list 相同（list + continue_flag + last_buff），
/// 命中项额外带 highlight_desc（<em class="highlight"> 高亮）。
#[tauri::command]
pub async fn search_video_feeds(
    app: AppHandle,
    username: String,
    query: String,
    buffer: String,
) -> Result<String, String> {
    eval_backend_expr(
        app,
        video_feed_search_expr(&username, &query, &buffer),
        "视频号内容搜索",
    )
    .await
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

fn video_feed_search_expr(username: &str, query: &str, buffer: &str) -> String {
    let encoded_username = urlencoding::encode(username);
    let encoded_query = urlencoding::encode(query);
    let encoded_buffer = urlencoding::encode(buffer);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var url = "/cgi-bin/videosnap?action=search_feeds&username={username}&buffer={buffer}&count=15&query={query}&scene=0" +
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
        query = encoded_query,
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

/// 按 vid 获取官方视频信息（官方编辑器插入视频时同款 get_mp_video_info 接口），
/// 返回原始 JSON；窗口未打开时返回 "WECHAT_BACKEND_NOT_OPENED"。
#[tauri::command]
pub async fn get_mp_video_info(app: AppHandle, vid: String) -> Result<String, String> {
    eval_backend_expr(app, mp_video_info_expr(&vid), "视频信息").await
}

fn mp_video_info_expr(vid: &str) -> String {
    // 与其余 expr builder 一致：用户可控输入必须 urlencoding，既保证 URL 合法，
    // 也防止 vid 含引号/反斜杠时逃逸出 JS 字符串字面量（在持有微信会话的后台窗口注入脚本）。
    let enc_vid = urlencoding::encode(vid);
    format!(
        r#"(function () {{
          try {{
            var token = new URL(location.href).searchParams.get("token") || "";
            var url = "/cgi-bin/video?action=get_mp_video_info&vid={vid}&get_option=1" +
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
        vid = enc_vid,
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
/// params 为调用方已 urlencoding 的追加查询参数（以 & 开头，含用户输入时必须编码，
/// 否则可逃逸 JS 字符串字面量）。token 从后台首页 URL 提取。
fn ai_image_get_expr(action: &str, params: &str) -> String {
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
          remoticon_search_expr,
          music_search_expr, music_info_expr, material_upload_page_expr, material_upload_target,
          video_account_search_expr, video_feed_list_expr, video_feed_search_expr, video_media_list_expr,
          mp_video_info_expr, extract_token_from_url, extract_token_from_html, is_token_like,
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
    fn video_feed_search_expr_encodes_username_query_and_buffer() {
        let expr = video_feed_search_expr(
            "v2_060000231003b20faec8c4e68b1ec4d5cf01ef34b077d4b55c0c5f38106a7dbe893f7e6b822c@finder",
            "对我这种手机都要",
            "",
        );
        assert!(expr.contains("action=search_feeds"));
        assert!(expr.contains("username=v2_060000231003b20faec8c4e68b1ec4d5cf01ef34b077d4b55c0c5f38106a7dbe893f7e6b822c%40finder"));
        assert!(expr.contains("query=%E5%AF%B9%E6%88%91%E8%BF%99%E7%A7%8D%E6%89%8B%E6%9C%BA%E9%83%BD%E8%A6%81"));
        assert!(expr.contains("count=15"));
        assert!(expr.contains("&scene=0"));

        let paged = video_feed_search_expr("v2_xxx@finder", "黄金", "CAEQmqS8z4jYoxc=");
        assert!(paged.contains("buffer=CAEQmqS8z4jYoxc%3D"));
    }

    #[test]
    fn video_media_list_expr_encodes_export_id() {
        let expr = video_media_list_expr("export/UzFfBgAAxP-gPEl3UXWTjMzT4DCLVAxPvGbNv0GI5lK9vJLNgA");
        assert!(expr.contains("action=get_media_list"));
        assert!(expr.contains("video_snap_num=1"));
        assert!(expr.contains("exportid_0=export%2FUzFfBgAAxP-gPEl3UXWTjMzT4DCLVAxPvGbNv0GI5lK9vJLNgA"));
    }

    #[test]
    fn mp_video_info_expr_uses_official_action_and_vid() {
        let expr = mp_video_info_expr("wxv_4639287566263746561");
        assert!(expr.contains("action=get_mp_video_info"));
        assert!(expr.contains("vid=wxv_4639287566263746561"));
        assert!(expr.contains("get_option=1"));
        assert!(expr.contains("token"));
        assert!(expr.contains("f=json&ajax=1"));
    }

    #[test]
    fn mp_video_info_expr_encodes_malicious_vid() {
        // 引号/反斜杠必须被 URL 编码，不能原样进入 JS 字符串字面量，
        // 否则可在持有微信会话的后台窗口注入任意脚本。
        let expr = mp_video_info_expr("wxv_1\");alert(1);//");
        assert!(!expr.contains("\");alert(1);//"));
        assert!(expr.contains("vid=wxv_1%22%29%3Balert%281%29%3B%2F%2F"));
    }

    #[test]
    fn ai_image_get_expr_encodes_action() {
        let expr = ai_image_get_expr("get_session", "&style_id=0");
        assert!(expr.contains("action=get_session"));
        assert!(expr.contains("style_id=0"));
        // 恶意 action 同样不能逃逸 JS 字符串字面量。
        let evil = ai_image_get_expr("\");alert(1);//", "&style_id=0");
        assert!(!evil.contains("\");alert(1);//"));
        assert!(evil.contains("action=%22%29%3Balert%281%29%3B%2F%2F"));
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
      fn remoticon_search_expr_queries_all_and_gen() {
          let expr = remoticon_search_expr("懂我", 40, 0);
          // 与官方编辑器一致：同时请求"全部表情"和"合成表情"两个接口
          assert!(expr.contains(r#""search_all""#));
          assert!(expr.contains(r#""search_gen""#));
          assert!(expr.contains("size=40&offset=0"));
          assert!(expr.contains("query=%E6%87%82%E6%88%91"));
          assert!(expr.contains("gen_emoji_result"));
          assert!(expr.contains("normal_emoji_result"));
          assert!(expr.contains("lang=zh_CN&f=json&ajax=1"));
          // 合并时合成表情排前（gen 未加密可直接播放动图）
          assert!(expr.contains("var merged = {};"));
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
    fn material_upload_target_builds_absolute_url_with_token() {
        let target = material_upload_target(
            "/cgi-bin/appmsg?t=media/videomsg_edit&action=video_edit&type=15&isNew=1&lang=zh_CN",
            "123456789",
        )
        .unwrap();
        assert!(target.starts_with("https://mp.weixin.qq.com/cgi-bin/appmsg"));
        assert!(target.ends_with("&token=123456789"));
    }

    #[test]
    fn upload_token_extracted_from_final_url() {
        let url =
            "https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=123456789&f=json";
        assert_eq!(extract_token_from_url(url).as_deref(), Some("123456789"));
        // 未登录：落地在登录页，URL 里没有数字 token
        assert_eq!(
            extract_token_from_url(
                "https://mp.weixin.qq.com/cgi-bin/loginpage?t=wxm2-login&lang=zh_CN"
            ),
            None
        );
        assert_eq!(extract_token_from_url("https://mp.weixin.qq.com/"), None);
    }

    #[test]
    fn upload_token_extracted_from_html() {
        // 登录跳转页/地址里带 token
        let redirect =
            r#"location.href = "/cgi-bin/home?t=home/index&lang=zh_CN&token=987654321";"#;
        assert_eq!(
            extract_token_from_html(redirect).as_deref(),
            Some("987654321")
        );
        // 主页 SPA 的 t 字段内嵌当前会话 token
        let logged = r#"var data = { t: "123456789" || "", lang: 'zh_CN' };"#;
        assert_eq!(
            extract_token_from_html(logged).as_deref(),
            Some("123456789")
        );
        // 未登录：token 是空串，不应误取
        let anon = r#"var data = { t: "" || "", param: ["&token=", '&lang=zh_CN'] };"#;
        assert_eq!(extract_token_from_html(anon), None);
        // 非数字 token 不取
        assert_eq!(
            extract_token_from_html(r#"var t = "abcdefghijkl";"#),
            None
        );
    }

    #[test]
    fn upload_token_requires_numeric_shape() {
        assert!(is_token_like("123456"));
        assert!(is_token_like("123456789012"));
        assert!(!is_token_like(""));
        assert!(!is_token_like("12345"));
        assert!(!is_token_like("abcdefghij"));
        assert!(!is_token_like("1234567890123"));
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
