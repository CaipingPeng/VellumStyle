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
    if let Some(window) = app.get_webview_window(BACKEND_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = WebviewUrl::External(
        BACKEND_HOME
            .parse()
            .map_err(|err| format!("微信后台地址无效：{err}"))?,
    );
    WebviewWindowBuilder::new(&app, BACKEND_WINDOW_LABEL, url)
        .title("微信公众平台登录")
        .inner_size(960.0, 720.0)
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
    let expression = remoticon_search_expr(&query, size.clamp(1, 60), offset);
    #[cfg(windows)]
    {
        eval_in_backend_window(app, expression).await
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("表情搜索目前仅支持 Windows".into())
    }
}

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
    use super::parse_evaluate_response;

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
}
