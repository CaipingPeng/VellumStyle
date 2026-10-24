use std::path::{Path, PathBuf};

/// Reject portable traversal (including Windows prefixes on other platforms), and
/// inspect existing ancestors so a symlink cannot escape through a new child.
pub fn resolve(base: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.starts_with(['/', '\\']) {
        return Err("非法路径".into());
    }
    let mut full = base.to_path_buf();
    for part in relative.split(['/', '\\']).filter(|p| !p.is_empty()) {
        if part == "."
            || part == ".."
            || part.contains(':')
            || part.chars().any(char::is_control)
            || part.ends_with(['.', ' '])
        {
            return Err("非法路径".into());
        }
        full.push(part);
    }
    if base.exists() {
        let canonical_base = std::fs::canonicalize(base).map_err(|e| e.to_string())?;
        let mut ancestor = full.as_path();
        while !ancestor.exists() {
            ancestor = ancestor.parent().ok_or("非法路径")?;
        }
        let canonical = std::fs::canonicalize(ancestor).map_err(|e| e.to_string())?;
        if !canonical.starts_with(canonical_base) {
            return Err("非法路径".into());
        }
    }
    Ok(full)
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_cross_platform_escape_paths() {
        let base = std::env::temp_dir();
        for path in [
            "../x",
            "a/../b",
            "C:/secret",
            "/secret",
            "\\\\server\\secret",
            "a:stream",
            "a./b",
            "a /b",
        ] {
            assert!(super::resolve(&base, path).is_err(), "{path}");
        }
        assert_eq!(
            super::resolve(&base, "中文/文章.md").unwrap(),
            base.join("中文/文章.md")
        );
    }
}
