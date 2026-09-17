use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

// 同目录替换，写入或同步失败时保留原文件。
pub(crate) fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| std::io::Error::other("missing parent"))?;
    let temp = parent.join(format!(".vs-write-{}-{}.tmp", std::process::id(), SEQUENCE.fetch_add(1, Ordering::Relaxed)));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if result.is_err() { let _ = std::fs::remove_file(&temp); }
    result
}

#[cfg(test)]
mod tests {
    #[test]
    fn replaces_existing_content_and_preserves_target_on_failure() {
        let dir = std::env::temp_dir().join(format!("vs-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("article.md");
        super::write(&path, b"old").unwrap();
        super::write(&path, b"new").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert!(super::write(&dir, b"bad").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
