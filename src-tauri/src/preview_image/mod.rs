use std::future::Future;
use std::io::Cursor;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use base64::Engine;
use image::GenericImageView;
use reqwest::header::{CONTENT_DISPOSITION, CONTENT_TYPE, LOCATION, REFERER};
use tauri_plugin_clipboard_manager::ClipboardExt;
use url::Url;
// 按域拆分（原 1938 行单文件）：资产模型与解码 / SVG 校验 / HTTP 下载 / 来源解析 / 命令。
// 子模块用 `use super::*;` 继承这里的公共导入；glob 重导出保证对外路径仍是
// `preview_image::<cmd>`，所以 lib.rs 的 generate_handler! 不需要改。
//
// 必须用 glob、不能逐项列名字：`#[tauri::command]` 会在**声明处**额外生成
// `__cmd__<name>` / `__tauri_command_name_<name>` 两个宏，逐项重导出会漏掉它们 → E0433。

mod asset;
mod svg;
mod http;
mod source;
mod commands;

pub(crate) use asset::*;
pub(crate) use svg::*;
pub(crate) use http::*;
pub(crate) use source::*;
pub(crate) use commands::*;

#[cfg(test)]
mod tests;
