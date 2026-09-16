// 素材上传：上传页导航、token 缓存，以及页面注入式上传流程。
// 由原 wechat_backend.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

/// 最近一次向服务器换取的新鲜 token 缓存（避免每次点上传都发一次会话请求）。
pub(crate) const UPLOAD_TOKEN_TTL: std::time::Duration = std::time::Duration::from_secs(10 * 60);
pub(crate) static UPLOAD_TOKEN_CACHE: std::sync::Mutex<Option<(String, std::time::Instant)>> =
    std::sync::Mutex::new(None);

/// 命中缓存且未过期时返回 token，否则返回 None。
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn cached_upload_token() -> Option<String> {
    let guard = UPLOAD_TOKEN_CACHE.lock().ok()?;
    let (token, at) = guard.as_ref()?;
    if at.elapsed() <= UPLOAD_TOKEN_TTL {
        Some(token.clone())
    } else {
        None
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn cache_upload_token(token: String) {
    if let Ok(mut guard) = UPLOAD_TOKEN_CACHE.lock() {
        *guard = Some((token, std::time::Instant::now()));
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn clear_upload_token_cache() {
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
pub(crate) async fn navigate_with_token(
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
pub(crate) fn material_upload_target(path: &str, token: &str) -> Result<String, String> {
    let target = format!(
        "https://mp.weixin.qq.com{path}&token={}",
        urlencoding::encode(token)
    );
    url::Url::parse(&target)
        .map(|_| target)
        .map_err(|err| format!("上传页地址无效：{err}"))
}
/// 页面注入流程：窗口加载到微信域后，用页面上下文提取 token（URL → 页面 cookie），
/// 未登录时返回可读错误并显示窗口引导扫码。
pub(crate) async fn page_based_upload_flow(app: AppHandle, media_type: &str) -> Result<String, String> {
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
pub(crate) fn backend_window_is_on_wechat(app: &AppHandle) -> bool {
    app.get_webview_window(BACKEND_WINDOW_LABEL)
        .and_then(|window| window.url().ok())
        .map(|url| url.to_string())
        .is_some_and(|url| url.starts_with("https://mp.weixin.qq.com/"))
}

/// 素材上传页跳转脚本：token 优先从后台窗口当前 URL 提取，取不到时回退到 cookie
/// （精确 token 键 → 纯数字值兜底），返回目标地址 JSON 便于前端校验。
/// video → 视频上传编辑页；voice → 音频素材库页（官方在该页提供上传入口）。
pub(crate) fn material_upload_page_expr(media_type: &str) -> Result<String, String> {
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
pub(crate) fn material_upload_path(media_type: &str) -> Result<&'static str, String> {
    match media_type {
        "video" => Ok(
            "/cgi-bin/appmsg?t=media/videomsg_edit&action=video_edit&type=15&isNew=1&lang=zh_CN",
        ),
        "voice" => Ok("/cgi-bin/filepage?type=3&begin=0&count=20&lang=zh_CN"),
        other => Err(format!("不支持的素材类型：{other}")),
    }
}

/// 目标页 URL 标记，用于判断上传页是否已开始加载。
pub(crate) fn material_url_marker(media_type: &str) -> &'static str {
    if media_type == "video" {
        "action=video_edit"
    } else {
        "filepage"
    }
}

/// 等待后台窗口 URL 出现目标页标记（最多约 4 秒），返回是否到达。
pub(crate) async fn wait_backend_url_contains(app: &AppHandle, marker: &str) -> bool {
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
