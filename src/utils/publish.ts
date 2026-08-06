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

export interface MaterialVoice {
  mediaId: string;
  name: string;
  updateTime: number;
}

export interface MaterialVoicePage {
  totalCount: number;
  itemCount: number;
  items: MaterialVoice[];
}

// 微信后台源码模式里音频标签携带的字段（老版 <mpvoice> 或新版
// <section class="js_editor_audio">）。voice_encode_fileid 官方 API 拿不到，
// 只能由用户在微信后台编辑器插入音频后，从源码模式复制一次。
export interface VoiceCodeInfo {
  voiceEncodeFileid: string;
  name: string;
  playLength: string;
  src: string;
  isaac2?: string;
  lowSize?: string;
  sourceSize?: string;
  highSize?: string;
  author?: string;
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

export function listVoiceMaterials(offset: number, count: number): Promise<MaterialVoicePage> {
  return invoke<MaterialVoicePage>("list_voice_materials", {offset, count});
}

export function deleteImageMaterial(mediaId: string): Promise<void> {
  return invoke<void>("delete_image_material", {mediaId});
}

const VOICE_BINDING_KEY = "vs-audio-bindings";

function readVoiceBindings(): Record<string, VoiceCodeInfo> {
  try {
    const raw = localStorage.getItem(VOICE_BINDING_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, VoiceCodeInfo>;
  } catch {
    return {};
  }
}

export function loadVoiceBinding(mediaId: string): VoiceCodeInfo | null {
  return readVoiceBindings()[mediaId] ?? null;
}

export function saveVoiceBinding(mediaId: string, info: VoiceCodeInfo): void {
  const bindings = readVoiceBindings();
  bindings[mediaId] = info;
  try {
    localStorage.setItem(VOICE_BINDING_KEY, JSON.stringify(bindings));
  } catch {
    // 存储失败不阻断插入，本次仍可用粘贴代码插入。
  }
}

// 从微信后台复制来的音频代码里提取 voice_encode_fileid 及展示字段。
// 兼容 <mpvoice> 与新版 <section class="js_editor_audio"> 两种形态。
export function parseVoiceCode(source: string): VoiceCodeInfo | null {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const node = Array.from(doc.querySelectorAll<HTMLElement>("[voice_encode_fileid]")).find((el) => {
    const tag = el.tagName.toLowerCase();
    return tag === "mpvoice" || el.classList.contains("js_editor_audio");
  });
  if (!node) return null;
  const voiceEncodeFileid = node.getAttribute("voice_encode_fileid")?.trim() ?? "";
  if (!voiceEncodeFileid) return null;
  const name = node.getAttribute("name")?.trim() ?? "音频";
  const playLength = node.getAttribute("play_length")?.trim() ?? "";
  const src = node.getAttribute("src")?.trim() ?? "";
  return {
    voiceEncodeFileid,
    name,
    playLength,
    src,
    isaac2: node.getAttribute("isaac2")?.trim() || undefined,
    lowSize: node.getAttribute("low_size")?.trim() || undefined,
    sourceSize: node.getAttribute("source_size")?.trim() || undefined,
    highSize: node.getAttribute("high_size")?.trim() || undefined,
    author: node.getAttribute("author")?.trim() || undefined,
  };
}

// 生成微信图文可发布的 mpvoice 标签（实测 draft/add 原样保留并可播放）。
export function formatVoiceMarkup(info: VoiceCodeInfo): string {
  const attr = (name: string, value: string | undefined) =>
    value ? ` ${name}="${escapeHtmlAttribute(value)}"` : "";
  return (
    `<mpvoice class="js_editor_audio audio_iframe js_uneditable"` +
    attr("src", info.src) +
    attr("isaac2", info.isaac2) +
    attr("low_size", info.lowSize) +
    attr("source_size", info.sourceSize) +
    attr("high_size", info.highSize) +
    attr("name", info.name) +
    attr("play_length", info.playLength) +
    attr("author", info.author) +
    attr("voice_encode_fileid", info.voiceEncodeFileid) +
    ' data-pluginname="insertaudio"></mpvoice>'
  );
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
