// 图片上传：本地/远程取图 → 压缩到 10MiB → add_material 取永久链接。
// 由原 wechat.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

pub(crate) static IMAGE_COMPRESSION_LIMIT: OnceLock<tokio::sync::Semaphore> = OnceLock::new();

pub(crate) fn jpeg_probe_count() -> usize {
    match std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
    {
        16.. => 7,
        12..=15 => 5,
        6..=11 => 3,
        3..=5 => 2,
        _ => 1,
    }
}

pub(crate) fn compression_worker_count() -> usize {
    std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
        .div_ceil(jpeg_probe_count())
        .max(1)
}
// 调微信 add_material（type=image）；返回永久 mmbiz 链接，errcode 时返回 (errcode, msg)。
pub(crate) async fn upload_to_wechat(
    token: &str,
    bytes: Vec<u8>,
    filename: &str,
    mime: &str,
) -> Result<String, (Option<i64>, String)> {
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.to_string())
        .mime_str(mime)
        .map_err(|e| (None, format!("构造表单失败：{e}")))?;
    let form = reqwest::multipart::Form::new().part("media", part);

    let url = format!(
        "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    );
    let resp = reqwest::Client::new()
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| (None, format!("上传请求失败：{}", e.without_url())))?;
    let data: UploadResp = resp
        .json()
        .await
        .map_err(|e| (None, format!("解析上传响应失败：{}", e.without_url())))?;
    match data.url {
        Some(u) => Ok(u),
        None => Err((
            data.errcode,
            format_wechat_error(
                data.errcode,
                &data.errmsg.unwrap_or_else(|| "微信上传失败".into()),
                "微信上传失败",
            ),
        )),
    }
}
/// File/Blob 使用原始二进制 IPC 请求体，避免把大图片扩展成巨大的 JSON 数字数组。
#[tauri::command]
pub async fn upload_image(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        tauri::ipc::InvokeBody::Json(_) => return Err("图片上传请求必须使用二进制数据".into()),
    };
    let encoded_filename = request_header(&request, "x-vellum-filename")?;
    let filename = urlencoding::decode(&encoded_filename)
        .map_err(|_| "图片文件名编码无效".to_string())?
        .into_owned();
    let mime = request_header(&request, "x-vellum-mime")?;
    let task_id = request_header(&request, "x-vellum-task-id").ok();
    upload_image_bytes(app, bytes, filename, mime, task_id).await
}

#[tauri::command]
pub async fn upload_local_image(
    app: AppHandle,
    path: String,
    task_id: Option<String>,
) -> Result<String, String> {
    let display_name = Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("本地图片");
    emit_upload_progress(&app, &task_id, "reading", display_name, None, None);
    let path = fs::canonicalize(path).map_err(|e| format!("读取本地图片路径失败：{e}"))?;
    if !path.is_file() {
        return Err("本地图片不存在".into());
    }
    let meta = fs::metadata(&path).map_err(|e| format!("读取本地图片信息失败：{e}"))?;
    if meta.len() as usize > MAX_SOURCE_SIZE {
        return Err("原始图片不能超过 50MB".into());
    }

    // 检查是否为 SVG 文件
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    let (bytes, filename, mime) = if ext == "svg" {
        // SVG 转 PNG
        let png_bytes = convert_svg_to_png(&path)?;

        let original_name = path.file_stem().and_then(|v| v.to_str()).unwrap_or("image");
        let new_filename = format!("{}.png", original_name);

        (png_bytes, new_filename, "image/png")
    } else {
        // 常规图片处理
        let mime =
            mime_from_path(&path).ok_or_else(|| "仅支持 jpg/png/gif/svg 图片".to_string())?;
        let filename = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("image")
            .to_string();
        let bytes = fs::read(&path).map_err(|e| format!("读取本地图片失败：{e}"))?;

        (bytes, filename, mime)
    };

    upload_image_bytes(app, bytes, filename, mime.into(), task_id).await
}
pub(crate) struct DownloadedImage {
    pub(crate) bytes: Vec<u8>,
    pub(crate) filename: String,
    pub(crate) mime: String,
}
#[tauri::command]
pub async fn upload_remote_image(
    app: AppHandle,
    url: String,
    task_id: Option<String>,
) -> Result<String, String> {
    let label = remote_image_display_name(&url);
    emit_upload_progress(&app, &task_id, "downloading", &label, None, None);
    let image = download_remote_image(&url).await?;
    upload_image_bytes(app, image.bytes, image.filename, image.mime, task_id).await
}
// 远程图片的任务名/错误提示用 URL 派生，避免无文件名地址（如 api 接口图）
// 只显示笼统的「远程图片」，无法定位是哪一张。
pub(crate) fn remote_image_display_name(raw_url: &str) -> String {
    let Ok(parsed) = url::Url::parse(raw_url.trim()) else {
        return "远程图片".to_string();
    };
    let segments: Vec<&str> = parsed
        .path()
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    let host = parsed.host_str().unwrap_or("远程图片");
    if let Some(name) = segments.last() {
        if name.contains('.') {
            return (*name).to_string();
        }
        return format!("{host}/{name}");
    }
    host.to_string()
}
pub(crate) async fn download_remote_image(raw_url: &str) -> Result<DownloadedImage, String> {
    let mut target =
        url::Url::parse(raw_url.trim()).map_err(|_| "图片 URL 格式错误".to_string())?;
    let mut redirect_count = 0usize;
    // 远端（尤其是 mmbiz 图床）在并发下载时可能临时返回 429/5xx，属于瞬时故障，
    // 单次失败直接判死会导致整张图上传失败。这里指数退避重试，不改变重定向逻辑。
    let mut transient_attempts = 0usize;
    let resp = loop {
        transient_attempts += 1;
        let client = remote_image_client(&target).await?;
        let mut request = client.get(target.clone());
        if ALLOWED_IMG_HOSTS.contains(&target.host_str().unwrap_or("")) {
            request = request.header("Referer", "https://mp.weixin.qq.com");
        }
        let response = request
            .send()
            .await
            .map_err(|e| format!("下载远程图片失败：{}", e.without_url()))?;
        if matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
            if redirect_count >= 5 {
                return Err("远程图片重定向次数过多".into());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "远程图片重定向缺少有效 Location".to_string())?
                .to_owned();
            target = target
                .join(&location)
                .map_err(|_| "远程图片重定向地址无效".to_string())?;
            redirect_count += 1;
            continue;
        }
        let status = response.status().as_u16();
        if matches!(status, 429 | 500..=599) && transient_attempts < 3 {
            tokio::time::sleep(Duration::from_millis(500 * (1 << (transient_attempts - 1)))).await;
            continue;
        }
        break response;
    };
    if !resp.status().is_success() {
        return Err(format!(
            "下载远程图片失败：HTTP {}（{}）",
            resp.status(),
            remote_image_display_name(raw_url)
        ));
    }

    if let Some(len) = resp.content_length() {
        if len as usize > MAX_SOURCE_SIZE {
            return Err("原始图片不能超过 50MB".into());
        }
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(normalize_mime)
        .map(str::to_string);
    let mut resp = resp;
    let mut bytes = Vec::with_capacity(
        resp.content_length()
            .unwrap_or(0)
            .min(MAX_SOURCE_SIZE as u64) as usize,
    );
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("读取远程图片失败：{}", e.without_url()))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_SOURCE_SIZE {
            return Err("原始图片不能超过 50MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }

    // 优先按真实字节识别：微信表情 CDN 的 Content-Type（如 image/jpg）可能不可信，
    // 以文件头实际格式为准。
    let mime = mime_from_bytes(&bytes)
        .map(str::to_string)
        .or(content_type)
        .or_else(|| mime_from_url_path(target.path()).map(str::to_string))
        .ok_or_else(|| "远程资源不是支持的 jpg/png/gif 图片".to_string())?;
    if !looks_like_image_bytes(&bytes, &mime) {
        return Err("远程资源不是有效图片".into());
    }

    let filename = filename_from_remote_url(&target, &mime);
    Ok(DownloadedImage {
        bytes,
        filename,
        mime,
    })
}
pub(crate) async fn remote_image_client(target: &url::Url) -> Result<reqwest::Client, String> {
    ensure_public_remote_url(target)?;
    let mut builder = reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none());

    if let Some(url::Host::Domain(host)) = target.host() {
        let port = target
            .port_or_known_default()
            .ok_or_else(|| "图片 URL 缺少有效端口".to_string())?;
        let addresses = tokio::net::lookup_host((host, port))
            .await
            .map_err(|e| format!("解析图片域名失败：{e}"))?
            .collect::<Vec<_>>();
        if addresses.is_empty() {
            return Err("图片域名没有可用地址".into());
        }
        validate_remote_addresses(&addresses)?;
        // 固定本次连接使用刚校验过的地址，消除校验与连接之间的 DNS 重绑定窗口。
        builder = builder.resolve_to_addrs(host, &addresses);
    }

    builder
        .build()
        .map_err(|e| format!("创建下载客户端失败：{}", e.without_url()))
}
pub(crate) fn validate_remote_addresses(addresses: &[std::net::SocketAddr]) -> Result<(), String> {
    if addresses.is_empty() {
        return Err("图片域名没有可用地址".into());
    }
    if addresses
        .iter()
        .any(|address| !crate::preview_image::is_globally_routable_ip(address.ip()))
    {
        return Err("图片域名解析到了内网或本机地址".into());
    }
    Ok(())
}
#[derive(Debug)]
pub(crate) struct PreparedUpload {
    pub(crate) bytes: Vec<u8>,
    pub(crate) filename: String,
    pub(crate) mime: String,
}
pub(crate) async fn prepare_upload_async(
    bytes: Vec<u8>,
    filename: String,
    mime: String,
) -> Result<PreparedUpload, String> {
    if bytes.len() <= MAX_SIZE {
        return Ok(PreparedUpload {
            bytes,
            filename,
            mime,
        });
    }
    let compression_limit = IMAGE_COMPRESSION_LIMIT
        .get_or_init(|| tokio::sync::Semaphore::new(compression_worker_count()));
    let _permit = compression_limit
        .acquire()
        .await
        .map_err(|_| "图片压缩队列已关闭".to_string())?;
    tokio::task::spawn_blocking(move || {
        prepare_upload_for_limit(bytes, filename, mime, MAX_SIZE, TARGET_SIZE)
    })
    .await
    .map_err(|e| format!("图片压缩任务失败：{e}"))?
}

pub(crate) fn prepare_upload_for_limit(
    bytes: Vec<u8>,
    filename: String,
    mime: String,
    max_size: usize,
    target_size: usize,
) -> Result<PreparedUpload, String> {
    if bytes.len() > MAX_SOURCE_SIZE {
        return Err("原始图片不能超过 50MB".into());
    }
    if bytes.len() <= max_size {
        return Ok(PreparedUpload {
            bytes,
            filename,
            mime,
        });
    }
    if mime == "image/gif" {
        return Err("GIF 超过 10MB，暂时无法在保留动画的情况下自动压缩".into());
    }

    let format = match mime.as_str() {
        "image/jpeg" => ImageFormat::Jpeg,
        "image/png" => ImageFormat::Png,
        _ => return Err("仅支持 jpg/png/gif 图片".into()),
    };
    let image = decode_for_reencoding(&bytes, format)?;
    let original_size = bytes.len();
    let prepared = if mime == "image/jpeg" {
        compress_jpeg(image, filename, target_size)?
    } else {
        compress_png(image, filename, target_size, original_size)?
    };
    if prepared.bytes.len() > max_size {
        return Err("图片在保持原分辨率后仍超过 10MB，请先转换或裁剪图片".into());
    }
    eprintln!(
        "图片已自动压缩：{:.2}MB -> {:.2}MB",
        original_size as f64 / 1024.0 / 1024.0,
        prepared.bytes.len() as f64 / 1024.0 / 1024.0
    );
    Ok(prepared)
}
pub(crate) fn decode_for_reencoding(bytes: &[u8], format: ImageFormat) -> Result<DynamicImage, String> {
    if format == ImageFormat::Jpeg {
        let mut decoder =
            JpegDecoder::new(Cursor::new(bytes)).map_err(|e| format!("解码 JPEG 失败：{e}"))?;
        let orientation = decoder
            .orientation()
            .map_err(|e| format!("读取 JPEG 方向失败：{e}"))?;
        let mut image =
            DynamicImage::from_decoder(decoder).map_err(|e| format!("解码 JPEG 失败：{e}"))?;
        image.apply_orientation(orientation);
        Ok(image)
    } else {
        image::load_from_memory_with_format(bytes, format).map_err(|e| format!("解码图片失败：{e}"))
    }
}

pub(crate) fn compress_jpeg(
    image: DynamicImage,
    filename: String,
    target_size: usize,
) -> Result<PreparedUpload, String> {
    let encoded = best_jpeg_under(&image, target_size)?;
    if let Some(candidate) = encoded {
        eprintln!("JPEG 自动压缩采用质量 {}", candidate.quality);
        return Ok(PreparedUpload {
            bytes: candidate.bytes,
            filename: replace_extension(&filename, "jpg"),
            mime: "image/jpeg".into(),
        });
    }
    Err("图片在保持原分辨率后仍超过 10MB，请先转换或裁剪图片".into())
}

pub(crate) fn compress_png(
    image: DynamicImage,
    filename: String,
    target_size: usize,
    original_size: usize,
) -> Result<PreparedUpload, String> {
    if original_size <= target_size.saturating_mul(PNG_LOSSLESS_RETRY_RATIO) / 4 {
        let encoded = encode_png(&image, CompressionType::Fast)?;
        if encoded.len() <= target_size {
            return Ok(PreparedUpload {
                bytes: encoded,
                filename: replace_extension(&filename, "png"),
                mime: "image/png".into(),
            });
        }
    }

    compress_jpeg(image, replace_extension(&filename, "jpg"), target_size)
}

#[derive(Debug)]
pub(crate) struct JpegCandidate {
    pub(crate) quality: u8,
    pub(crate) bytes: Vec<u8>,
}

pub(crate) fn best_jpeg_under(
    image: &DynamicImage,
    target_size: usize,
) -> Result<Option<JpegCandidate>, String> {
    let rgb = rgb_on_white(image);
    let probe_count = jpeg_probe_count();
    let mut low_quality = 0u16;
    let mut high_quality = 101u16;
    let mut best: Option<JpegCandidate> = None;

    while high_quality > low_quality + 1 {
        let span = usize::from(high_quality - low_quality);
        let mut qualities = (1..=probe_count)
            .map(|index| low_quality + ((span * index) / (probe_count + 1)) as u16)
            .filter(|quality| *quality > low_quality && *quality < high_quality)
            .map(|quality| quality as u8)
            .collect::<Vec<_>>();
        qualities.sort_unstable();
        qualities.dedup();
        if qualities.is_empty() {
            qualities.push((low_quality + 1) as u8);
        }

        let mut candidates = std::thread::scope(|scope| {
            let rgb = &rgb;
            let handles = qualities
                .into_iter()
                .map(|quality| {
                    scope.spawn(move || encode_jpeg(rgb, quality).map(|bytes| (quality, bytes)))
                })
                .collect::<Vec<_>>();
            handles
                .into_iter()
                .map(|handle| {
                    handle
                        .join()
                        .map_err(|_| "JPEG 并行编码任务异常退出".to_string())?
                })
                .collect::<Result<Vec<_>, String>>()
        })?;
        candidates.sort_unstable_by_key(|candidate| candidate.0);

        for (quality, bytes) in candidates {
            if bytes.len() <= target_size {
                low_quality = u16::from(quality);
                best = Some(JpegCandidate { quality, bytes });
            } else {
                high_quality = u16::from(quality);
                break;
            }
        }
    }

    Ok(best)
}

pub(crate) fn encode_jpeg(image: &image::RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let width =
        u16::try_from(image.width()).map_err(|_| "图片宽度超过 JPEG 编码上限".to_string())?;
    let height =
        u16::try_from(image.height()).map_err(|_| "图片高度超过 JPEG 编码上限".to_string())?;
    let mut bytes = Vec::new();
    let mut encoder = FastJpegEncoder::new(&mut bytes, quality);
    encoder.set_sampling_factor(SamplingFactor::F_1_1);
    encoder
        .encode(image.as_raw(), width, height, FastJpegColorType::Rgb)
        .map_err(|e| format!("JPEG 编码失败：{e}"))?;
    Ok(bytes)
}

pub(crate) fn rgb_on_white(image: &DynamicImage) -> image::RgbImage {
    if !image.color().has_alpha() {
        return image.to_rgb8();
    }
    let rgba = image.to_rgba8();
    image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let pixel = rgba.get_pixel(x, y).0;
        let alpha = u16::from(pixel[3]);
        let blend =
            |channel: u8| ((u16::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
        image::Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])])
    })
}

pub(crate) fn encode_png(image: &DynamicImage, compression: CompressionType) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    PngEncoder::new_with_quality(&mut bytes, compression, FilterType::Paeth)
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .map_err(|e| format!("PNG 编码失败：{e}"))?;
    Ok(bytes)
}

pub(crate) fn replace_extension(filename: &str, extension: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("image");
    format!("{stem}.{extension}")
}
pub(crate) async fn upload_image_bytes(
    app: AppHandle,
    bytes: Vec<u8>,
    filename: String,
    mime: String,
    task_id: Option<String>,
) -> Result<String, String> {
    let cfg = load_wechat_config(&app);
    if !cfg.is_configured() {
        return Err("NOT_CONFIGURED".into());
    }
    if !ALLOWED_TYPES.contains(&mime.as_str()) {
        return Err("仅支持 jpg/png/gif 图片".into());
    }
    let name = if filename.is_empty() {
        "image".to_string()
    } else {
        filename
    };
    let original_size = bytes.len();
    let phase = if original_size > MAX_SIZE {
        "compressing"
    } else {
        "preparing"
    };
    emit_upload_progress(&app, &task_id, phase, &name, Some(original_size), None);
    let prepared = prepare_upload_async(bytes, name, mime).await?;
    emit_upload_progress(
        &app,
        &task_id,
        "uploading",
        &prepared.filename,
        Some(original_size),
        Some(prepared.bytes.len()),
    );
    let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
    match upload_to_wechat(
        &token,
        prepared.bytes.clone(),
        &prepared.filename,
        &prepared.mime,
    )
    .await
    {
        Ok(url) => Ok(url),
        Err((errcode, msg)) => {
            if matches!(errcode, Some(40001) | Some(42001) | Some(40014)) {
                invalidate_access_token(&token);
                let token = get_access_token(&cfg.app_id, &cfg.app_secret).await?;
                upload_to_wechat(&token, prepared.bytes, &prepared.filename, &prepared.mime)
                    .await
                    .map_err(|(_, m)| m)
            } else {
                Err(msg)
            }
        }
    }
}
