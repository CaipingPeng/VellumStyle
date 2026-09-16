// 登录态与 token：从 WebView2 会话 cookie 换取新鲜 token，并从 URL / HTML 里解析。
// 由原 wechat_backend.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

/// 用 WebView2 真实会话 cookie 向服务器换取当前会话的新鲜 token：
/// 先请求后台首页（登录态会 302 到带 token 的地址，或 HTML 内嵌 token），
/// 两个来源都解析不出数字 token 视为未登录。
#[cfg(windows)]
pub(crate) async fn fetch_wechat_session_token(app: &AppHandle) -> Result<Option<String>, String> {
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
pub(crate) fn extract_token_from_url(url: &str) -> Option<String> {
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
pub(crate) fn extract_token_from_html(html: &str) -> Option<String> {
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
pub(crate) fn token_from_rest(rest: &str) -> Option<String> {
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
pub(crate) fn is_token_like(value: &str) -> bool {
    (6..=12).contains(&value.len()) && value.chars().all(|c| c.is_ascii_digit())
}

/// 从 WebView2 CookieManager 读取 mp.weixin.qq.com 的真实会话 cookie 头
/// （含 HttpOnly；主窗口与后台窗口共享同一份 cookie 仓库）。
/// 没有会话 cookie（未登录）时返回 Ok(None)。
#[cfg(windows)]
pub(crate) async fn read_wechat_session_cookies(app: &AppHandle) -> Result<Option<String>, String> {
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
pub(crate) fn collect_session_cookie_header(
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
