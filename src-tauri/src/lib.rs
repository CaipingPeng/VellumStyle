mod config;
mod documents;
mod import;
mod themes;
mod wechat;

use tauri::http::{Response, StatusCode};
use tauri::{UriSchemeContext, UriSchemeResponder};

// wximg 自定义协议：预览里 mmbiz 图 src 改写成 wximg://localhost/?url=<编码后的 mmbiz 链>，
// 这里解析出原链，带微信 Referer 拉图返回，绕过防盗链。
fn handle_wximg<R: tauri::Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    // request.uri() 形如 wximg://localhost/?url=https%3A%2F%2Fmmbiz...
    let uri = request.uri().to_string();
    let raw_url = uri
        .split_once("url=")
        .map(|(_, v)| v.to_string())
        .and_then(|v| urlencoding::decode(&v).ok().map(|c| c.into_owned()));

    let Some(raw_url) = raw_url else {
        responder.respond(
            Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(b"missing url".to_vec())
                .unwrap(),
        );
        return;
    };

    tauri::async_runtime::spawn(async move {
        match wechat::fetch_proxied_image(&raw_url).await {
            Ok((content_type, bytes)) => {
                let resp = Response::builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", content_type)
                    .header("Cache-Control", "public, max-age=86400")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap();
                responder.respond(resp);
            }
            Err(msg) => {
                responder.respond(
                    Response::builder()
                        .status(StatusCode::BAD_GATEWAY)
                        .body(msg.into_bytes())
                        .unwrap(),
                );
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("wximg", handle_wximg)
        .invoke_handler(tauri::generate_handler![
            wechat::upload_image,
            wechat::upload_local_image,
            wechat::upload_remote_image,
            import::pick_markdown_file,
            import::pick_image_file,
            import::pick_resource_dir,
            import::read_markdown_file,
            import::resolve_import_media,
            config::get_config,
            config::save_config,
            themes::list_user_themes,
            themes::save_user_theme,
            themes::import_mdnice_theme,
            themes::ensure_themes_dir,
            themes::open_themes_dir,
            documents::list_documents,
            documents::read_document,
            documents::write_document,
            documents::create_document,
            documents::create_folder,
            documents::rename_entry,
            documents::delete_entry,
            documents::move_entry,
            wechat::upload_thumb,
            wechat::upload_remote_thumb,
            wechat::add_draft
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
