// 内容检索：音频素材、表情、音乐、视频号。
// 由原 wechat_backend.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

/// 音频素材列表拉取脚本（同步 XHR，返回接口响应文本）。
/// fingerprint 参数实测不校验，可以省略；token 从后台首页 URL 提取。
#[cfg(windows)]
pub(crate) const VOICE_LIST_EXPR: &str = r#"(function () {
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
pub(crate) fn remoticon_search_expr(query: &str, size: u32, offset: u32) -> String {
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
pub(crate) fn remoticon_cdn_url_expr(
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

pub(crate) fn music_search_expr(key: &str) -> String {
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

pub(crate) fn music_info_expr(id: &str, music_type: u32, source: u32) -> String {
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

pub(crate) fn video_account_search_expr(key: &str, buffer: &str) -> String {
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

pub(crate) fn video_feed_list_expr(username: &str, buffer: &str) -> String {
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

pub(crate) fn video_feed_search_expr(username: &str, query: &str, buffer: &str) -> String {
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

pub(crate) fn video_media_list_expr(export_id: &str) -> String {
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

pub(crate) fn mp_video_info_expr(vid: &str) -> String {
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
