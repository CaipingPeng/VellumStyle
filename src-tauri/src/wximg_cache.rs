// wximg 预览图的磁盘缓存。
//
// 为什么需要：预览里的图片走 `wximg://` 自定义协议，响应虽然带了
// `Cache-Control: max-age=86400`，但**自定义协议的响应不会落进 WebView 的磁盘缓存**，
// 所以重启应用后所有 mmbiz 图都要重新拉一遍 —— 弱网下就是"每次打开都要等图重新加载"。
//
// 设计取舍：
// - 落盘在 `app_data_dir/cache/wximg/`，与应用其它数据分开，用户可以直接删目录清缓存。
// - 文件名 = URL 的 FNV-1a 哈希（与 `history.rs` 同一套算法，保证工具链升级后仍能命中旧文件）。
// - 文件自带头部（magic + content_type + 原始 URL），读取时**校验 URL 是否一致**，
//   哈希碰撞时当作未命中，避免把 A 图当成 B 图返回。
// - 写入后按总字节数淘汰最旧的条目，避免无限增长。
//
// 缓存是可选的加速层：任何一步失败都只是"退化成没有缓存"，绝不能影响取图本身，
// 因此这里所有函数都不返回错误，失败即静默放弃。

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

/// 缓存总量上限。预览图多为几百 KB，256MB 大致能放上千张。
const MAX_CACHE_BYTES: u64 = 256 * 1024 * 1024;
/// 单张超过这个大小就不缓存（协议侧 MAX_PROXY_BYTES 是 15MB）。
const MAX_ENTRY_BYTES: usize = 8 * 1024 * 1024;
/// 头部标识，用于识别并兼容未来的格式变更。
const HEADER_MAGIC: &str = "VSWXIMG1";
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// 与 `history.rs` 相同的固定 FNV-1a：不依赖 `DefaultHasher` 的实现细节，
/// 应用或 Rust 工具链升级后仍能命中旧缓存。
pub fn cache_key(url: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in url.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

/// 组装缓存文件内容：`magic\ncontent_type\nurl\n` + 原始字节。
pub fn encode_entry(content_type: &str, url: &str, bytes: &[u8]) -> Vec<u8> {
    let header = format!("{HEADER_MAGIC}\n{content_type}\n{url}\n");
    let mut out = Vec::with_capacity(header.len() + bytes.len());
    out.extend_from_slice(header.as_bytes());
    out.extend_from_slice(bytes);
    out
}

/// 解析缓存文件内容。magic 不符或 URL 对不上（哈希碰撞）时返回 None。
pub fn decode_entry(raw: &[u8], expected_url: &str) -> Option<(String, Vec<u8>)> {
    let mut lines = raw.splitn(4, |byte| *byte == b'\n');
    let magic = lines.next()?;
    if magic != HEADER_MAGIC.as_bytes() {
        return None;
    }
    let content_type = std::str::from_utf8(lines.next()?).ok()?;
    let url = std::str::from_utf8(lines.next()?).ok()?;
    if url != expected_url {
        return None;
    }
    let bytes = lines.next()?.to_vec();
    Some((content_type.to_string(), bytes))
}

/// URL 是否适合当缓存键：含控制字符会破坏头部行结构，直接不缓存。
fn cacheable_url(url: &str) -> bool {
    !url.is_empty() && !url.contains(['\n', '\r'])
}

pub struct WximgCache {
    dir: PathBuf,
}

impl WximgCache {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// 命中则返回 (content_type, bytes)。任何异常都当作未命中。
    pub async fn get(&self, url: &str) -> Option<(String, Vec<u8>)> {
        if !cacheable_url(url) {
            return None;
        }
        let raw = tokio::fs::read(self.path_for(url)).await.ok()?;
        decode_entry(&raw, url)
    }

    /// 写入缓存。超过单张上限或写失败都静默跳过。
    pub async fn put(&self, url: &str, content_type: &str, bytes: &[u8]) {
        if !cacheable_url(url) || bytes.len() > MAX_ENTRY_BYTES {
            return;
        }
        if tokio::fs::create_dir_all(&self.dir).await.is_err() {
            return;
        }
        let payload = encode_entry(content_type, url, bytes);
        // 先写临时文件再 rename，避免进程中途退出留下半截文件被当成有效缓存。
        // 每次写入独立临时文件，同一 URL 的并发请求不能相互截断或删除。
        let temp = self.dir.join(format!(
            "{}.{}-{}.tmp",
            cache_key(url),
            std::process::id(),
            TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        if tokio::fs::write(&temp, &payload).await.is_err() {
            let _ = tokio::fs::remove_file(&temp).await;
            return;
        }
        if tokio::fs::rename(&temp, self.path_for(url)).await.is_err() {
            let _ = tokio::fs::remove_file(&temp).await;
            return;
        }
        self.evict(MAX_CACHE_BYTES).await;
    }

    fn path_for(&self, url: &str) -> PathBuf {
        self.dir.join(format!("{}.img", cache_key(url)))
    }

    /// 写入后的目录已经包含新条目，不再重复计入本次写入大小。
    async fn evict(&self, max_bytes: u64) {
        let Ok(mut entries) = tokio::fs::read_dir(&self.dir).await else {
            return;
        };
        let mut files: Vec<(SystemTime, PathBuf, u64)> = Vec::new();
        let mut total = 0_u64;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            // 临时文件可能还在写入中，不参与容量统计和淘汰。
            if path.extension().and_then(|ext| ext.to_str()) != Some("img") {
                continue;
            }
            let Ok(meta) = entry.metadata().await else {
                continue;
            };
            if !meta.is_file() {
                continue;
            }
            total += meta.len();
            let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            files.push((modified, path, meta.len()));
        }
        if total <= max_bytes {
            return;
        }
        files.sort_by_key(|(modified, _, _)| *modified);
        for (_, path, len) in files {
            if total <= max_bytes {
                break;
            }
            if tokio::fs::remove_file(&path).await.is_ok() {
                total = total.saturating_sub(len);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "vellumstyle-wximg-cache-{tag}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn cache_key_is_stable_and_distinguishes_urls() {
        let a = cache_key("https://mmbiz.qpic.cn/mmbiz_png/aaa/640.png");
        let b = cache_key("https://mmbiz.qpic.cn/mmbiz_png/bbb/640.png");
        assert_eq!(
            a,
            cache_key("https://mmbiz.qpic.cn/mmbiz_png/aaa/640.png"),
            "同一 URL 必须稳定映射到同一文件名（工具链升级后也要能命中旧缓存）"
        );
        assert_ne!(a, b);
        assert_eq!(a.len(), 16, "FNV-1a 64 位输出应为 16 位十六进制");
    }

    #[test]
    fn encode_decode_round_trip() {
        let raw = encode_entry("image/gif", "https://mmbiz.qpic.cn/a.gif", b"GIF89a");
        let (content_type, bytes) =
            decode_entry(&raw, "https://mmbiz.qpic.cn/a.gif").expect("应能解出");
        assert_eq!(content_type, "image/gif");
        assert_eq!(bytes, b"GIF89a");
    }

    #[test]
    fn decode_rejects_url_mismatch_so_a_hash_collision_never_serves_the_wrong_image() {
        let raw = encode_entry("image/png", "https://mmbiz.qpic.cn/a.png", b"\x89PNG");
        assert!(decode_entry(&raw, "https://mmbiz.qpic.cn/other.png").is_none());
    }

    #[test]
    fn decode_rejects_bad_magic_and_truncated_input() {
        assert!(
            decode_entry(b"NOTMAGIC\nimage/png\nhttps://x/y.png\n", "https://x/y.png").is_none(),
            "magic 不符应判为未命中"
        );
        assert!(
            decode_entry(b"VSWXIMG1\nimage/png\n", "https://x/y.png").is_none(),
            "缺 URL 行的半截文件应判为未命中"
        );
        assert!(decode_entry(b"", "https://x/y.png").is_none());
    }

    #[test]
    fn cacheable_url_rejects_empty_and_control_characters() {
        assert!(cacheable_url("https://mmbiz.qpic.cn/a.png"));
        assert!(!cacheable_url(""));
        assert!(!cacheable_url("https://x/a\nb.png"));
        assert!(!cacheable_url("https://x/a\rb.png"));
    }

    #[test]
    fn put_then_get_round_trips_through_disk() {
        let dir = temp_dir("roundtrip");
        let cache = WximgCache::new(dir.clone());
        let url = "https://mmbiz.qpic.cn/mmbiz_png/abc/640.png";
        tauri::async_runtime::block_on(async {
            assert!(cache.get(url).await.is_none(), "首次访问应未命中");
            cache.put(url, "image/png", b"\x89PNG\r\n").await;
            let (content_type, bytes) = cache.get(url).await.expect("写入后应命中");
            assert_eq!(content_type, "image/png");
            assert_eq!(bytes, b"\x89PNG\r\n");
        });
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn oversized_entries_are_not_cached() {
        let dir = temp_dir("oversize");
        let cache = WximgCache::new(dir.clone());
        let url = "https://mmbiz.qpic.cn/huge.png";
        let huge = vec![0_u8; MAX_ENTRY_BYTES + 1];
        tauri::async_runtime::block_on(async {
            cache.put(url, "image/png", &huge).await;
            assert!(cache.get(url).await.is_none(), "超过单张上限不应落盘");
        });
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn uncacheable_url_is_never_written() {
        let dir = temp_dir("badurl");
        let cache = WximgCache::new(dir.clone());
        let url = "https://x/a\nb.png";
        tauri::async_runtime::block_on(async {
            cache.put(url, "image/png", b"x").await;
            assert!(cache.get(url).await.is_none());
        });
        let written = std::fs::read_dir(&dir)
            .map(|entries| entries.count())
            .unwrap_or(0);
        assert_eq!(written, 0, "含换行的 URL 不应产生任何缓存文件");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn concurrent_writes_leave_one_complete_entry() {
        let dir = temp_dir("concurrent");
        let cache = WximgCache::new(dir.clone());
        let url = "https://mmbiz.qpic.cn/concurrent.png";
        tauri::async_runtime::block_on(async {
            let first = vec![1_u8; 256 * 1024];
            let second = vec![2_u8; 128 * 1024];
            tokio::join!(
                cache.put(url, "image/png", &first),
                cache.put(url, "image/png", &second)
            );
            let (_, bytes) = cache.get(url).await.expect("并发写入后应命中");
            assert!(
                bytes == first || bytes == second,
                "缓存不能混合或截断两个写入"
            );
        });
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn eviction_counts_new_entries_once_and_ignores_in_flight_files() {
        let dir = temp_dir("eviction");
        let cache = WximgCache::new(dir.clone());
        tauri::async_runtime::block_on(async {
            tokio::fs::create_dir_all(&dir).await.unwrap();
            for name in ["a.img", "b.img", "c.img", "in-flight.tmp"] {
                tokio::fs::write(dir.join(name), b"1234").await.unwrap();
            }
            cache.evict(8).await;
            let images = std::fs::read_dir(&dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry.path().extension().and_then(|ext| ext.to_str()) == Some("img")
                })
                .count();
            assert_eq!(images, 2, "只淘汰超过预算的那一条");
            assert!(
                dir.join("in-flight.tmp").exists(),
                "不能删除并发写入的临时文件"
            );
        });
        let _ = std::fs::remove_dir_all(&dir);
    }
}
