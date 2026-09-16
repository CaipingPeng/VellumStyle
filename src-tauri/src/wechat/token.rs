// access_token 缓存与获取（微信限频，必须复用）、出口 IP 查询。
// 由原 wechat.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

// access_token 缓存：微信限频，必须复用（有效期 7200s）。
pub(crate) struct TokenCache {
    pub(crate) token: String,
    pub(crate) expire_at: Instant,
    pub(crate) credential_key: u64,
}

pub(crate) static TOKEN_CACHE: Mutex<Option<TokenCache>> = Mutex::new(None);
pub(crate) static TOKEN_FETCH_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
pub(crate) const OUTBOUND_IP_ENDPOINTS: [&str; 4] = [
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
    "http://ipinfo.io/ip",
    "https://checkip.amazonaws.com",
];

pub(crate) const WECHAT_IP_WHITELIST_HINT: &str = "请去微信后台 IP 白名单设置：在微信公众平台「设置与开发 → 基本配置 → IP 白名单」添加/更换当前出口 IP；可在本软件设置页一键获取出口 IP。";
pub(crate) fn credential_key(app_id: &str, app_secret: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    app_id.hash(&mut hasher);
    app_secret.hash(&mut hasher);
    hasher.finish()
}

pub(crate) fn cached_access_token(key: u64) -> Option<String> {
    let cache = TOKEN_CACHE.lock().unwrap();
    cache.as_ref().and_then(|cached| {
        (cached.credential_key == key && Instant::now() < cached.expire_at)
            .then(|| cached.token.clone())
    })
}

pub(crate) async fn fetch_access_token(app_id: &str, app_secret: &str, key: u64) -> Result<String, String> {
    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={}&secret={}",
        urlencoding::encode(app_id),
        urlencoding::encode(app_secret),
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("请求 access_token 失败：{}", e.without_url()))?;
    let data: TokenResp = resp
        .json()
        .await
        .map_err(|e| format!("解析 access_token 响应失败：{}", e.without_url()))?;
    match data.access_token {
        Some(token) => {
            // 提前 5 分钟过期，避免边界上用到已失效的 token。
            let ttl = data.expires_in.unwrap_or(7200).saturating_sub(300);
            let mut cache = TOKEN_CACHE.lock().unwrap();
            *cache = Some(TokenCache {
                token: token.clone(),
                expire_at: Instant::now() + Duration::from_secs(ttl),
                credential_key: key,
            });
            Ok(token)
        }
        None => Err(format_wechat_error(
            data.errcode,
            &data.errmsg.unwrap_or_default(),
            "获取 access_token 失败",
        )),
    }
}

pub(crate) async fn get_access_token(app_id: &str, app_secret: &str) -> Result<String, String> {
    let key = credential_key(app_id, app_secret);
    if let Some(token) = cached_access_token(key) {
        return Ok(token);
    }
    let fetch_lock = TOKEN_FETCH_LOCK.get_or_init(|| tokio::sync::Mutex::new(()));
    let _guard = fetch_lock.lock().await;
    if let Some(token) = cached_access_token(key) {
        return Ok(token);
    }
    fetch_access_token(app_id, app_secret, key).await
}

/// 清 token 缓存（凭证变更或 token 失效时调用）。同步，供 save_config 调用。
pub fn clear_token_blocking() {
    let mut cache = TOKEN_CACHE.lock().unwrap();
    *cache = None;
}

pub(crate) fn invalidate_access_token(failed_token: &str) {
    let mut cache = TOKEN_CACHE.lock().unwrap();
    if cache
        .as_ref()
        .is_some_and(|cached| cached.token == failed_token)
    {
        *cache = None;
    }
}
#[tauri::command]
pub async fn get_outbound_ip() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .local_address(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
        // IP 白名单需要本机直连出口；系统代理会显示代理节点 IP，和微信后台看到的不一致。
        .no_proxy()
        .build()
        .map_err(|e| format!("创建出口 IP 查询客户端失败：{e}"))?;

    let mut last_error = String::new();
    for endpoint in OUTBOUND_IP_ENDPOINTS {
        match client.get(endpoint).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_error = format!("{endpoint} 返回 HTTP {}", resp.status());
                    continue;
                }
                match resp.text().await {
                    Ok(body) => match parse_outbound_ip_response(&body) {
                        Ok(ip) => return Ok(ip),
                        Err(msg) => last_error = format!("{endpoint}：{msg}"),
                    },
                    Err(e) => last_error = format!("{endpoint} 响应读取失败：{e}"),
                }
            }
            Err(e) => last_error = format!("{endpoint} 请求失败：{e}"),
        }
    }

    if last_error.is_empty() {
        Err("获取出口 IP 失败，请检查网络后重试".into())
    } else {
        Err(format!("获取出口 IP 失败：{last_error}"))
    }
}

pub(crate) fn parse_outbound_ip_response(body: &str) -> Result<String, String> {
    let value = body.trim();
    match value.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => Ok(ip.to_string()),
        Ok(IpAddr::V6(_)) => Err("出口 IP 服务返回的是 IPv6 地址，请重试获取 IPv4".to_string()),
        Err(_) => Err("出口 IP 服务返回内容不是合法 IP".to_string()),
    }
}
