mod background;
mod config;
mod documents;
mod export_file;
mod external;
mod import;
mod ipc_util;
mod preview_image;
mod sync;
mod themes;
mod wechat;
mod wechat_backend;
use tauri::http::{Response, StatusCode};
use tauri::{UriSchemeContext, UriSchemeResponder};

// wximg 自定义协议：预览里图片 src 改写成 wximg://localhost/?url=<编码后的原链>，
// 这里解析出原链，带微信 Referer 拉图返回，绕过防盗链。
fn handle_wximg<R: tauri::Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    // request.uri() 形如 wximg://localhost/?url=https%3A%2F%2Fmmbiz...
    let uri = request.uri().to_string();
    let raw_url = url::Url::parse(&uri)
        .ok()
        .and_then(|parsed| {
            parsed
                .query_pairs()
                .find(|(key, _)| key == "url")
                .map(|(_, value)| value.into_owned())
        });

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
                // 成功路径不打日志：预览每张图都会触发，开发运行时避免刷屏；
                // 失败与异常（fetch_proxied_image 内）仍保留诊断输出。
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
                eprintln!("[wximg] fail url={raw_url} err={msg}");
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol("wximg", handle_wximg)
        .invoke_handler(tauri::generate_handler![
            background::copy_background_image,
            background::remove_background_image,
            preview_image::get_preview_image_asset,
            preview_image::write_preview_image_asset,
            preview_image::copy_preview_image,
            wechat::upload_image,
            wechat::get_outbound_ip,
            wechat::list_image_materials,
            wechat::list_video_materials,
            wechat::list_voice_materials,
            wechat::delete_image_material,
            wechat::get_video_play_url,
            wechat_backend::open_wechat_backend,
            wechat_backend::open_wechat_backend_hidden,
            wechat_backend::show_wechat_backend,
            wechat_backend::fetch_backend_voice_list,
            wechat_backend::open_material_upload_page,
            wechat_backend::backend_window_url,
            wechat_backend::close_wechat_backend,
            wechat_backend::search_remoticon,
            wechat_backend::get_emoji_cdn_url,
            wechat_backend::search_music,
            wechat_backend::get_music_info,
            wechat_backend::search_video_account,
            wechat_backend::get_video_feed_list,
            wechat_backend::search_video_feeds,
            wechat_backend::get_video_media_list,
            wechat_backend::get_mp_video_info,
            wechat_backend::get_phone_upload_qrcode,
            wechat_backend::get_phone_upload_pic_list,
            wechat_backend::confirm_phone_upload_pic,
            wechat_backend::ai_image_get_session,
            wechat_backend::ai_image_get_style,
            wechat_backend::ai_image_get_example,
            wechat_backend::ai_image_get_biz_recent_img_list,
            wechat_backend::ai_image_related_search,
            wechat_backend::ai_image_append_related_search,
            wechat_backend::ai_image_start_creation,
            wechat_backend::ai_image_get_pic,
            wechat_backend::ai_image_insert_pic,
            wechat::upload_local_image,
            wechat::upload_remote_image,
            import::pick_markdown_file,
            import::pick_markdown_files,
            import::pick_image_file,
            import::pick_image_files,
            import::pick_resource_dir,
            import::read_markdown_file,
            import::resolve_import_media,
            config::get_config,
            config::save_config,
            sync::sync_documents,
            sync::test_sync_connection,
            themes::list_user_themes,
            themes::import_css_theme,
            themes::delete_user_theme,
            themes::ensure_themes_dir,
            themes::open_themes_dir,
            external::open_external_url,
            documents::list_documents,
            documents::read_document,
            documents::write_document,
            documents::create_document,
            documents::create_folder,
            documents::rename_entry,
            documents::delete_entry,
            documents::move_entry,
            documents::get_entry_absolute_path,
            documents::open_entry_location,
            export_file::write_export_file,
            export_file::export_pdf_file,
            wechat::upload_thumb,
            wechat::upload_remote_thumb,
            wechat::add_draft
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
