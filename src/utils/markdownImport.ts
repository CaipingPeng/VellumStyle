import {invoke} from "@tauri-apps/api/core";
import {
  scanMarkdownMedia,
  toObsidianMarkdownImage,
  type MediaRef,
  type MediaSourceType,
} from "./markdownMediaScanner.ts";
import {formatMarkdownImage} from "../markdown/imageMarkdown.ts";

export type ImportPhase = "reading" | "scanning" | "resolving" | "uploading" | "replacing" | "done";

export interface ImportMarkdownProgress {
  phase: ImportPhase;
  current?: string;
  completed?: number;
  total?: number;
}

export interface ImportMarkdownOptions {
  markdownPath: string;
  resourceRoot?: string | null;
}

export interface ImportMarkdownResult {
  content: string;
  markdownPath: string;
  baseDir: string;
  totalRefs: number;
  uploadedLocal: ImportedMediaItem[];
  uploadedRemote: ImportedMediaItem[];
  skipped: ImportedMediaItem[];
  failed: ImportedMediaItem[];
  unsupported: ImportedMediaItem[];
}

export interface ImportedMediaItem {
  originalUrl: string;
  resolvedPath?: string;
  replacementUrl?: string;
  sourceType: MediaSourceType;
  syntax: MediaRef["syntax"];
  reason?: string;
}

interface MarkdownFilePayload {
  path: string;
  base_dir: string;
  content: string;
}

interface ResolvedMedia {
  status: "found" | "missing" | "ambiguous" | "unsupported";
  path?: string | null;
  candidates: string[];
  reason?: string | null;
}

interface Replacement {
  start: number;
  end: number;
  value: string;
}

const UPLOADABLE_SOURCE_TYPES = new Set<MediaSourceType>(["local", "remote"]);

export async function importMarkdownFile(
  options: ImportMarkdownOptions,
  onProgress?: (progress: ImportMarkdownProgress) => void,
): Promise<ImportMarkdownResult> {
  onProgress?.({phase: "reading", current: options.markdownPath});
  const payload = await invoke<MarkdownFilePayload>("read_markdown_file", {path: options.markdownPath});

  onProgress?.({phase: "scanning"});
  const refs = scanMarkdownMedia(payload.content);
  const result: ImportMarkdownResult = {
    content: payload.content,
    markdownPath: payload.path,
    baseDir: payload.base_dir,
    totalRefs: refs.length,
    uploadedLocal: [],
    uploadedRemote: [],
    skipped: [],
    failed: [],
    unsupported: [],
  };

  const imageRefs = refs.filter((ref) => ref.mediaType === "image");
  const videoRefs = refs.filter((ref) => ref.mediaType === "video");
  for (const ref of videoRefs) {
    result.unsupported.push(toItem(ref, "当前版本仅支持图片自动上传，视频已识别但未替换。"));
  }

  const replacements: Replacement[] = [];
  const uploadCache = new Map<string, string>();
  const uploadableRefs = imageRefs.filter((ref) => UPLOADABLE_SOURCE_TYPES.has(ref.sourceType));
  let completed = 0;

  for (const ref of imageRefs) {
    if (!UPLOADABLE_SOURCE_TYPES.has(ref.sourceType)) {
      result.unsupported.push(toItem(ref, unsupportedReason(ref.sourceType)));
    }
  }

  for (const ref of uploadableRefs) {
    onProgress?.({
      phase: ref.sourceType === "local" ? "resolving" : "uploading",
      current: ref.originalUrl,
      completed,
      total: uploadableRefs.length,
    });

    try {
      const uploadedUrl = ref.sourceType === "local"
        ? await uploadLocalRef(ref, payload.base_dir, options.resourceRoot || undefined, uploadCache, result)
        : await uploadRemoteRef(ref, uploadCache, result);

      if (uploadedUrl) {
        replacements.push({
          start: ref.start,
          end: ref.end,
          value: replacementValueForRef(ref, uploadedUrl),
        });
      }
    } catch (e) {
      result.failed.push(toItem(ref, errorMessage(e)));
    } finally {
      completed += 1;
      onProgress?.({phase: "uploading", current: ref.originalUrl, completed, total: uploadableRefs.length});
    }
  }

  onProgress?.({phase: "replacing"});
  result.content = applyReplacements(payload.content, replacements);
  onProgress?.({phase: "done", completed, total: uploadableRefs.length});
  return result;
}

async function uploadLocalRef(
  ref: MediaRef,
  baseDir: string,
  resourceRoot: string | undefined,
  uploadCache: Map<string, string>,
  result: ImportMarkdownResult,
): Promise<string | null> {
  const resolved = await invoke<ResolvedMedia>("resolve_import_media", {
    baseDir,
    resourceRoot: resourceRoot || null,
    rawUrl: ref.originalUrl,
  });

  if (resolved.status !== "found" || !resolved.path) {
    result.failed.push(toItem(ref, resolved.reason || resolveFailureReason(resolved.status)));
    return null;
  }

  const cacheKey = `local:${resolved.path}`;
  const cached = uploadCache.get(cacheKey);
  if (cached) {
    result.uploadedLocal.push(toItem(ref, undefined, resolved.path, cached));
    return cached;
  }

  const url = await invoke<string>("upload_local_image", {path: resolved.path});
  uploadCache.set(cacheKey, url);
  result.uploadedLocal.push(toItem(ref, undefined, resolved.path, url));
  return url;
}

async function uploadRemoteRef(
  ref: MediaRef,
  uploadCache: Map<string, string>,
  result: ImportMarkdownResult,
): Promise<string | null> {
  const normalized = normalizeRemoteUrl(ref.originalUrl);
  const cacheKey = `remote:${normalized}`;
  const cached = uploadCache.get(cacheKey);
  if (cached) {
    result.uploadedRemote.push(toItem(ref, undefined, undefined, cached));
    return cached;
  }

  const url = await invoke<string>("upload_remote_image", {url: normalized});
  uploadCache.set(cacheKey, url);
  result.uploadedRemote.push(toItem(ref, undefined, undefined, url));
  return url;
}

function applyReplacements(content: string, replacements: Replacement[]): string {
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((output, replacement) => {
      return output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
    }, content);
}

function replacementValueForRef(ref: MediaRef, uploadedUrl: string): string {
  if (ref.syntax === "obsidian-embed") {
    return toObsidianMarkdownImage(uploadedUrl, ref.obsidianMeta);
  }
  if (ref.replacementMode === "token") {
    return formatMarkdownImage({alt: "", url: uploadedUrl});
  }
  return uploadedUrl;
}

function normalizeRemoteUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function toItem(ref: MediaRef, reason?: string, resolvedPath?: string, replacementUrl?: string): ImportedMediaItem {
  return {
    originalUrl: ref.originalUrl,
    resolvedPath,
    replacementUrl,
    sourceType: ref.sourceType,
    syntax: ref.syntax,
    reason,
  };
}

function unsupportedReason(sourceType: MediaSourceType): string {
  switch (sourceType) {
    case "data":
      return "暂不处理 data URL 图片。";
    case "blob":
      return "blob URL 无法从导入文件恢复真实图片数据。";
    case "anchor":
    case "empty":
      return "空链接或锚点无需处理。";
    case "unsupported":
      return "暂不支持该 URL scheme。";
    default:
      return "暂不支持该图片来源。";
  }
}

function resolveFailureReason(status: ResolvedMedia["status"]): string {
  switch (status) {
    case "missing":
      return "未找到本地图片文件。";
    case "ambiguous":
      return "找到多个同名图片，未自动替换。";
    case "unsupported":
      return "不是可解析的本地图片路径。";
    default:
      return "本地图片解析失败。";
  }
}

function errorMessage(e: unknown): string {
  return typeof e === "string" ? e : (e as Error)?.message || "处理失败";
}
