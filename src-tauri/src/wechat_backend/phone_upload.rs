// 手机传图：二维码、待传列表、确认上传。
// 由原 wechat_backend.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

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

pub(crate) fn phone_upload_qrcode_expr() -> String {
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

pub(crate) fn phone_upload_pic_list_expr(qrcode_uuid: &str) -> String {
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

pub(crate) fn phone_upload_confirm_expr(data: &str) -> String {
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
