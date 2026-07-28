// 图片上传：调 Tauri command 代理到微信官方图床。
// 粘贴走 bytes 上传；上传按钮走本地路径上传，避免浏览器文件选择框位置不可控。

import {invoke} from "@tauri-apps/api/core";
import {
  imageUploadTasks,
  type ImageUploadTask,
  type ImageUploadTaskContext,
} from "./imageUploadTasks.ts";

export interface UploadError extends Error {
  // "NOT_CONFIGURED" 时调用方应提示去配置凭证，其余为普通失败提示。
  code?: string;
}

export const MAX_IMAGE_SOURCE_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif"];

export function isImageFile(file: File): boolean {
  return ALLOWED_TYPES.includes(file.type);
}

export async function pickImageFile(): Promise<string | null> {
  return invoke<string | null>("pick_image_file");
}

export async function pickImageFiles(): Promise<string[] | null> {
  return invoke<string[] | null>("pick_image_files");
}

export async function uploadLocalImage(
  path: string,
  category: ImageUploadTask["category"] = "正文图片",
  onTaskStart?: (taskId: string) => void,
  context: Omit<ImageUploadTaskContext, "category"> = {},
): Promise<string> {
  const taskId = imageUploadTasks.start(fileNameFromPath(path), category, context);
  onTaskStart?.(taskId);
  try {
    const url = await invoke<string>("upload_local_image", {path, taskId});
    imageUploadTasks.complete(taskId);
    return url;
  } catch (e) {
    const error = normalizeUploadError(e);
    imageUploadTasks.fail(taskId, error);
    throw error;
  }
}

export async function uploadRemoteImage(
  url: string,
  category: ImageUploadTask["category"] = "导入图片",
  context: Omit<ImageUploadTaskContext, "category"> = {},
): Promise<string> {
  const taskId = imageUploadTasks.start(fileNameFromUrl(url), category, context);
  try {
    const uploadedUrl = await invoke<string>("upload_remote_image", {url, taskId});
    imageUploadTasks.complete(taskId);
    return uploadedUrl;
  } catch (e) {
    const error = normalizeUploadError(e);
    imageUploadTasks.fail(taskId, error);
    throw error;
  }
}

// 上传单张图片，成功返回微信永久链接（mmbiz.qpic.cn）。失败抛 UploadError。
export async function uploadImage(
  file: File,
  onTaskStart?: (taskId: string) => void,
  context: Omit<ImageUploadTaskContext, "category"> = {},
): Promise<string> {
  if (!isImageFile(file)) {
    throw makeError("仅支持 jpg/png/gif 图片", "BAD_TYPE");
  }
  if (file.size > MAX_IMAGE_SOURCE_SIZE) {
    throw makeError("原始图片不能超过 50MB", "TOO_LARGE");
  }

  const taskId = imageUploadTasks.start(file.name || "image", "正文图片", context);
  onTaskStart?.(taskId);
  try {
    const buf = await file.arrayBuffer();
    const url = await invoke<string>("upload_image", new Uint8Array(buf), {
      headers: {
        "x-vellum-filename": encodeURIComponent(file.name || "image"),
        "x-vellum-mime": file.type,
        "x-vellum-task-id": taskId,
      },
    });
    imageUploadTasks.complete(taskId);
    return url;
  } catch (e) {
    const error = normalizeUploadError(e);
    imageUploadTasks.fail(taskId, error);
    throw error;
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

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || "本地图片";
}

function fileNameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : "远程图片";
  } catch {
    return "远程图片";
  }
}
