// 发布草稿箱：上传封面拿 media_id + add_draft；发布前校验正文无未上传外链图。
import {invoke} from "@tauri-apps/api/core";
import type {MediaRef} from "./markdownMediaScanner.ts";
import {scanMarkdownMedia} from "./markdownMediaScanner.ts";
import {DEFAULT_PUBLISH_SETTINGS, type PublishSettings} from "./publishSettings.ts";

const MMBIZ_HOSTS = ["mmbiz.qpic.cn", "mmbiz.qlogo.cn"];

export interface CoverCandidate {
  url: string;
  syntax: MediaRef["syntax"];
  sourceType: MediaRef["sourceType"];
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

// 返回正文里仍为非 mmbiz 远程/本地图片的 url 列表（发布前需先上传）。
export function findUnuploadedImages(markdown: string): string[] {
  const refs = scanMarkdownMedia(markdown);
  const bad: string[] = [];
  for (const ref of refs) {
    if (ref.mediaType !== "image") continue;
    if (ref.sourceType === "remote") {
      if (!isMmbizImageUrl(ref.originalUrl)) bad.push(ref.originalUrl);
    } else if (ref.sourceType === "local") {
      bad.push(ref.originalUrl);
    }
  }
  return bad;
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
  const normalized = normalizeRemoteImageUrl(url);
  if (!normalized) return false;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return MMBIZ_HOSTS.includes(host);
  } catch {
    return MMBIZ_HOSTS.some((host) => normalized.includes(host));
  }
}
