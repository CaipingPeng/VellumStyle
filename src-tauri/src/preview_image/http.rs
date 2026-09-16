// 网络策略与下载：SSRF 校验（含 is_globally_routable_ip）、DNS 固定、重定向逐跳校验、超时。
// 由原 preview_image.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum NetworkPolicy {
    Strict,
    #[cfg(test)]
    AllowLocalForTests,
}
pub(crate) fn is_globally_routable_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !matches!(
                (a, b, c),
                (0, _, _)
                    | (10, _, _)
                    | (100, 64..=127, _)
                    | (127, _, _)
                    | (169, 254, _)
                    | (172, 16..=31, _)
                    | (192, 0, 0)
                    | (192, 0, 2)
                    | (192, 88, 99)
                    | (192, 168, _)
                    | (198, 18..=19, _)
                    | (198, 51, 100)
                    | (203, 0, 113)
                    | (224..=255, _, _)
            )
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_globally_routable_ip(IpAddr::V4(mapped));
            }

            let segments = ip.segments();
            let numeric = u128::from_be_bytes(ip.octets());
            let ietf_protocol_assignment = segments[0] == 0x2001 && segments[1] < 0x0200;
            let globally_reachable_ietf_exception =
                // PCP, TURN, and DNS-SD Service Registration Protocol anycast addresses.
                matches!(numeric, 0x2001_0001_0000_0000_0000_0000_0000_0001
                    | 0x2001_0001_0000_0000_0000_0000_0000_0002
                    | 0x2001_0001_0000_0000_0000_0000_0000_0003)
                // AMT and AS112-v6.
                || matches!(segments, [0x2001, 0x0003, ..]
                    | [0x2001, 0x0004, 0x0112, ..])
                // ORCHIDv2 and Drone Remote ID Protocol Entity Tags.
                || matches!(segments, [0x2001, 0x0020..=0x003f, ..]);

            !(ip.is_unspecified()
                || ip.is_loopback()
                // IPv4-compatible, NAT64, translation, and discard-only prefixes.
                || matches!(segments, [0, 0, 0, 0, 0, 0, _, _])
                || matches!(segments, [0x0064, 0xff9b, 0, 0, 0, 0, _, _])
                || matches!(segments, [0x0064, 0xff9b, 1, ..])
                || matches!(segments, [0x0100, 0, 0, 0, ..])
                || matches!(segments, [0x0100, 0, 0, 1, ..])
                // IANA IETF Protocol Assignments are non-global except these explicit subranges.
                || (ietf_protocol_assignment && !globally_reachable_ietf_exception)
                // 6to4, both documentation ranges, and Segment Routing SIDs.
                || matches!(segments, [0x2002, ..])
                || matches!(segments, [0x2001, 0x0db8, ..])
                || matches!(segments, [0x3fff, 0x0000..=0x0fff, ..])
                || matches!(segments, [0x5f00, ..])
                // Unique-local, deprecated site-local, link-local, and multicast scopes.
                || matches!(segments[0] & 0xfe00, 0xfc00)
                || matches!(segments[0] & 0xffc0, 0xfec0)
                || matches!(segments[0] & 0xffc0, 0xfe80)
                || matches!(segments[0] & 0xff00, 0xff00))
        }
    }
}
pub(crate) fn validate_http_target(url: &Url, policy: NetworkPolicy) -> Result<(), String> {
    let _ = policy;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only HTTP(S) image URLs are allowed".into());
    }
    #[cfg(test)]
    if policy == NetworkPolicy::AllowLocalForTests {
        return Ok(());
    }
    let blocked = match url.host() {
        Some(url::Host::Domain(host)) => {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .to_ascii_lowercase()
                    .strip_suffix(".localhost")
                    .is_some()
        }
        Some(url::Host::Ipv4(ip)) => !is_globally_routable_ip(IpAddr::V4(ip)),
        Some(url::Host::Ipv6(ip)) => !is_globally_routable_ip(IpAddr::V6(ip)),
        None => true,
    };
    if blocked {
        Err("private or local image URLs are not allowed".into())
    } else {
        Ok(())
    }
}
#[derive(Debug)]
pub(crate) struct PreparedHttpHop {
    pub(crate) url: Url,
    pub(crate) client: reqwest::Client,
    #[cfg(test)]
    pub(crate) pinned_addrs: Vec<SocketAddr>,
}
pub(crate) fn normalize_http_url(mut url: Url) -> Result<Url, String> {
    let wechat = is_wechat_host(&url);
    if wechat && url.scheme() == "http" {
        url.set_scheme("https").map_err(|_| "invalid image URL")?;
    }
    Ok(url)
}
pub(crate) fn direct_http_client_builder(
    connect_timeout: Duration,
    total_timeout: Duration,
) -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(connect_timeout)
        .timeout(total_timeout)
        .redirect(reqwest::redirect::Policy::none())
}
pub(crate) async fn prepare_http_hop_with_resolver<R, F>(
    url: Url,
    connect_timeout: Duration,
    total_timeout: Duration,
    policy: NetworkPolicy,
    resolver: R,
) -> Result<PreparedHttpHop, String>
where
    R: FnOnce(String, u16) -> F,
    F: Future<Output = Result<Vec<SocketAddr>, String>>,
{
    let url = normalize_http_url(url)?;
    validate_http_target(&url, policy)?;
    #[cfg(test)]
    let mut pinned_addrs = None;
    let mut builder = direct_http_client_builder(connect_timeout, total_timeout);
    if let Some(url::Host::Domain(host)) = url.host() {
        let port = url
            .port_or_known_default()
            .ok_or("image URL has no usable port")?;
        let addresses = resolver(host.to_owned(), port)
            .await
            .map_err(|error| format!("unable to resolve image hostname: {error}"))?;
        if addresses.is_empty() {
            return Err("image hostname resolved to no addresses".into());
        }
        #[cfg(test)]
        let allow_local = policy == NetworkPolicy::AllowLocalForTests;
        #[cfg(not(test))]
        let allow_local = false;
        if !allow_local
            && addresses
                .iter()
                .any(|address| !is_globally_routable_ip(address.ip()))
        {
            return Err("image hostname resolves to a private or local address".into());
        }
        builder = builder.resolve_to_addrs(host, &addresses);
        #[cfg(test)]
        {
            pinned_addrs = Some(addresses);
        }
    }
    let client = builder
        .build()
        .map_err(|e| format!("unable to create HTTP client: {e}"))?;
    Ok(PreparedHttpHop {
        url,
        client,
        #[cfg(test)]
        pinned_addrs: pinned_addrs.unwrap_or_default(),
    })
}
pub(crate) fn is_wechat_host(url: &Url) -> bool {
    matches!(url.host_str(), Some("mmbiz.qpic.cn" | "mmbiz.qlogo.cn"))
}
pub(crate) fn build_request_for_url(
    client: &reqwest::Client,
    mut url: Url,
    policy: NetworkPolicy,
) -> Result<reqwest::Request, String> {
    url = normalize_http_url(url)?;
    validate_http_target(&url, policy)?;
    let wechat = is_wechat_host(&url);
    let mut request = client.get(url);
    if wechat {
        request = request.header(REFERER, "https://mp.weixin.qq.com");
    }
    request
        .build()
        .map_err(|e| format!("unable to build image request: {e}"))
}
#[cfg(test)]
pub(crate) fn http_client(
    connect_timeout: Duration,
    total_timeout: Duration,
) -> Result<reqwest::Client, String> {
    direct_http_client_builder(connect_timeout, total_timeout)
        .build()
        .map_err(|e| format!("unable to create HTTP client: {e}"))
}
pub(crate) fn is_followable_redirect(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308)
}
pub(crate) fn resolve_redirect_target(
    current: &Url,
    location: &str,
    policy: NetworkPolicy,
) -> Result<Url, String> {
    let target = current
        .join(location)
        .map_err(|_| "invalid image redirect URL")?;
    validate_http_target(&target, policy)?;
    Ok(target)
}
pub(crate) async fn fetch_http_with_policy(
    source: &str,
    connect_timeout: Duration,
    total_timeout: Duration,
    policy: NetworkPolicy,
) -> Result<Download, String> {
    let initial = Url::parse(source).map_err(|_| "invalid image URL")?;
    let operation = async {
        let mut url = initial;
        let mut redirects = 0usize;
        loop {
            let prepared = prepare_http_hop_with_resolver(
                url,
                connect_timeout,
                total_timeout,
                policy,
                |host, port| async move {
                    tokio::net::lookup_host((host.as_str(), port))
                        .await
                        .map(|addresses| addresses.collect())
                        .map_err(|e| e.to_string())
                },
            )
            .await?;
            let request = build_request_for_url(&prepared.client, prepared.url, policy)?;
            let mut response = prepared
                .client
                .execute(request)
                .await
                .map_err(|e| format!("image download failed: {e}"))?;
            if is_followable_redirect(response.status()) {
                if redirects >= 5 {
                    return Err("image redirect limit exceeded".into());
                }
                let location = response
                    .headers()
                    .get(LOCATION)
                    .and_then(|v| v.to_str().ok())
                    .ok_or("image redirect missing Location")?;
                url = resolve_redirect_target(response.url(), location, policy)?;
                redirects += 1;
                continue;
            }
            if !response.status().is_success() {
                return Err(format!("image server returned HTTP {}", response.status()));
            }
            if response
                .content_length()
                .is_some_and(|n| n > MAX_SOURCE_BYTES as u64)
            {
                return Err("image exceeds 15 MiB limit".into());
            }
            let final_url = response.url().clone();
            let content_type = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);
            let file_name = response
                .headers()
                .get(CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .and_then(disposition_filename)
                .or_else(|| {
                    final_url
                        .path_segments()
                        .and_then(Iterator::last)
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                });
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|e| format!("image download failed: {e}"))?
            {
                if bytes.len().saturating_add(chunk.len()) > MAX_SOURCE_BYTES {
                    return Err("image exceeds 15 MiB limit".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            identify_image(&bytes, content_type.as_deref())?;
            return Ok(Download {
                bytes,
                content_type,
                file_name,
            });
        }
    };
    tokio::time::timeout(total_timeout, operation)
        .await
        .map_err(|_| "image download timed out".to_string())?
}
#[cfg(test)]
pub(crate) async fn fetch_http_with_timeouts(
    source: &str,
    connect_timeout: Duration,
    total_timeout: Duration,
) -> Result<Download, String> {
    fetch_http_with_policy(
        source,
        connect_timeout,
        total_timeout,
        NetworkPolicy::AllowLocalForTests,
    )
    .await
}
