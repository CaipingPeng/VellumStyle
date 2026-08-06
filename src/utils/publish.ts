// 发布草稿箱：上传封面拿 media_id + add_draft；发布前校验正文无未上传外链图。
import {invoke} from "@tauri-apps/api/core";
import {MAX_IMAGE_SOURCE_SIZE} from "./upload.ts";
import {imageUploadTasks, type ImageUploadTaskContext} from "./imageUploadTasks.ts";
import type {MediaRef, MediaSourceType, MediaSyntax} from "./markdownMediaScanner.ts";
import {scanMarkdownMedia} from "./markdownMediaScanner.ts";
import {DEFAULT_PUBLISH_SETTINGS, type PublishSettings} from "./publishSettings.ts";

const MMBIZ_HOSTS = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];

export interface CoverCandidate {
  url: string;
  syntax: MediaRef["syntax"];
  sourceType: MediaRef["sourceType"];
}

export type UnuploadedImageReason = "local" | "external" | "temporary" | "unsupported";

export interface UnuploadedImage {
  url: string;
  line: number;
  column: number;
  sourceType: MediaSourceType;
  syntax: MediaSyntax;
  reason: UnuploadedImageReason;
}

export interface MaterialImage {
  mediaId: string;
  name: string;
  updateTime: number;
  url: string;
}

export interface MaterialImagePage {
  totalCount: number;
  itemCount: number;
  items: MaterialImage[];
}

export interface MaterialVideo {
  mediaId: string;
  name: string;
  updateTime: number;
  coverUrl: string;
  vid: string;
}

export interface MaterialVideoPage {
  totalCount: number;
  itemCount: number;
  items: MaterialVideo[];
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 素材库视频插入正文的标准播放 iframe：
// - src 用于本地预览实际渲染
// - data-src 是微信后台/发布端识别视频的字段（经 draft/add 接口提交时 src 可能被剥离，
//   data-src 保留后微信端仍能还原播放器）
// - data-cover 传素材返回的封面链，data-mpvid 传 vid
export function formatVideoMaterialIframe(video: MaterialVideo): string {
  const vid = video.vid.trim();
  const playerUrl = `https://mp.weixin.qq.com/mp/readtemplate?t=pages/video_player_tmpl&action=mpvideo&auto=0&vid=${encodeURIComponent(vid)}`;
  const src = escapeHtmlAttribute(playerUrl);
  const cover = video.coverUrl.trim()
    ? ` data-cover="${escapeHtmlAttribute(video.coverUrl.trim())}"`
    : "";
  return (
    `<iframe class="video_iframe rich_pages" data-vidtype="2" data-mpvid="${escapeHtmlAttribute(vid)}"${cover}` +
    ` allowfullscreen frameborder="0" data-w="1920" data-ratio="1.7777777777777777" height="325" width="578"` +
    ` data-src="${src}" src="${src}"></iframe>`
  );
}

// 返回正文里仍未上传到微信素材域名的图片诊断（发布前需先处理或确认风险）。
export function findUnuploadedImages(markdown: string): UnuploadedImage[] {
  const diagnostics: UnuploadedImage[] = [];
  const lineStarts = findLineStarts(markdown);
  for (const ref of scanMarkdownMedia(markdown)) {
    if (ref.mediaType !== "image") continue;
    const reason = unuploadedImageReason(ref);
    if (!reason) continue;
    const position = sourcePosition(lineStarts, ref.start);
    diagnostics.push({
      url: ref.originalUrl,
      ...position,
      sourceType: ref.sourceType,
      syntax: ref.syntax,
      reason,
    });
  }
  return diagnostics;
}

export function getCoverCandidates(markdown: string): CoverCandidate[] {
  const seen = new Set<string>();
  const candidates: CoverCandidate[] = [];
  for (const ref of scanMarkdownMedia(markdown)) {
    if (ref.mediaType !== "image" || ref.sourceType !== "remote") continue;
    const url = normalizeRemoteImageUrl(ref.originalUrl);
    if (!url || !isMmbizImageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    candidates.push({url, syntax: ref.syntax, sourceType: ref.sourceType});
  }
  return candidates;
}

export async function uploadThumb(
  file: File,
  context: Omit<ImageUploadTaskContext, "category"> = {},
): Promise<string> {
  if (file.size > MAX_IMAGE_SOURCE_SIZE) {
    throw new Error("原始图片不能超过 50MB");
  }
  const taskId = imageUploadTasks.start(file.name || "thumb", "封面图片", context);
  try {
    const buf = await file.arrayBuffer();
    const mediaId = await invoke<string>("upload_thumb", new Uint8Array(buf), {
      headers: {
        "x-vellum-filename": encodeURIComponent(file.name || "thumb"),
        "x-vellum-mime": file.type,
        "x-vellum-task-id": taskId,
      },
    });
    imageUploadTasks.complete(taskId);
    return mediaId;
  } catch (error) {
    imageUploadTasks.fail(taskId, error);
    throw error;
  }
}

export async function uploadRemoteThumb(
  url: string,
  context: Omit<ImageUploadTaskContext, "category"> = {},
): Promise<string> {
  const taskId = imageUploadTasks.start("远程封面", "封面图片", context);
  try {
    const mediaId = await invoke<string>("upload_remote_thumb", {url, taskId});
    imageUploadTasks.complete(taskId);
    return mediaId;
  } catch (error) {
    imageUploadTasks.fail(taskId, error);
    throw error;
  }
}

export function listImageMaterials(offset: number, count: number): Promise<MaterialImagePage> {
  return invoke<MaterialImagePage>("list_image_materials", {offset, count});
}

export function listVideoMaterials(offset: number, count: number): Promise<MaterialVideoPage> {
  return invoke<MaterialVideoPage>("list_video_materials", {offset, count});
}

export function deleteImageMaterial(mediaId: string): Promise<void> {
  return invoke<void>("delete_image_material", {mediaId});
}

export function addDraft(
  title: string,
  content: string,
  thumbMediaId: string,
  settings: PublishSettings = DEFAULT_PUBLISH_SETTINGS,
): Promise<string> {
  return invoke<string>("add_draft", {
    title,
    content,
    thumbMediaId,
    author: settings.author,
    needOpenComment: settings.needOpenComment,
    onlyFansCanComment: settings.onlyFansCanComment,
  });
}

function normalizeRemoteImageUrl(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function isMmbizImageUrl(url: string): boolean {
  const parsed = parseRemoteImageUrl(url);
  return parsed !== null && MMBIZ_HOSTS.includes(parsed.hostname.toLowerCase());
}

function parseRemoteImageUrl(url: string): URL | null {
  const normalized = normalizeRemoteImageUrl(url);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function unuploadedImageReason(ref: MediaRef): UnuploadedImageReason | null {
  switch (ref.sourceType) {
    case "local":
      return "local";
    case "remote": {
      const parsed = parseRemoteImageUrl(ref.originalUrl);
      if (!parsed) return "unsupported";
      return MMBIZ_HOSTS.includes(parsed.hostname.toLowerCase()) ? null : "external";
    }
    case "data":
    case "blob":
      return "temporary";
    case "anchor":
    case "empty":
    case "unsupported":
      return "unsupported";
  }
}

function findLineStarts(markdown: string): number[] {
  const lineStarts = [0];
  for (let index = 0; index < markdown.length; index++) {
    if (markdown[index] === "\n") lineStarts.push(index + 1);
  }
  return lineStarts;
}

function sourcePosition(lineStarts: number[], start: number): {line: number; column: number} {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= start) low = middle;
    else high = middle;
  }
  return {line: low + 1, column: start - lineStarts[low] + 1};
}
