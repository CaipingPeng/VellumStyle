// 微信公众平台后台静默同步：
// 软件内嵌一个后台窗口（用户扫码登录一次），登录态保存在 WebView 数据目录，
// 之后用 DevTools Protocol 在页面上下文里同步调用 filepage 素材接口拉取音频列表，
// 拿到官方 API 不提供的 voice_encode_fileid，供素材库批量绑定。
// 注意：这是模拟后台内部接口，微信改版可能导致失效。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2CookieList;

// 按域拆分（原 1699 行单文件）：窗口 / 登录态 / 素材上传 / 内容检索 / 手机传图 / AI 配图。
// 子模块用 `use super::*;` 继承这里的公共导入；对外路径仍是 `wechat_backend::<cmd>`，
// 所以 lib.rs 的 generate_handler! 不需要改。

mod ai_image;
mod content;
mod material;
mod phone_upload;
mod session;
mod window;

// glob 重导出（含 tauri 命令宏），保持 `wechat_backend::<cmd>` 这个外部路径不变。
pub(crate) use ai_image::*;
pub(crate) use content::*;
pub(crate) use material::*;
pub(crate) use phone_upload::*;
pub(crate) use session::*;
pub(crate) use window::*;

// ---------------------------------------------------------------- 共用工具

/// 在后台窗口上下文执行注入脚本（Windows），非 Windows 返回平台不支持提示。
pub(crate) async fn eval_backend_expr(app: AppHandle, expression: String, unsupported_hint: &str) -> Result<String, String> {
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
// 后台脚本执行结果的统一解析；Linux 下仅测试引用，避免 dead_code 警告。
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn parse_evaluate_response(response_json: &str) -> Result<String, String> {
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
mod tests;
