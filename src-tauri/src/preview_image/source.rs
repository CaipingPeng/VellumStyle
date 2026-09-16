// 图片来源解析：data URL 解析、百分号解码、编码后长度上限校验。
// 由原 preview_image.rs 按域拆分而来，纯搬运，未改行为。

use super::*;

pub(crate) fn disposition_filename(value: &str) -> Option<String> {
    value
        .split(';')
        .map(str::trim)
        .find_map(|part| {
            part.strip_prefix("filename=")
                .map(|v| v.trim_matches('"').to_owned())
        })
        .filter(|v| !v.is_empty())
}
pub(crate) fn strict_percent_decode(input: &str, max_output: usize) -> Result<Vec<u8>, String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len().min(max_output));
    let mut index = 0;
    while index < bytes.len() {
        if output.len() >= max_output {
            return Err("image exceeds 15 MiB limit".into());
        }
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("malformed percent escape in data URL".into());
            }
            let hex = |byte: u8| match byte {
                b'0'..=b'9' => Some(byte - b'0'),
                b'a'..=b'f' => Some(byte - b'a' + 10),
                b'A'..=b'F' => Some(byte - b'A' + 10),
                _ => None,
            };
            let high = hex(bytes[index + 1]).ok_or("malformed percent escape in data URL")?;
            let low = hex(bytes[index + 2]).ok_or("malformed percent escape in data URL")?;
            output.push(high * 16 + low);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    Ok(output)
}
pub(crate) fn encoded_payload_limit(is_base64: bool) -> usize {
    let decoded_limit = if is_base64 {
        MAX_SOURCE_BYTES.div_ceil(3) * 4
    } else {
        MAX_SOURCE_BYTES
    };
    decoded_limit.saturating_mul(3)
}
pub(crate) fn validate_encoded_payload_len(length: usize, is_base64: bool) -> Result<(), String> {
    if length > encoded_payload_limit(is_base64) {
        Err("image exceeds 15 MiB limit".into())
    } else {
        Ok(())
    }
}
pub(crate) fn parse_data_url(source: &str) -> Result<Download, String> {
    let (scheme, rest) = source.split_once(':').ok_or("malformed data URL")?;
    if !scheme.eq_ignore_ascii_case("data") {
        return Err("malformed data URL".into());
    }
    let (metadata, payload) = rest.split_once(',').ok_or("malformed data URL")?;
    if metadata.len() > 4 * 1024 {
        return Err("data URL metadata exceeds 4 KiB limit".into());
    }
    let mut parts = metadata.split(';');
    let mime = parts.next().unwrap_or_default().to_ascii_lowercase();
    if !mime.starts_with("image/") {
        return Err("data URL must contain an image".into());
    }
    let is_base64 = parts.any(|p| p.eq_ignore_ascii_case("base64"));
    validate_encoded_payload_len(payload.len(), is_base64)?;
    let decoded_payload_limit = if is_base64 {
        MAX_SOURCE_BYTES.div_ceil(3) * 4
    } else {
        MAX_SOURCE_BYTES
    };
    let decoded_payload = strict_percent_decode(payload, decoded_payload_limit)?;
    let bytes = if is_base64 {
        base64::engine::general_purpose::STANDARD
            .decode(decoded_payload)
            .map_err(|_| "malformed base64 data URL")?
    } else {
        decoded_payload
    };
    if bytes.len() > MAX_SOURCE_BYTES {
        return Err("image exceeds 15 MiB limit".into());
    }
    identify_image(&bytes, Some(&mime))?;
    Ok(Download {
        bytes,
        content_type: Some(mime),
        file_name: None,
    })
}
