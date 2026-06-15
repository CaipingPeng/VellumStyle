use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn write_export_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    tokio::fs::write(path, bytes)
        .await
        .map_err(|err| format!("写入导出文件失败：{err}"))
}

#[tauri::command]
pub async fn export_pdf_file(app: AppHandle, html: String, path: String) -> Result<(), String> {
    export_pdf_file_impl(app, html, path).await
}

#[cfg(windows)]
async fn export_pdf_file_impl(app: AppHandle, html: String, path: String) -> Result<(), String> {
    use tokio::sync::oneshot;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::ICoreWebView2,
        CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR,
    };

    let id = unique_export_id();
    let label = format!("pdf-export-{id}");
    let temp_path = app
        .path()
        .temp_dir()
        .map_err(|err| format!("获取临时目录失败：{err}"))?
        .join(format!("vellumstyle-pdf-export-{id}.html"));

    tokio::fs::write(&temp_path, html)
        .await
        .map_err(|err| format!("写入 PDF 临时文档失败：{err}"))?;

    let file_url = url::Url::from_file_path(&temp_path)
        .map_err(|_| "生成 PDF 临时文档 URL 失败".to_string())?;
    let (tx, rx) = oneshot::channel::<Result<(), String>>();
    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let output_path = path.clone();

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(file_url))
        .title("PDF Export")
        .visible(false)
        .on_page_load(move |window, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished {
                return;
            }

            let tx = tx.clone();
            let output_path = output_path.clone();
            let window_for_cleanup = window.clone();

            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(350)).await;

                let send_result = |result: Result<(), String>| {
                    if let Ok(mut tx_guard) = tx.lock() {
                        if let Some(tx) = tx_guard.take() {
                            let _ = tx.send(result);
                        }
                    }
                };

                let (pdf_tx, pdf_rx) = oneshot::channel::<Result<(), String>>();
                let pdf_tx = std::sync::Arc::new(std::sync::Mutex::new(Some(pdf_tx)));
                let output_path_for_webview = output_path.clone();

                let with_webview_result = window.with_webview(move |platform_webview| {
                    let result = (|| -> Result<(), String> {
                        let webview: ICoreWebView2 = unsafe {
                            platform_webview
                                .controller()
                                .CoreWebView2()
                                .map_err(|err| format!("获取 WebView2 页面失败：{err}"))?
                        };

                        let pdf_tx = pdf_tx.clone();
                        let output_path_for_handler = output_path_for_webview.clone();
                        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                            move |error_code, response_json| {
                                let result = match error_code {
                                    Ok(()) => write_devtools_pdf_response(&response_json, &output_path_for_handler),
                                    Err(err) => Err(format!("WebView2 导出 PDF 失败：{err}")),
                                };

                                if let Ok(mut tx_guard) = pdf_tx.lock() {
                                    if let Some(tx) = tx_guard.take() {
                                        let _ = tx.send(result);
                                    }
                                }
                                Ok(())
                            },
                        ));
                        let method = CoTaskMemPWSTR::from("Page.printToPDF");
                        let params = CoTaskMemPWSTR::from(pdf_print_options_json().as_str());

                        unsafe {
                            webview
                                .CallDevToolsProtocolMethod(
                                    *method.as_ref().as_pcwstr(),
                                    *params.as_ref().as_pcwstr(),
                                    &handler,
                                )
                                .map_err(|err| format!("启动 PDF 导出失败：{err}"))?;
                        }

                        Ok(())
                    })();

                    if let Err(err) = result {
                        if let Ok(mut tx_guard) = pdf_tx.lock() {
                            if let Some(tx) = tx_guard.take() {
                                let _ = tx.send(Err(err));
                            }
                        }
                    }
                });

                if let Err(err) = with_webview_result {
                    send_result(Err(format!("访问 PDF 导出 WebView 失败：{err}")));
                    let _ = window_for_cleanup.close();
                    return;
                }

                let result = pdf_rx
                    .await
                    .unwrap_or_else(|_| Err("PDF 导出任务意外中断".to_string()));
                send_result(result);
                let _ = window_for_cleanup.close();
            });
        })
        .build()
        .map_err(|err| format!("创建 PDF 导出窗口失败：{err}"))?;

    let result = rx
        .await
        .unwrap_or_else(|_| Err("PDF 导出窗口已关闭，导出未完成".to_string()));

    let _ = window.close();
    let _ = tokio::fs::remove_file(&temp_path).await;

    result?;

    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|err| format!("PDF 文件未生成：{err}"))?;
    if metadata.len() == 0 {
        return Err("PDF 文件为空，导出失败".to_string());
    }

    Ok(())
}

#[cfg(windows)]
fn pdf_print_options_json() -> String {
    serde_json::json!({
        "landscape": false,
        "displayHeaderFooter": false,
        "printBackground": true,
        "preferCSSPageSize": true,
        "generateDocumentOutline": true,
        "paperWidth": 8.2677165354,
        "paperHeight": 11.6929133858,
        "marginTop": 0,
        "marginBottom": 0,
        "marginLeft": 0,
        "marginRight": 0
    })
    .to_string()
}

#[cfg(windows)]
fn write_devtools_pdf_response(response_json: &str, path: &str) -> Result<(), String> {
    use base64::Engine;

    let response: serde_json::Value = serde_json::from_str(response_json)
        .map_err(|err| format!("解析 PDF 导出结果失败：{err}"))?;
    let data = response
        .get("data")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "PDF 导出结果缺少 data 字段".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|err| format!("解码 PDF 数据失败：{err}"))?;
    std::fs::write(path, bytes).map_err(|err| format!("写入 PDF 文件失败：{err}"))
}

#[cfg(not(windows))]
async fn export_pdf_file_impl(_app: AppHandle, _html: String, _path: String) -> Result<(), String> {
    Err("PDF 直接导出目前仅支持 Windows WebView2".to_string())
}

fn unique_export_id() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
