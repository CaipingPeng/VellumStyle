// 发布草稿箱：上传封面拿 media_id + add_draft；发布前校验正文无未上传外链图。
import {invoke} from "@tauri-apps/api/core";
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

export async function uploadThumb(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buf));
  return invoke<string>("upload_thumb", {
    bytes,
    filename: file.name || "thumb",
    mime: file.type,
  });
}

export function uploadRemoteThumb(url: string): Promise<string> {
  return invoke<string>("upload_remote_thumb", {url});
}

export function listImageMaterials(offset: number, count: number): Promise<MaterialImagePage> {
  return invoke<MaterialImagePage>("list_image_materials", {offset, count});
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
