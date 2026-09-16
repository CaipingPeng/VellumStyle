// 后台脚本 builder 与解析的单元测试（原样搬运，仅去掉外层 mod 包裹）。

use super::{
    ai_image_get_expr, ai_image_post_expr, extract_token_from_html, extract_token_from_url,
    is_token_like, material_upload_page_expr, material_upload_target, mp_video_info_expr,
    music_info_expr, music_search_expr, parse_evaluate_response, phone_upload_confirm_expr,
    phone_upload_pic_list_expr, phone_upload_qrcode_expr, remoticon_cdn_url_expr,
    remoticon_search_expr, video_account_search_expr, video_feed_list_expr,
    video_feed_search_expr, video_media_list_expr,
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
