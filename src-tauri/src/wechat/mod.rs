// 微信官方图床上传 + 图片代理拉取。
// secret 不出前端：前端只调 upload_image command，凭证仅 Rust 读 config。

use crate::config::load_wechat_config;
use crate::ipc_util::request_header;
use image::codecs::jpeg::JpegDecoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageFormat};
use jpeg_encoder::{ColorType as FastJpegColorType, Encoder as FastJpegEncoder, SamplingFactor};
use resvg::tiny_skia;
use resvg::usvg;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::net::{IpAddr, Ipv4Addr};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// 按域拆分（原 2409 行单文件）：
//   common      共用常量 / 上传进度事件 / 接口响应 DTO / 错误格式化 / mime 与 SVG 工具
//   token       access_token 缓存与获取、出口 IP 查询
//   material    永久素材列表与删除、视频播放地址解析
//   upload      图片上传：取图 → 压缩到 10MiB → add_material
//   image_proxy wximg 自定义协议：白名单校验 + 带 Referer 代理拉图
//   draft       封面图上传与草稿箱发布
//
// 子模块用 `use super::*;` 继承这里的公共导入；对外路径仍是 `wechat::<cmd>`，
// 所以 lib.rs 的 generate_handler! 一行都不用改。
//
// 必须用 glob 重导出、不能逐项列名字：`#[tauri::command]` 会在**声明处**额外生成
// `__cmd__<name>` / `__tauri_command_name_<name>` 两个宏，逐项重导出会漏掉它们，
// 结果是每个命令都报 E0433（拆 wechat_backend 时踩过，28 个命令全灭）。

mod common;
mod draft;
mod image_proxy;
mod material;
mod token;
mod upload;

pub(crate) use common::*;
pub(crate) use draft::*;
pub(crate) use image_proxy::*;
pub(crate) use material::*;
pub(crate) use token::*;
pub(crate) use upload::*;

#[cfg(test)]
mod tests;
