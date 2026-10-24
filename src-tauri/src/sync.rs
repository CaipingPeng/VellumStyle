use crate::config::{load_sync_config, SyncConfig};
use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const NUTSTORE_DAV_ROOT: &str = "https://dav.jianguoyun.com/dav";
const MANIFEST_NAME: &str = ".vellumstyle-sync.json";
const LOCAL_STATE_NAME: &str = "sync-state.json";
const THEME_METADATA_PREFIX: &str = ".vellumstyle-theme-map";
static SYNC_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

struct DavClient {
    http: Client,
    root: String,
    collections: tokio::sync::Mutex<BTreeSet<String>>,
}

impl DavClient {
    fn new(root: &str) -> Result<Self, String> {
        let builder = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30));
        #[cfg(test)]
        let builder = if root.starts_with("http://127.0.0.1:") {
            builder.no_proxy()
        } else {
            builder
        };
        Ok(Self {
            http: builder.build().map_err(|e| e.to_string())?,
            root: root.trim_end_matches('/').into(),
            collections: tokio::sync::Mutex::new(BTreeSet::new()),
        })
    }
    fn url(&self, remote_dir: &str, path: &str) -> String {
        remote_url(remote_dir, path).replacen(NUTSTORE_DAV_ROOT, &self.root, 1)
    }
    fn collection_url(&self, path: &str) -> String {
        remote_collection_url(path).replacen(NUTSTORE_DAV_ROOT, &self.root, 1)
    }
}

impl std::ops::Deref for DavClient {
    type Target = Client;
    fn deref(&self) -> &Client {
        &self.http
    }
}

fn http_error(operation: &str, status: StatusCode) -> String {
    let hint = match status.as_u16() {
        401 | 403 => "，请检查账号、第三方应用授权密码和目录权限",
        429 => "，坚果云请求限流，请稍后再同步",
        507 => "，云端存储空间不足",
        412 => "，云端内容已被其他设备更新，请重新同步",
        _ => "",
    };
    format!("{operation}：HTTP {}{hint}", status.as_u16())
}

// Only idempotent WebDAV operations use this helper. Bound every attempt and
// respect Retry-After; a long server cooldown is reported instead of holding the UI.
async fn send_dav(request: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
    for attempt in 0..3u32 {
        let next = request.try_clone().ok_or("无法重试 WebDAV 请求")?;
        match next.send().await {
            Ok(response) => {
                let retry = matches!(response.status().as_u16(), 429 | 502 | 503 | 504);
                if !retry || attempt == 2 {
                    return Ok(response);
                }
                let delay = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(1 << attempt);
                if delay > 5 {
                    return Err(http_error("云同步暂不可用，请稍后重试", response.status()));
                }
                drop(response);
                tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
            }
            Err(error) => {
                if attempt == 2 || !(error.is_timeout() || error.is_connect()) {
                    return Err(format!("云同步网络请求失败：{}", error.without_url()));
                }
                tokio::time::sleep(std::time::Duration::from_secs(1 << attempt)).await;
            }
        }
    }
    unreachable!()
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct SyncIndex {
    #[serde(default)]
    scope: String,
    #[serde(default)]
    files: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRunSummary {
    enabled: bool,
    synced_at: Option<i64>,
    uploaded: usize,
    downloaded: usize,
    deleted_local: usize,
    deleted_remote: usize,
    conflicts: usize,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConnectionTestResult {
    ok: bool,
    message: String,
}

impl SyncRunSummary {
    fn disabled(message: impl Into<String>) -> Self {
        Self {
            enabled: false,
            synced_at: None,
            uploaded: 0,
            downloaded: 0,
            deleted_local: 0,
            deleted_remote: 0,
            conflicts: 0,
            message: message.into(),
        }
    }

    fn enabled(message: impl Into<String>) -> Self {
        Self {
            enabled: true,
            synced_at: Some(now_millis()),
            uploaded: 0,
            downloaded: 0,
            deleted_local: 0,
            deleted_remote: 0,
            conflicts: 0,
            message: message.into(),
        }
    }
}

pub fn classify_connection_status(status: StatusCode) -> Result<&'static str, String> {
    if status.is_success() || status == StatusCode::MULTI_STATUS {
        return Ok("连接成功");
    }
    if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
        return Err("账号或应用密码不正确，请确认坚果云第三方应用授权密码。".into());
    }
    Err(format!("坚果云连接失败：HTTP {}", status.as_u16()))
}

pub fn normalize_remote_dir(remote_dir: &str) -> String {
    let normalized = remote_dir
        .trim()
        .trim_matches('/')
        .trim_matches('\\')
        .trim();
    if normalized.is_empty() {
        "VellumStyle".into()
    } else {
        normalized.replace('\\', "/")
    }
}

pub fn content_fingerprint(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}-{}", hash, bytes.len())
}

pub fn conflict_path(path: &str, timestamp: &str) -> String {
    let slash = path.rfind('/');
    let (dir, name) = match slash {
        Some(index) => (&path[..=index], &path[index + 1..]),
        None => ("", path),
    };
    let dot = name.rfind('.');
    match dot {
        Some(index) => format!(
            "{dir}{} (坚果云冲突 {timestamp}){}",
            &name[..index],
            &name[index..]
        ),
        None => format!("{dir}{name} (坚果云冲突 {timestamp})"),
    }
}

#[tauri::command]
pub async fn sync_documents(app: AppHandle) -> Result<SyncRunSummary, String> {
    let _guard = SYNC_LOCK
        .get_or_init(|| tokio::sync::Mutex::new(()))
        .lock()
        .await;
    let cfg = load_sync_config(&app)?;
    if !cfg.enabled {
        return Ok(SyncRunSummary::disabled("同步未启用"));
    }
    if !cfg.is_configured() {
        return Ok(SyncRunSummary::disabled("同步配置不完整"));
    }
    if cfg.provider != "nutstore" {
        return Err("暂不支持当前同步服务".into());
    }

    let remote_dir = normalize_remote_dir(&cfg.remote_dir);
    let scope = format!("{}:{}:{}", cfg.provider, cfg.username.trim(), remote_dir);
    let client = DavClient::new(NUTSTORE_DAV_ROOT)?;
    let documents = documents_dir(&app)?;
    let state_path = sync_state_path(&app)?;
    let mut summary = SyncRunSummary::enabled("同步完成");

    std::fs::create_dir_all(&documents).map_err(|e| format!("创建文档目录失败：{e}"))?;
    ensure_remote_collection(&client, &cfg, &remote_dir).await?;

    sync_with_client(
        &client,
        &cfg,
        &remote_dir,
        &scope,
        &documents,
        &state_path,
        &mut summary,
    )
    .await?;
    Ok(summary)
}

async fn sync_with_client(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    scope: &str,
    documents: &Path,
    state_path: &Path,
    summary: &mut SyncRunSummary,
) -> Result<(), String> {
    let (mut remote_index, etag, exists) =
        load_remote_index(client, cfg, remote_dir, scope).await?;
    for path in remote_index.files.keys() {
        resolve_local_path(documents, path)?;
        if !is_syncable_path(path) {
            return Err("云端同步索引包含不支持的文件类型".into());
        }
    }
    // A missing manifest is a new remote, never evidence that every file was deleted.
    let local_state = if exists {
        load_local_index(state_path, scope)
    } else {
        SyncIndex {
            scope: scope.into(),
            files: BTreeMap::new(),
        }
    };
    let local_files = scan_local_files(&documents)?;
    let local_hashes: BTreeMap<String, String> = local_files
        .iter()
        .map(|(path, bytes)| (path.clone(), content_fingerprint(bytes)))
        .collect();

    let mut paths = BTreeSet::new();
    paths.extend(local_hashes.keys().cloned());
    paths.extend(remote_index.files.keys().cloned());
    paths.extend(local_state.files.keys().cloned());

    let mut final_files = BTreeMap::new();
    let timestamp = timestamp_label();

    for path in paths {
        let local_hash = local_hashes.get(&path);
        let remote_hash = remote_index.files.get(&path);
        let base_hash = local_state.files.get(&path);

        match (local_hash, remote_hash) {
            (Some(local), Some(remote)) if local == remote => {
                final_files.insert(path, local.clone());
            }
            (Some(local), Some(remote)) => {
                let local_changed = base_hash.map(|base| base != local).unwrap_or(true);
                let remote_changed = base_hash.map(|base| base != remote).unwrap_or(true);

                if local_changed && !remote_changed {
                    upload_remote_file(&client, &cfg, &remote_dir, &path, &local_files[&path])
                        .await?;
                    summary.uploaded += 1;
                    final_files.insert(path, local.clone());
                } else if !local_changed && remote_changed {
                    let bytes = download_remote_file(&client, &cfg, &remote_dir, &path).await?;
                    apply_download(
                        client,
                        cfg,
                        remote_dir,
                        documents,
                        &path,
                        &bytes,
                        local_files.get(&path),
                        &timestamp,
                        summary,
                        &mut final_files,
                    )
                    .await?;
                    summary.downloaded += 1;
                    final_files.insert(path, content_fingerprint(&bytes));
                } else {
                    let bytes = download_remote_file(&client, &cfg, &remote_dir, &path).await?;
                    let conflict = unique_conflict_path(&documents, &path, &timestamp)?;
                    write_local_file(&documents, &conflict, &bytes)?;
                    upload_remote_file(&client, &cfg, &remote_dir, &path, &local_files[&path])
                        .await?;
                    upload_remote_file(&client, &cfg, &remote_dir, &conflict, &bytes).await?;
                    summary.uploaded += 2;
                    summary.downloaded += 1;
                    summary.conflicts += 1;
                    final_files.insert(path, local.clone());
                    final_files.insert(conflict, content_fingerprint(&bytes));
                }
            }
            (Some(local), None) => {
                if base_hash.map(|base| base == local).unwrap_or(false) {
                    // Editing can continue while the network is busy. Never delete a
                    // file that changed after the local snapshot was taken.
                    if local_matches_snapshot(documents, &path, local_files.get(&path))? {
                        delete_local_file(&documents, &path)?;
                        summary.deleted_local += 1;
                    }
                } else {
                    upload_remote_file(&client, &cfg, &remote_dir, &path, &local_files[&path])
                        .await?;
                    summary.uploaded += 1;
                    final_files.insert(path, local.clone());
                    if base_hash.is_some() {
                        summary.conflicts += 1;
                    }
                }
            }
            (None, Some(remote)) => {
                if base_hash.map(|base| base == remote).unwrap_or(false) {
                    delete_remote_file(&client, &cfg, &remote_dir, &path).await?;
                    summary.deleted_remote += 1;
                } else {
                    let bytes = download_remote_file(&client, &cfg, &remote_dir, &path).await?;
                    apply_download(
                        client,
                        cfg,
                        remote_dir,
                        documents,
                        &path,
                        &bytes,
                        None,
                        &timestamp,
                        summary,
                        &mut final_files,
                    )
                    .await?;
                    summary.downloaded += 1;
                    if base_hash.is_some() {
                        summary.conflicts += 1;
                    }
                    final_files.insert(path, content_fingerprint(&bytes));
                }
            }
            (None, None) => {}
        }
    }

    let changed = remote_index.files != final_files;
    remote_index.scope = scope.to_string();
    remote_index.files = final_files.clone();
    if changed || !exists {
        save_remote_index(
            client,
            cfg,
            remote_dir,
            &remote_index,
            etag.as_deref(),
            exists,
        )
        .await?;
    }
    save_local_index(
        state_path,
        &SyncIndex {
            scope: scope.to_string(),
            files: final_files,
        },
    )?;

    if summary.conflicts > 0 {
        summary.message = format!("同步完成，发现 {} 个冲突", summary.conflicts);
    }
    Ok(())
}

fn local_matches_snapshot(
    base: &Path,
    path: &str,
    snapshot: Option<&Vec<u8>>,
) -> Result<bool, String> {
    match std::fs::read(resolve_local_path(base, path)?) {
        Ok(current) => Ok(snapshot.map(|bytes| *bytes == current).unwrap_or(false)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(snapshot.is_none()),
        Err(e) => Err(format!("检查本地文件失败：{e}")),
    }
}

async fn apply_download(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    base: &Path,
    path: &str,
    bytes: &[u8],
    snapshot: Option<&Vec<u8>>,
    timestamp: &str,
    summary: &mut SyncRunSummary,
    final_files: &mut BTreeMap<String, String>,
) -> Result<(), String> {
    if local_matches_snapshot(base, path, snapshot)? {
        write_local_file(base, path, bytes)
    } else {
        let conflict = unique_conflict_path(base, path, timestamp)?;
        write_local_file(base, &conflict, bytes)?;
        upload_remote_file(client, cfg, remote_dir, &conflict, bytes).await?;
        final_files.insert(conflict, content_fingerprint(bytes));
        summary.conflicts += 1;
        summary.uploaded += 1;
        Ok(())
    }
}

#[tauri::command]
pub async fn test_sync_connection(
    _app: AppHandle,
    provider: String,
    username: String,
    password: String,
    remote_dir: String,
) -> Result<SyncConnectionTestResult, String> {
    let cfg = SyncConfig {
        enabled: true,
        provider: provider.trim().to_string(),
        username: username.trim().to_string(),
        password: password.trim().to_string(),
        remote_dir: normalize_remote_dir(&remote_dir),
    };
    if !cfg.is_configured() {
        return Err("请先填写坚果云账号和应用密码。".into());
    }

    let client = DavClient::new(NUTSTORE_DAV_ROOT)?;
    let resp = send_dav(
        client
            .request(
                Method::from_bytes(b"PROPFIND")
                    .map_err(|e| format!("构造 WebDAV 请求失败：{e}"))?,
                client.collection_url(""),
            )
            .header("Depth", "0")
            .basic_auth(cfg.username.trim(), Some(cfg.password.trim())),
    )
    .await?;
    let message = classify_connection_status(resp.status())?;
    Ok(SyncConnectionTestResult {
        ok: true,
        message: message.into(),
    })
}

fn documents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::storage::data_path(app, "documents")?)
}

fn sync_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    crate::storage::data_path(app, LOCAL_STATE_NAME)
}

fn load_local_index(path: &Path, scope: &str) -> SyncIndex {
    let Ok(text) = std::fs::read_to_string(path) else {
        return SyncIndex {
            scope: scope.into(),
            files: BTreeMap::new(),
        };
    };
    let Ok(index) = serde_json::from_str::<SyncIndex>(&text) else {
        return SyncIndex {
            scope: scope.into(),
            files: BTreeMap::new(),
        };
    };
    if index.scope == scope {
        index
    } else {
        SyncIndex {
            scope: scope.into(),
            files: BTreeMap::new(),
        }
    }
}

fn save_local_index(path: &Path, index: &SyncIndex) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "无法定位同步状态目录".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| format!("创建同步状态目录失败：{e}"))?;
    let text =
        serde_json::to_string_pretty(index).map_err(|e| format!("序列化同步状态失败：{e}"))?;
    crate::atomic_file::write(path, text.as_bytes()).map_err(|e| format!("写入同步状态失败：{e}"))
}

async fn load_remote_index(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    scope: &str,
) -> Result<(SyncIndex, Option<String>, bool), String> {
    let url = client.url(remote_dir, MANIFEST_NAME);
    let resp = send_dav(
        client
            .get(url)
            .basic_auth(cfg.username.trim(), Some(cfg.password.trim())),
    )
    .await?;

    if resp.status() == StatusCode::NOT_FOUND {
        return Ok((
            SyncIndex {
                scope: scope.into(),
                files: BTreeMap::new(),
            },
            None,
            false,
        ));
    }
    if !resp.status().is_success() {
        return Err(http_error("读取云端同步索引失败", resp.status()));
    }

    let etag = resp
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取云端同步索引失败：{e}"))?;
    let index = serde_json::from_slice::<SyncIndex>(&bytes)
        .map_err(|e| format!("解析云端同步索引失败：{e}"))?;
    if index.scope == scope {
        Ok((index, etag, true))
    } else {
        Err("云端目录属于另一同步配置，请使用独立目录，避免混合数据".into())
    }
}

async fn save_remote_index(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    index: &SyncIndex,
    etag: Option<&str>,
    exists: bool,
) -> Result<(), String> {
    let text =
        serde_json::to_vec_pretty(index).map_err(|e| format!("序列化云端同步索引失败：{e}"))?;
    let mut request = client
        .put(client.url(remote_dir, MANIFEST_NAME))
        .basic_auth(cfg.username.trim(), Some(cfg.password.trim()))
        .body(text);
    if let Some(etag) = etag {
        request = request.header(reqwest::header::IF_MATCH, etag);
    } else if !exists {
        request = request.header(reqwest::header::IF_NONE_MATCH, "*");
    }
    // A conditional manifest write must not be retried after an ambiguous timeout:
    // the first write may have succeeded and changed its ETag.
    let response = request
        .send()
        .await
        .map_err(|e| format!("保存云端索引失败：{}", e.without_url()))?;
    if !response.status().is_success() {
        return Err(http_error("保存云端索引失败", response.status()));
    }
    Ok(())
}

fn scan_local_files(base: &Path) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut files = BTreeMap::new();
    scan_local_dir(base, base, &mut files)?;
    Ok(files)
}

fn scan_local_dir(
    base: &Path,
    dir: &Path,
    files: &mut BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => return Err(format!("读取本地文档目录失败：{e}")),
    };

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取本地目录项失败：{e}"))?;
        if entry.file_type().map_err(|e| e.to_string())?.is_symlink() {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            scan_local_dir(base, &path, files)?;
            continue;
        }
        let is_md = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("md"))
            .unwrap_or(false);
        let is_theme_metadata = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(is_theme_metadata_file)
            .unwrap_or(false);
        if !is_md && !is_theme_metadata {
            continue;
        }
        let rel = rel_path(base, &path);
        let bytes = std::fs::read(&path).map_err(|e| format!("读取本地文档失败：{e}"))?;
        files.insert(rel, bytes);
    }
    Ok(())
}

fn is_theme_metadata_file(name: &str) -> bool {
    if name == ".vellumstyle-layout-map.json"
        || (name.starts_with(".vellumstyle-layout-map (坚果云冲突 ") && name.ends_with(".json"))
    {
        return true;
    }
    name == format!("{THEME_METADATA_PREFIX}.json")
        || (name.starts_with(&format!("{THEME_METADATA_PREFIX} (坚果云冲突 "))
            && name.ends_with(".json"))
}

fn resolve_local_path(base: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() {
        return Err("云端路径非法".into());
    }
    crate::safe_path::resolve(base, rel)
}

fn is_syncable_path(path: &str) -> bool {
    let path = Path::new(path);
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
        || path
            .file_name()
            .and_then(|n| n.to_str())
            .map(is_theme_metadata_file)
            .unwrap_or(false)
}

fn write_local_file(base: &Path, rel: &str, bytes: &[u8]) -> Result<(), String> {
    let full = resolve_local_path(base, rel)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建本地目录失败：{e}"))?;
    }
    crate::atomic_file::write(&full, bytes).map_err(|e| format!("写入本地文档失败：{e}"))
}

fn delete_local_file(base: &Path, rel: &str) -> Result<(), String> {
    let full = resolve_local_path(base, rel)?;
    if full.exists() {
        std::fs::remove_file(&full).map_err(|e| format!("删除本地文档失败：{e}"))?;
    }
    Ok(())
}

fn unique_conflict_path(base: &Path, path: &str, timestamp: &str) -> Result<String, String> {
    let first = conflict_path(path, timestamp);
    if !resolve_local_path(base, &first)?.exists() {
        return Ok(first);
    }
    for index in 2..1000 {
        let candidate = conflict_path(path, &format!("{timestamp}-{index}"));
        if !resolve_local_path(base, &candidate)?.exists() {
            return Ok(candidate);
        }
    }
    Err("无法生成冲突副本文件名".into())
}

async fn ensure_remote_collection(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
) -> Result<(), String> {
    let mut current = String::new();
    for seg in split_remote_path(remote_dir) {
        current = if current.is_empty() {
            seg
        } else {
            format!("{current}/{seg}")
        };
        if client.collections.lock().await.contains(&current) {
            continue;
        }
        let resp = send_dav(
            client
                .request(
                    Method::from_bytes(b"MKCOL")
                        .map_err(|e| format!("构造 WebDAV 请求失败：{e}"))?,
                    client.collection_url(&current),
                )
                .basic_auth(cfg.username.trim(), Some(cfg.password.trim())),
        )
        .await?;
        if !matches!(
            resp.status(),
            StatusCode::CREATED | StatusCode::OK | StatusCode::METHOD_NOT_ALLOWED
        ) {
            return Err(http_error("创建云端目录失败", resp.status()));
        }
        client.collections.lock().await.insert(current.clone());
    }
    Ok(())
}

async fn upload_remote_file(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    path: &str,
    bytes: &[u8],
) -> Result<(), String> {
    ensure_remote_parent_dirs(client, cfg, remote_dir, path).await?;
    put_remote_bytes(client, cfg, remote_dir, path, bytes.to_vec()).await
}

async fn put_remote_bytes(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    path: &str,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let resp = send_dav(
        client
            .put(client.url(remote_dir, path))
            .basic_auth(cfg.username.trim(), Some(cfg.password.trim()))
            .body(bytes),
    )
    .await?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(http_error("上传云端文档失败", resp.status()))
    }
}

async fn download_remote_file(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    path: &str,
) -> Result<Vec<u8>, String> {
    let resp = send_dav(
        client
            .get(client.url(remote_dir, path))
            .basic_auth(cfg.username.trim(), Some(cfg.password.trim())),
    )
    .await?;
    if !resp.status().is_success() {
        return Err(http_error("下载云端文档失败", resp.status()));
    }
    Ok(resp
        .bytes()
        .await
        .map_err(|e| format!("下载云端文档失败：{e}"))?
        .to_vec())
}

async fn delete_remote_file(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    path: &str,
) -> Result<(), String> {
    let resp = send_dav(
        client
            .delete(client.url(remote_dir, path))
            .basic_auth(cfg.username.trim(), Some(cfg.password.trim())),
    )
    .await?;
    if resp.status().is_success() || resp.status() == StatusCode::NOT_FOUND {
        Ok(())
    } else {
        Err(http_error("删除云端文档失败", resp.status()))
    }
}

async fn ensure_remote_parent_dirs(
    client: &DavClient,
    cfg: &SyncConfig,
    remote_dir: &str,
    path: &str,
) -> Result<(), String> {
    let Some(index) = path.rfind('/') else {
        return Ok(());
    };
    ensure_remote_collection(client, cfg, &format!("{remote_dir}/{}", &path[..index])).await
}

fn remote_url(remote_dir: &str, path: &str) -> String {
    let mut parts = split_remote_path(remote_dir);
    parts.extend(split_remote_path(path));
    let encoded = parts
        .into_iter()
        .map(|part| urlencoding::encode(&part).into_owned())
        .collect::<Vec<_>>()
        .join("/");
    format!("{}/{}", NUTSTORE_DAV_ROOT.trim_end_matches('/'), encoded)
}

fn remote_collection_url(path: &str) -> String {
    let mut url = remote_url("", path);
    if !url.ends_with('/') {
        url.push('/');
    }
    url
}

fn split_remote_path(path: &str) -> Vec<String> {
    path.split(['/', '\\'])
        .filter(|part| !part.is_empty() && *part != "." && *part != "..")
        .map(ToOwned::to_owned)
        .collect()
}

fn rel_path(base: &Path, full: &Path) -> String {
    full.strip_prefix(base)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn timestamp_label() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64 + 8 * 60 * 60)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let seconds = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds / 3600;
    let minute = (seconds % 3600) / 60;
    let second = seconds % 60;
    format!("{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}")
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096).div_euclid(365);
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2).div_euclid(153);
    let d = doy - (153 * mp + 2).div_euclid(5) + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year, m, d)
}

#[cfg(test)]
mod integration_tests;

#[cfg(test)]
mod tests {
    use super::{
        classify_connection_status, conflict_path, content_fingerprint, is_theme_metadata_file,
        normalize_remote_dir, scan_local_files,
    };
    use reqwest::StatusCode;

    #[test]
    fn normalizes_remote_dir_without_outer_slashes() {
        assert_eq!(normalize_remote_dir(" /VellumStyle/ "), "VellumStyle");
        assert_eq!(normalize_remote_dir(""), "VellumStyle");
    }

    #[test]
    fn content_fingerprint_is_stable_and_content_sensitive() {
        assert_eq!(content_fingerprint(b"abc"), content_fingerprint(b"abc"));
        assert_ne!(content_fingerprint(b"abc"), content_fingerprint(b"abcd"));
    }

    #[test]
    fn conflict_path_keeps_extension_and_parent_dir() {
        assert_eq!(
            conflict_path("项目/周报.md", "20260614-090800"),
            "项目/周报 (坚果云冲突 20260614-090800).md"
        );
        assert_eq!(
            conflict_path("无扩展", "20260614-090800"),
            "无扩展 (坚果云冲突 20260614-090800)"
        );
    }

    #[test]
    fn theme_metadata_and_its_conflicts_are_syncable_but_other_json_is_not() {
        assert!(is_theme_metadata_file(".vellumstyle-theme-map.json"));
        assert!(is_theme_metadata_file(
            ".vellumstyle-theme-map (坚果云冲突 20260724-120000).json"
        ));
        assert!(!is_theme_metadata_file("theme.json"));
        assert!(!is_theme_metadata_file(
            ".vellumstyle-theme-map.backup.json"
        ));
    }

    #[test]
    fn local_scan_includes_theme_metadata_without_exposing_arbitrary_json() {
        let root =
            std::env::temp_dir().join(format!("vellumstyle-sync-theme-map-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("article.md"), "# article").unwrap();
        std::fs::write(root.join(".vellumstyle-theme-map.json"), "{}").unwrap();
        std::fs::write(root.join("theme.json"), "{}").unwrap();

        let files = scan_local_files(&root).unwrap();
        assert!(files.contains_key("article.md"));
        assert!(files.contains_key(".vellumstyle-theme-map.json"));
        assert!(!files.contains_key("theme.json"));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn classify_connection_status_distinguishes_credentials_from_service_errors() {
        assert_eq!(
            classify_connection_status(StatusCode::MULTI_STATUS).unwrap(),
            "连接成功"
        );
        assert_eq!(
            classify_connection_status(StatusCode::OK).unwrap(),
            "连接成功"
        );

        assert!(classify_connection_status(StatusCode::UNAUTHORIZED)
            .unwrap_err()
            .contains("账号或应用密码不正确"));
        assert!(classify_connection_status(StatusCode::FORBIDDEN)
            .unwrap_err()
            .contains("账号或应用密码不正确"));
        assert!(
            classify_connection_status(StatusCode::INTERNAL_SERVER_ERROR)
                .unwrap_err()
                .contains("HTTP 500")
        );
    }
}
