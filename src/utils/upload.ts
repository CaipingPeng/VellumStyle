// 图片上传：调 Tauri command 代理到微信官方图床。
// 粘贴走 bytes 上传；上传按钮走本地路径上传，避免浏览器文件选择框位置不可控。

import {invoke} from "@tauri-apps/api/core";

export interface UploadError extends Error {
  // "NOT_CONFIGURED" 时调用方应提示去配置凭证，其余为普通失败提示。
  code?: string;
}

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];

export function isImageFile(file: File): boolean {
  return ALLOWED_TYPES.includes(file.type);
}

export async function pickImageFile(): Promise<string | null> {
  return invoke<string | null>("pick_image_file");
}

export async function uploadLocalImage(path: string): Promise<string> {
  try {
    return await invoke<string>("upload_local_image", {path});
  } catch (e) {
    throw normalizeUploadError(e);
  }
}

// 上传单张图片，成功返回微信永久链接（mmbiz.qpic.cn）。失败抛 UploadError。
export async function uploadImage(file: File): Promise<string> {
  if (!isImageFile(file)) {
    throw makeError("仅支持 jpg/png/gif 图片", "BAD_TYPE");
  }
  if (file.size > MAX_SIZE) {
    throw makeError("图片不能超过 10MB", "TOO_LARGE");
  }

  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));

  try {
    const url = await invoke<string>("upload_image", {
      bytes,
      filename: file.name || "image",
      mime: file.type,
    });
    return url;
  } catch (e) {
    throw normalizeUploadError(e);
  }
}

function normalizeUploadError(e: unknown): UploadError {
  const msg = typeof e === "string" ? e : (e as Error)?.message || "图片上传失败";
  if (msg === "NOT_CONFIGURED") {
    return makeError("尚未配置微信图床", "NOT_CONFIGURED");
  }
  return makeError(msg);
}

function makeError(message: string, code?: string): UploadError {
  const err = new Error(message) as UploadError;
  err.code = code;
  return err;
}
