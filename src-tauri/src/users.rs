//! A desktop process is bound to one authenticated user. Switching requires a restart,
//! so pending IPC, uploads and sync jobs can never acquire a different user's directory.
use argon2::{
    password_hash::{
        rand_core::{OsRng, RngCore},
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct UserSession(pub OnceLock<LocalUser>);
static REGISTRY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalUser {
    pub id: String,
    pub name: String,
    pub owns_legacy_data: bool,
}

#[derive(Serialize, Deserialize)]
struct Account {
    user: LocalUser,
    password_hash: String,
    #[serde(default)]
    migrated: bool,
}

fn root<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录：{e}"))
}

fn read_accounts(root: &Path) -> Result<Vec<Account>, String> {
    match std::fs::read(root.join("users.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "用户列表损坏，请恢复 users.json 备份".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(format!("读取用户列表失败：{e}")),
    }
}

fn write_accounts(root: &Path, accounts: &[Account]) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(accounts).map_err(|e| e.to_string())?;
    crate::atomic_file::write(&root.join("users.json"), &bytes)
        .map_err(|e| format!("保存用户失败：{e}"))
}

fn validate_credentials(name: &str, password: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.chars().count() > 32 || name.chars().any(char::is_control) {
        return Err("用户名须为 1–32 个字符，不能含控制字符".into());
    }
    if !(8..=128).contains(&password.chars().count()) {
        return Err("密码须为 8–128 个字符".into());
    }
    Ok(())
}

fn profile_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
        return Err("非法用户标识".into());
    }
    let dir = crate::safe_path::resolve(root, &format!("profiles/{id}"))?;
    for path in [root.join("profiles"), dir.clone()] {
        if std::fs::symlink_metadata(path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err("用户目录不允许使用符号链接".into());
        }
    }
    Ok(dir)
}

// Each rename is atomic. If interrupted, logging into the first account resumes it.
fn migrate_legacy(root: &Path, target: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for name in [
        "documents",
        "history",
        "trash",
        "templates",
        "themes",
        "backgrounds",
        "cache",
        "config.local.yaml",
        "config.yaml",
        "sync-state.json",
    ] {
        let source = root.join(name);
        if source.exists() {
            let dest = target.join(name);
            if dest.exists() {
                return Err(format!(
                    "迁移旧数据时目标已存在：{name}，请保留两份数据后重试"
                ));
            }
            std::fs::rename(source, dest).map_err(|e| format!("迁移 {name} 失败：{e}"))?;
        }
    }
    Ok(())
}

pub fn current<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<LocalUser, String> {
    app.state::<UserSession>()
        .0
        .get()
        .cloned()
        .ok_or_else(|| "请先登录本机账户".into())
}

pub fn data_dir<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let user = current(app)?;
    profile_dir(&root(app)?, &user.id)
}

pub fn data_path<R: tauri::Runtime>(app: &AppHandle<R>, relative: &str) -> Result<PathBuf, String> {
    crate::safe_path::resolve(&data_dir(app)?, relative)
}

#[tauri::command]
pub fn get_current_user(app: AppHandle) -> Option<LocalUser> {
    current(&app).ok()
}

#[tauri::command]
pub fn get_user_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_local_users(app: AppHandle) -> Result<Vec<LocalUser>, String> {
    let _guard = REGISTRY_LOCK.lock().map_err(|_| "用户列表暂不可用")?;
    Ok(read_accounts(&root(&app)?)?
        .into_iter()
        .map(|a| a.user)
        .collect())
}

fn create_account(root: &Path, name: &str, password: &str) -> Result<LocalUser, String> {
    let name = name.trim();
    validate_credentials(name, &password)?;
    let mut accounts = read_accounts(root)?;
    if accounts
        .iter()
        .any(|a| a.user.name.to_lowercase() == name.to_lowercase())
    {
        return Err("该用户名已存在".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| "无法保护账户密码")?
        .to_string();
    let mut random = [0u8; 16];
    OsRng.fill_bytes(&mut random);
    let id = random
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let user = LocalUser {
        id,
        name: name.into(),
        owns_legacy_data: accounts.is_empty(),
    };
    accounts.push(Account {
        user: user.clone(),
        password_hash,
        migrated: !user.owns_legacy_data,
    });
    write_accounts(root, &accounts)?;
    Ok(user)
}

fn authenticate_account(
    root: &Path,
    id: &str,
    password: &str,
) -> Result<(LocalUser, PathBuf), String> {
    if password.len() > 512 {
        return Err("密码不正确".into());
    }
    let mut accounts = read_accounts(root)?;
    let account = accounts
        .iter_mut()
        .find(|a| a.user.id == id)
        .ok_or("用户不存在")?;
    let hash = PasswordHash::new(&account.password_hash).map_err(|_| "账户密码记录损坏")?;
    Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .map_err(|_| "密码不正确")?;
    let user = account.user.clone();
    let dir = profile_dir(root, &user.id)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !account.migrated {
        migrate_legacy(root, &dir)?;
        account.migrated = true;
        write_accounts(root, &accounts)?;
    }
    Ok((user, dir))
}

#[tauri::command]
pub async fn create_local_user(
    app: AppHandle,
    name: String,
    password: String,
) -> Result<LocalUser, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = REGISTRY_LOCK.lock().map_err(|_| "用户列表暂不可用")?;
        if current(&app).is_ok() {
            return Err("请先切换到登录页再创建用户".into());
        }
        create_account(&root(&app)?, &name, &password)
    })
    .await
    .map_err(|_| "创建用户任务失败")?
}

#[tauri::command]
pub async fn login_local_user(
    app: AppHandle,
    id: String,
    password: String,
) -> Result<LocalUser, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = REGISTRY_LOCK.lock().map_err(|_| "用户列表暂不可用")?;
        if current(&app).is_ok() {
            return Err("切换用户需要重新启动应用".into());
        }
        let (user, dir) = authenticate_account(&root(&app)?, &id, &password)?;
        // Only the authenticated user's background directory is exposed to asset://.
        let backgrounds = crate::safe_path::resolve(&dir, "backgrounds")?;
        std::fs::create_dir_all(&backgrounds).map_err(|e| e.to_string())?;
        app.asset_protocol_scope()
            .allow_directory(backgrounds, true)
            .map_err(|e| e.to_string())?;
        app.state::<UserSession>()
            .0
            .set(user.clone())
            .map_err(|_| "已有用户登录，请重启后切换")?;
        Ok(user)
    })
    .await
    .map_err(|_| "登录任务失败")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registration_login_and_migration_isolate_documents_and_credentials() {
        let root = std::env::temp_dir().join(format!("vs-account-flow-{}", std::process::id()));
        std::fs::create_dir_all(root.join("documents")).unwrap();
        std::fs::write(root.join("documents/article.md"), "legacy private article").unwrap();
        std::fs::write(root.join("config.local.yaml"), "legacy credentials").unwrap();
        let alice = create_account(&root, "Alice", "alice-password").unwrap();
        let bob = create_account(&root, "Bob", "bob-password").unwrap();
        assert!(alice.owns_legacy_data);
        assert!(!bob.owns_legacy_data);
        assert!(create_account(&root, "alice", "other-password").is_err());
        assert!(authenticate_account(&root, &alice.id, "bob-password").is_err());
        let (_, bob_dir) = authenticate_account(&root, &bob.id, "bob-password").unwrap();
        assert!(root.join("documents/article.md").exists());
        assert!(!bob_dir.join("config.local.yaml").exists());
        let (_, alice_dir) = authenticate_account(&root, &alice.id, "alice-password").unwrap();
        assert_eq!(
            std::fs::read_to_string(alice_dir.join("documents/article.md")).unwrap(),
            "legacy private article"
        );
        assert!(alice_dir.join("config.local.yaml").exists());
        assert!(!bob_dir.join("documents/article.md").exists());
        authenticate_account(&root, &alice.id, "alice-password").unwrap(); // repeated login does not migrate twice
        let registry = std::fs::read_to_string(root.join("users.json")).unwrap();
        assert!(!registry.contains("alice-password"));
        assert!(!registry.contains("bob-password"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn passwords_are_salted_and_verified() {
        let hash = Argon2::default()
            .hash_password(b"password-123", &SaltString::generate(&mut OsRng))
            .unwrap()
            .to_string();
        assert!(!hash.contains("password-123"));
        let parsed = PasswordHash::new(&hash).unwrap();
        assert!(Argon2::default()
            .verify_password(b"password-123", &parsed)
            .is_ok());
        assert!(Argon2::default()
            .verify_password(b"wrong", &parsed)
            .is_err());
        assert!(validate_credentials("name", "short").is_err());
        assert!(validate_credentials("", "password-123").is_err());
    }
    #[test]
    fn legacy_migration_is_resumable_and_profiles_are_separate() {
        let root = std::env::temp_dir().join(format!("vs-users-{}", std::process::id()));
        std::fs::create_dir_all(root.join("documents")).unwrap();
        std::fs::write(root.join("documents/article.md"), "private").unwrap();
        let a = profile_dir(&root, "alice").unwrap();
        let b = profile_dir(&root, "bob").unwrap();
        migrate_legacy(&root, &a).unwrap();
        migrate_legacy(&root, &a).unwrap();
        assert!(a.join("documents/article.md").exists());
        assert!(!b.join("documents/article.md").exists());
        assert!(profile_dir(&root, "../alice").is_err());
        assert!(profile_dir(&root, "C:alice").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
