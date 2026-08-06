// 发布草稿箱：上传封面拿 media_id + add_draft；发布前校验正文无未上传外链图。
import {invoke} from "@tauri-apps/api/core";
import {MAX_IMAGE_SOURCE_SIZE} from "./upload.ts";
import {imageUploadTasks, type ImageUploadTaskContext} from "./imageUploadTasks.ts";
import type {MediaRef, MediaSourceType, MediaSyntax} from "./markdownMediaScanner.ts";
import {scanMarkdownMedia} from "./markdownMediaScanner.ts";
import {DEFAULT_PUBLISH_SETTINGS, type PublishSettings} from "./publishSettings.ts";

const MMBIZ_HOSTS = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];
// 微信官方静态资源域名：官方编辑器直接引用的表情等图片无需上传素材库。
const OFFICIAL_IMG_HOSTS = [...MMBIZ_HOSTS, "res.wx.qq.com"];

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
  coverUrl?: string;
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
// - src 是微信后台/发布端渲染播放器必需的字段（实测去掉后视频不显示，必须保留）
// - data-src 与 src 同值，兼容微信后台对视频字段的识别
// - data-cover 传素材返回的封面链，data-mpvid 传 vid
// - 注意：iframe 只能带微信白名单内的 data 属性（data-mpvid/data-vidtype/data-cover
//   等），新增未知 data 属性会导致微信整段剥离 iframe（data-media-id 曾因此被删）
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

/// 打开（或聚焦）软件内嵌的微信后台登录窗口。
export function openWechatBackend(): Promise<void> {
  return invoke<void>("open_wechat_backend");
}

/// 隐藏创建微信后台窗口（静默搜索场景，避免已登录时窗口闪动）。
export function openWechatBackendHidden(): Promise<void> {
  return invoke<void>("open_wechat_backend_hidden");
}

/// 显示后台窗口（仅需要用户扫码登录时调用）。
export function showWechatBackend(): Promise<void> {
  return invoke<void>("show_wechat_backend");
}

/// 在后台窗口上下文里静默拉取音频素材列表接口，返回原始 JSON 响应文本。
/// 窗口未打开时命令返回 "WECHAT_BACKEND_NOT_OPENED"。
export function fetchBackendVoiceList(): Promise<string> {
  return invoke<string>("fetch_backend_voice_list");
}

/// 返回后台窗口当前 URL（未打开时返回 null），用于判断登录状态。
export function backendWindowUrl(): Promise<string | null> {
  return invoke<string | null>("backend_window_url");
}

/// 关闭后台窗口（同步完成后调用）。
export function closeWechatBackend(): Promise<void> {
  return invoke<void>("close_wechat_backend");
}

/// 获取视频素材的可流式播放 mp4 直链（每次播放前实时获取，地址带签名时效）。
export function getVideoPlayUrl(mediaId: string): Promise<string> {
  return invoke<string>("get_video_play_url", {mediaId});
}

/// 在后台窗口上下文里搜索微信表情，返回原始 JSON 响应文本。
/// 窗口未打开时命令返回 "WECHAT_BACKEND_NOT_OPENED"。
export function searchRemoticon(query: string, size: number, offset: number): Promise<string> {
  return invoke<string>("search_remoticon", {query, size, offset});
}

/// 在后台窗口上下文里把微信表情 CDN 链接转换为 mmbiz 永久链接（官方插入流程）。
/// gen 表情 emoticonType=1 且 aesKey 为空；normal 表情 emoticonType=0 且带 aesKey。
export function getEmojiCdnUrl(
  url: string,
  thumbUrl: string,
  aesKey: string | null | undefined,
  emoticonType: number,
): Promise<string> {
  return invoke<string>("get_emoji_cdn_url", {
    url,
    thumbUrl,
    aesKey: aesKey ?? null,
    emoticonType,
  });
}

/// 获取手机传图二维码（后台窗口同步执行），返回原始 JSON 文本。
export function getPhoneUploadQrcode(): Promise<string> {
  return invoke<string>("get_phone_upload_qrcode");
}

/// 轮询手机扫码上传结果（后台窗口同步执行），返回原始 JSON 文本。
export function getPhoneUploadPicList(qrcodeUuid: string): Promise<string> {
  return invoke<string>("get_phone_upload_pic_list", {qrcodeUuid});
}

/// 确认保存手机上传的图片（后台窗口同步执行），返回原始 JSON 文本。
export function confirmPhoneUploadPics(data: string): Promise<string> {
  return invoke<string>("confirm_phone_upload_pic", {data});
}

/// 创建 AI 配图会话，返回 get_session 原始 JSON 文本（session_id）。
export function aiImageGetSession(): Promise<string> {
  return invoke<string>("ai_image_get_session");
}

/// 获取 AI 配图比例与风格选项，返回 get_style 原始 JSON 文本。
export function aiImageGetStyle(sessionId: string): Promise<string> {
  return invoke<string>("ai_image_get_style", {sessionId});
}

/// 获取 AI 配图示例提示词，返回 get_example 原始 JSON 文本。
export function aiImageGetExample(sessionId: string): Promise<string> {
  return invoke<string>("ai_image_get_example", {sessionId});
}

/// 获取 AI 配图历史会话，返回 get_biz_recent_img_list 原始 JSON 文本。
export function aiImageGetBizRecentImgList(limit: number): Promise<string> {
  return invoke<string>("ai_image_get_biz_recent_img_list", {limit});
}

/// 相关图搜索，返回 related_search 原始 JSON 文本。
export function aiImageRelatedSearch(
  sessionId: string,
  prompt: string,
  ratio: string,
  limit: number,
  offset: number,
): Promise<string> {
  return invoke<string>("ai_image_related_search", {sessionId, prompt, ratio, limit, offset});
}

/// 把相关图注册到当前会话，返回 append_related_search 原始 JSON 文本（id）。
export function aiImageAppendRelatedSearch(data: string): Promise<string> {
  return invoke<string>("ai_image_append_related_search", {data});
}

/// 提交 AI 生成任务，返回 start_ai_creation 原始 JSON 文本。
export function aiImageStartCreation(data: string): Promise<string> {
  return invoke<string>("ai_image_start_creation", {data});
}

/// 轮询 AI 生成结果，返回 get_ai_pic 原始 JSON 文本。
export function aiImageGetPic(taskId: string, sessionId: string): Promise<string> {
  return invoke<string>("ai_image_get_pic", {taskId, sessionId});
}

/// 把 AI 生成图转换为永久素材，返回 insert_ai_pic 原始 JSON 文本（fileid + cdn_url）。
export function aiImageInsertPic(data: string): Promise<string> {
  return invoke<string>("ai_image_insert_pic", {data});
}

const VIDEO_MEDIA_KEY = "vs-video-media-ids";

// 本地保存 vid → media_id 映射，供预览播放取流使用（iframe 不能携带 media_id，
// 微信会剥离未知 data 属性导致视频被删）。
export function saveVideoMediaId(vid: string, mediaId: string): void {
  try {
    const raw = localStorage.getItem(VIDEO_MEDIA_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[vid] = mediaId;
    localStorage.setItem(VIDEO_MEDIA_KEY, JSON.stringify(map));
  } catch {
    // 存储失败不阻断插入
  }
}

export function loadVideoMediaId(vid: string): string | null {
  try {
    const raw = localStorage.getItem(VIDEO_MEDIA_KEY);
    if (!raw) return null;
    const map: Record<string, string> = JSON.parse(raw);
    return map[vid] ?? null;
  } catch {
    return null;
  }
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

// 时长统一为 mm:ss 展示值：毫秒转 mm:ss，已是 mm:ss 则原样返回。
function voicePlayLengthLabel(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (!/^\d+$/.test(raw)) return raw;
  const totalSeconds = Math.round(Number(raw) / 1000);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return raw;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// 从毫秒或 mm:ss 计算秒数（用于 mp-common-mpaudio 的 duration 属性）。
function voiceDurationSeconds(value: string): string | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    const seconds = Math.round(Number(raw) / 1000);
    return Number.isFinite(seconds) && seconds > 0 ? String(seconds) : undefined;
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 ? String(seconds) : undefined;
}

// 公众号后台「素材库 → 音频」列表接口响应里的音频字段（用户从浏览器
// Network 复制），携带官方 API 不提供的 voice_encode_fileid。
export interface VoiceBackendCandidate {
  name: string;
  voiceEncodeFileid: string;
  playLength: string;
  lowSize?: string;
  sourceSize?: string;
  highSize?: string;
  coverUrl?: string;
}

function formatVoicePlayLength(playLength: unknown): string {
  const value = String(playLength ?? "").trim();
  if (!value) return "";
  if (!/^\d+$/.test(value)) return value;
  const totalSeconds = Math.round(Number(value) / 1000);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return value;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function kbSize(bytes: unknown, digits: number): string | undefined {
  const value = typeof bytes === "number" ? bytes : Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return (value / 1024).toFixed(digits);
}

// 解析后台素材接口响应，兼容整体对象（file_item 数组）或直接数组两种形态。
export function parseVoiceBackendResponse(source: string): VoiceBackendCandidate[] {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return [];
  }
  const record = data as {file_item?: unknown; page_info?: {file_item?: unknown}};
  const fileItems = Array.isArray(data)
    ? data
    : Array.isArray(record.file_item)
      ? record.file_item
      : record.page_info?.file_item;
  if (!Array.isArray(fileItems)) return [];

  const candidates: VoiceBackendCandidate[] = [];
  for (const item of fileItems) {
    const record = item as Record<string, unknown>;
    const voiceEncodeFileid =
      typeof record.voice_encode_fileid === "string" ? record.voice_encode_fileid.trim() : "";
    if (!voiceEncodeFileid) continue;
    const name =
      (typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : "");
    if (!name) continue;
    const lowSize = kbSize(record.voice_low_media_size, 2);
    candidates.push({
      name,
      voiceEncodeFileid,
      playLength: formatVoicePlayLength(record.play_length),
      lowSize,
      sourceSize: lowSize ? String(Number(lowSize).toFixed(1)) : undefined,
      highSize: kbSize(record.voice_high_media_size, 2),
      coverUrl:
        typeof record.voice_cover_url === "string" ? record.voice_cover_url : undefined,
    });
  }
  return candidates;
}

// 用后台响应里的标识按名称批量绑定素材库音频，返回绑定成功数量。
export function bindVoiceMaterials(
  voiceItems: MaterialVoice[],
  candidates: VoiceBackendCandidate[],
): number {
  let bound = 0;
  for (const item of voiceItems) {
    const candidate = candidates.find((candidate) => candidate.name === item.name);
    if (!candidate) continue;
    saveVoiceBinding(item.mediaId, {
      voiceEncodeFileid: candidate.voiceEncodeFileid,
      name: candidate.name,
      playLength: candidate.playLength,
      src: `/cgi-bin/readtemplate?t=tmpl/audio_tmpl&name=${encodeURIComponent(candidate.name)}&play_length=${candidate.playLength}`,
      coverUrl: candidate.coverUrl,
      lowSize: candidate.lowSize,
      sourceSize: candidate.sourceSize,
      highSize: candidate.highSize,
    });
    bound += 1;
  }
  return bound;
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
    coverUrl: node.getAttribute("cover")?.trim() || undefined,
    isaac2: node.getAttribute("isaac2")?.trim() || undefined,
    lowSize: node.getAttribute("low_size")?.trim() || undefined,
    sourceSize: node.getAttribute("source_size")?.trim() || undefined,
    highSize: node.getAttribute("high_size")?.trim() || undefined,
    author: node.getAttribute("author")?.trim() || undefined,
  };
}

// 生成微信图文可发布的 mp-common-mpaudio 标签（官方新版音频卡片格式，
// 实测 draft/add 原样保留 cover/fileid 并可播放）。
export function formatVoiceMarkup(info: VoiceCodeInfo): string {
  const attr = (name: string, value: string | undefined) =>
    value ? ` ${name}="${escapeHtmlAttribute(value)}"` : "";
  const playLength = voicePlayLengthLabel(info.playLength);
  const duration = voiceDurationSeconds(info.playLength);
  return (
    `<mp-common-mpaudio class="mp_common_widget"` +
    attr("src", info.src) +
    attr("cover", info.coverUrl) +
    attr("author", info.author) +
    attr("isaac2", info.isaac2) +
    attr("low_size", info.lowSize) +
    attr("source_size", info.sourceSize) +
    attr("high_size", info.highSize) +
    attr("name", info.name) +
    attr("play_length", playLength) +
    attr("duration", duration) +
    attr("voice_encode_fileid", info.voiceEncodeFileid) +
    ' show-listen-later="1" data-topic_id="" data-topic_name=""></mp-common-mpaudio>'
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
      return OFFICIAL_IMG_HOSTS.includes(parsed.hostname.toLowerCase()) ? null : "external";
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
