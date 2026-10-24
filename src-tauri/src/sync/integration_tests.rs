//! Exercise real HTTP requests against an isolated WebDAV fixture, never real credentials.
use super::*;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

#[derive(Default)]
struct State {
    files: BTreeMap<String, Vec<u8>>,
    requests: Vec<(String, String)>,
    throttle: usize,
    version: usize,
    reject_manifest: bool,
}
struct Server {
    url: String,
    state: Arc<Mutex<State>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Server {
    fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let state = Arc::new(Mutex::new(State::default()));
        let stop = Arc::new(AtomicBool::new(false));
        let (data, quit) = (state.clone(), stop.clone());
        let thread = std::thread::spawn(move || {
            while !quit.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => handle(stream, &data),
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(2))
                    }
                    Err(e) => panic!("{e}"),
                }
            }
        });
        Self {
            url,
            state,
            stop,
            thread: Some(thread),
        }
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let result = self.thread.take().unwrap().join();
        if !std::thread::panicking() {
            result.unwrap();
        }
    }
}
fn handle(mut stream: TcpStream, data: &Mutex<State>) {
    stream.set_nonblocking(false).unwrap();
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(3)))
        .unwrap();
    let mut bytes = vec![];
    let (header_end, length) = loop {
        let mut chunk = [0u8; 8192];
        let n = stream.read(&mut chunk).unwrap();
        if n == 0 {
            return;
        }
        bytes.extend_from_slice(&chunk[..n]);
        if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..end]);
            let length = headers
                .lines()
                .find_map(|line| {
                    line.to_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|v| v.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            break (end + 4, length);
        }
    };
    while bytes.len() < header_end + length {
        let mut chunk = [0u8; 8192];
        let n = stream.read(&mut chunk).unwrap();
        if n == 0 {
            return;
        }
        bytes.extend_from_slice(&chunk[..n]);
    }
    let headers = String::from_utf8_lossy(&bytes[..header_end]).to_lowercase();
    let line = String::from_utf8_lossy(&bytes[..header_end]);
    let mut words = line.split_whitespace();
    let method = words.next().unwrap().to_string();
    let path = urlencoding::decode(words.next().unwrap())
        .unwrap()
        .into_owned();
    let mut state = data.lock().unwrap();
    state.requests.push((method.clone(), path.clone()));
    let mut status = 200;
    let mut body = vec![];
    if state.throttle > 0 {
        state.throttle -= 1;
        status = 429;
    } else {
        match method.as_str() {
            "MKCOL" => status = 405,
            "GET" => match state.files.get(&path) {
                Some(file) => body = file.clone(),
                None => status = 404,
            },
            "PUT" => {
                let manifest = path.ends_with(MANIFEST_NAME);
                if manifest
                    && (state.reject_manifest
                        || (headers.contains("if-none-match: *")
                            && state.files.contains_key(&path))
                        || (headers.contains("if-match:")
                            && !headers.contains(&format!("if-match: \"{}\"", state.version))))
                {
                    status = 412;
                } else {
                    state.files.insert(
                        path.clone(),
                        bytes[header_end..header_end + length].to_vec(),
                    );
                    if manifest {
                        state.version += 1;
                    }
                    status = 201;
                }
            }
            "DELETE" => {
                state.files.remove(&path);
                status = 204;
            }
            _ => {}
        }
    }
    write!(stream, "HTTP/1.1 {status} Fixture\r\nContent-Length: {}\r\nConnection: close\r\nETag: \"{}\"\r\nRetry-After: 0\r\n\r\n", body.len(), state.version).unwrap();
    stream.write_all(&body).unwrap();
}

fn config() -> SyncConfig {
    SyncConfig {
        enabled: true,
        provider: "nutstore".into(),
        username: "fixture".into(),
        password: "fixture".into(),
        remote_dir: "library".into(),
    }
}
fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("vs-dav-{name}-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("documents")).unwrap();
    dir
}
async fn run(server: &Server, dir: &Path) -> Result<SyncRunSummary, String> {
    let client = DavClient::new(&server.url).unwrap();
    ensure_remote_collection(&client, &config(), "library").await?;
    let mut summary = SyncRunSummary::enabled("同步完成");
    sync_with_client(
        &client,
        &config(),
        "library",
        "fixture",
        &dir.join("documents"),
        &dir.join("state.json"),
        &mut summary,
    )
    .await?;
    Ok(summary)
}

#[tokio::test]
async fn retries_rate_limits_caches_collections_and_restores_a_missing_manifest() {
    let server = Server::new();
    server.state.lock().unwrap().throttle = 1;
    let dir = temp("roundtrip");
    std::fs::create_dir_all(dir.join("documents/中文目录")).unwrap();
    std::fs::write(dir.join("documents/中文目录/a.md"), "one").unwrap();
    std::fs::write(dir.join("documents/中文目录/b.md"), "two").unwrap();
    assert_eq!(run(&server, &dir).await.unwrap().uploaded, 2);
    {
        let state = server.state.lock().unwrap();
        assert_eq!(
            state
                .requests
                .iter()
                .filter(|(m, p)| m == "MKCOL" && p == "/library/中文目录/")
                .count(),
            1
        );
        assert_eq!(
            state
                .requests
                .iter()
                .filter(|(m, p)| m == "MKCOL" && p == "/library/")
                .count(),
            2
        ); // one retry
    }
    server.state.lock().unwrap().requests.clear();
    assert_eq!(run(&server, &dir).await.unwrap().uploaded, 0);
    assert!(!server
        .state
        .lock()
        .unwrap()
        .requests
        .iter()
        .any(|(m, _)| m == "PUT"));
    // A cleared cloud index must never make local articles disappear.
    server
        .state
        .lock()
        .unwrap()
        .files
        .remove("/library/.vellumstyle-sync.json");
    let summary = run(&server, &dir).await.unwrap();
    assert_eq!(summary.deleted_local, 0);
    assert_eq!(summary.uploaded, 2);
    assert_eq!(
        std::fs::read_to_string(dir.join("documents/中文目录/a.md")).unwrap(),
        "one"
    );
    std::fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn downloads_remote_changes_and_preserves_both_sides_of_conflicts() {
    let server = Server::new();
    let a = temp("device-a");
    let b = temp("device-b");
    std::fs::write(a.join("documents/article.md"), "original").unwrap();
    run(&server, &a).await.unwrap();
    assert_eq!(run(&server, &b).await.unwrap().downloaded, 1);
    std::fs::write(a.join("documents/article.md"), "remote change").unwrap();
    run(&server, &a).await.unwrap();
    assert_eq!(run(&server, &b).await.unwrap().downloaded, 1);
    assert_eq!(
        std::fs::read_to_string(b.join("documents/article.md")).unwrap(),
        "remote change"
    );
    std::fs::write(a.join("documents/article.md"), "next remote").unwrap();
    std::fs::write(b.join("documents/article.md"), "local edit").unwrap();
    run(&server, &a).await.unwrap();
    assert_eq!(run(&server, &b).await.unwrap().conflicts, 1);
    assert_eq!(
        std::fs::read_to_string(b.join("documents/article.md")).unwrap(),
        "local edit"
    );
    assert!(scan_local_files(&b.join("documents"))
        .unwrap()
        .values()
        .any(|v| v == b"next remote"));
    std::fs::remove_dir_all(a).unwrap();
    std::fs::remove_dir_all(b).unwrap();
}

#[tokio::test]
async fn failed_manifest_commit_preserves_local_baseline_and_articles() {
    let server = Server::new();
    let dir = temp("precondition");
    std::fs::write(dir.join("documents/article.md"), "first").unwrap();
    run(&server, &dir).await.unwrap();
    let baseline = std::fs::read(dir.join("state.json")).unwrap();
    std::fs::write(dir.join("documents/article.md"), "new edit").unwrap();
    server.state.lock().unwrap().reject_manifest = true;
    assert!(run(&server, &dir).await.unwrap_err().contains("HTTP 412"));
    assert_eq!(std::fs::read(dir.join("state.json")).unwrap(), baseline);
    assert_eq!(
        std::fs::read_to_string(dir.join("documents/article.md")).unwrap(),
        "new edit"
    );
    std::fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn changed_local_file_during_download_becomes_a_conflict_copy() {
    let server = Server::new();
    let dir = temp("editing");
    let documents = dir.join("documents");
    let snapshot = b"snapshot".to_vec();
    std::fs::write(documents.join("article.md"), "typed during network request").unwrap();
    let mut summary = SyncRunSummary::enabled("sync");
    let mut files = BTreeMap::new();
    apply_download(
        &DavClient::new(&server.url).unwrap(),
        &config(),
        "library",
        &documents,
        "article.md",
        b"remote",
        Some(&snapshot),
        "fixture",
        &mut summary,
        &mut files,
    )
    .await
    .unwrap();
    assert_eq!(summary.conflicts, 1);
    assert_eq!(
        std::fs::read_to_string(documents.join("article.md")).unwrap(),
        "typed during network request"
    );
    assert_eq!(files.len(), 1);
    std::fs::remove_dir_all(dir).unwrap();
}
