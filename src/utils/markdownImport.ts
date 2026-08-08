import {invoke} from "@tauri-apps/api/core";
import {
  scanMarkdownMedia,
  type MediaRef,
  type MediaSourceType,
} from "./markdownMediaScanner.ts";
import {formatHtmlImage} from "../markdown/imageMarkdown.ts";
import {uploadLocalImage, uploadRemoteImage} from "./upload.ts";
import {imageUploadTasks} from "./imageUploadTasks.ts";
import {
  createBackgroundDocumentTarget,
  isBackgroundDocumentTargetCancelled,
  releaseBackgroundDocumentTarget,
  updateDocumentInBackground,
  type BackgroundDocumentTarget,
} from "./backgroundDocumentUpdates.ts";

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

export interface PreparedMarkdownImport {
  content: string;
  markdownPath: string;
  baseDir: string;
  resourceRoot?: string;
  refs: MediaRef[];
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
const BACKGROUND_IMAGE_CONCURRENCY = 16;

export async function importMarkdownFile(
  options: ImportMarkdownOptions,
  onProgress?: (progress: ImportMarkdownProgress) => void,
): Promise<ImportMarkdownResult> {
  const prepared = await prepareMarkdownImport(options, onProgress);
  return processPreparedMarkdownImport(prepared, onProgress);
}

export async function prepareMarkdownImport(
  options: ImportMarkdownOptions,
  onProgress?: (progress: ImportMarkdownProgress) => void,
): Promise<PreparedMarkdownImport> {
  onProgress?.({phase: "reading", current: options.markdownPath});
  const payload = await invoke<MarkdownFilePayload>("read_markdown_file", {path: options.markdownPath});
  onProgress?.({phase: "scanning"});
  return {
    content: payload.content,
    markdownPath: payload.path,
    baseDir: payload.base_dir,
    resourceRoot: options.resourceRoot || undefined,
    refs: scanMarkdownMedia(payload.content),
  };
}

export async function processMarkdownImportInBackground(
  prepared: PreparedMarkdownImport,
  documentPath: string,
): Promise<ImportMarkdownResult> {
  const documentTitle = documentPath.split("/").pop() || documentPath;
  const documentTarget = createBackgroundDocumentTarget(documentPath);
  try {
    return await processPreparedMarkdownImport(prepared, undefined, {
      documentTitle,
      documentTarget,
      onUploaded: async (ref, uploadedUrl) => {
        await updateDocumentInBackground(documentTarget, (content) =>
          replaceMatchingImageRefs(content, ref, uploadedUrl),
        );
        if (isBackgroundDocumentTargetCancelled(documentTarget)) {
          throw new Error("文章已删除，图片写回已取消");
        }
      },
    });
  } finally {
    releaseBackgroundDocumentTarget(documentTarget);
  }
}

// 图片处理在后台按单图任务逐个上报（每张图自带成败与原因），不再创建
// 「N 张图片」的文章级汇总任务，避免同一张图的失败信息出现两次。
export function enqueueMarkdownImageImport(
  prepared: PreparedMarkdownImport,
  documentPath: string,
): Promise<ImportMarkdownResult> {
  return processMarkdownImportInBackground(prepared, documentPath);
}

interface ProcessImportOptions {
  documentTitle: string;
  documentTarget: BackgroundDocumentTarget;
  onUploaded: (ref: MediaRef, uploadedUrl: string) => Promise<void>;
}

async function processPreparedMarkdownImport(
  prepared: PreparedMarkdownImport,
  onProgress?: (progress: ImportMarkdownProgress) => void,
  background?: ProcessImportOptions,
): Promise<ImportMarkdownResult> {
  const refs = prepared.refs;
  const result: ImportMarkdownResult = {
    content: prepared.content,
    markdownPath: prepared.markdownPath,
    baseDir: prepared.baseDir,
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
  const uploadCache = new Map<string, Promise<string>>();
  const uploadableRefs = imageRefs.filter((ref) => UPLOADABLE_SOURCE_TYPES.has(ref.sourceType));
  let completed = 0;
  let nextRefIndex = 0;
  let documentUpdateQueue: Promise<void> = Promise.resolve();

  for (const ref of imageRefs) {
    if (!UPLOADABLE_SOURCE_TYPES.has(ref.sourceType)) {
      result.unsupported.push(toItem(ref, unsupportedReason(ref.sourceType)));
    }
  }

  const processRef = async (ref: MediaRef) => {
    if (background && isBackgroundDocumentTargetCancelled(background.documentTarget)) {
      result.failed.push(toItem(ref, "文章已删除，图片处理已取消"));
      completed += 1;
      return;
    }
    onProgress?.({
      phase: ref.sourceType === "local" ? "resolving" : "uploading",
      current: ref.originalUrl,
      completed,
      total: uploadableRefs.length,
    });

    try {
      const uploadedUrl = ref.sourceType === "local"
        ? await uploadLocalRef(
            ref,
            prepared.baseDir,
            prepared.resourceRoot,
            uploadCache,
            result,
            background,
          )
        : await uploadRemoteRef(ref, uploadCache, result, background);

      if (uploadedUrl) {
        if (background) {
          const update = documentUpdateQueue.then(() => background.onUploaded(ref, uploadedUrl));
          documentUpdateQueue = update.then(() => undefined, () => undefined);
          await update;
        } else {
          replacements.push({
            start: ref.start,
            end: ref.end,
            value: replacementValueForRef(ref, uploadedUrl),
          });
        }
      }
    } catch (e) {
      result.failed.push(toItem(ref, errorMessage(e)));
    } finally {
      completed += 1;
      onProgress?.({phase: "uploading", current: ref.originalUrl, completed, total: uploadableRefs.length});
    }
  };

  const workers = Array.from(
    {length: Math.min(BACKGROUND_IMAGE_CONCURRENCY, uploadableRefs.length)},
    async () => {
      while (nextRefIndex < uploadableRefs.length) {
        const ref = uploadableRefs[nextRefIndex++];
        await processRef(ref);
      }
    },
  );
  await Promise.all(workers);

  onProgress?.({phase: "replacing"});
  result.content = background
    ? prepared.content
    : applyReplacements(prepared.content, replacements);
  // 同一张图被多处引用时，上传失败会为每个引用各记一条失败；按 URL 去重，
  // 让「N 张图片处理失败」反映的是失败的唯一图片数，而不是引用次数。
  result.failed = dedupeFailedByUrl(result.failed);
  onProgress?.({phase: "done", completed, total: uploadableRefs.length});
  return result;
}

async function uploadLocalRef(
  ref: MediaRef,
  baseDir: string,
  resourceRoot: string | undefined,
  uploadCache: Map<string, Promise<string>>,
  result: ImportMarkdownResult,
  background?: ProcessImportOptions,
): Promise<string | null> {
  const resolved = await invoke<ResolvedMedia>("resolve_import_media", {
    baseDir,
    resourceRoot: resourceRoot || null,
    rawUrl: ref.originalUrl,
  });

  if (resolved.status !== "found" || !resolved.path) {
    const reason = resolved.reason || resolveFailureReason(resolved.status);
    result.failed.push(toItem(ref, reason));
    if (background) {
      const taskId = imageUploadTasks.start(
        displayNameForRef(ref),
        "导入图片",
        backgroundTaskContext(background),
      );
      imageUploadTasks.progress({taskId, filename: displayNameForRef(ref), phase: "resolving"});
      imageUploadTasks.fail(taskId, reason);
    }
    return null;
  }

  const cacheKey = `local:${resolved.path}`;
  let upload = uploadCache.get(cacheKey);
  if (!upload) {
    upload = uploadLocalImage(
      resolved.path,
      "导入图片",
      undefined,
      backgroundTaskContext(background),
    );
    uploadCache.set(cacheKey, upload);
  }
  const url = await upload;
  result.uploadedLocal.push(toItem(ref, undefined, resolved.path, url));
  return url;
}

async function uploadRemoteRef(
  ref: MediaRef,
  uploadCache: Map<string, Promise<string>>,
  result: ImportMarkdownResult,
  background?: ProcessImportOptions,
): Promise<string | null> {
  const normalized = normalizeRemoteUrl(ref.originalUrl);
  const cacheKey = `remote:${normalized}`;
  let upload = uploadCache.get(cacheKey);
  if (!upload) {
    upload = uploadRemoteImage(normalized, "导入图片", backgroundTaskContext(background));
    uploadCache.set(cacheKey, upload);
  }
  const url = await upload;
  result.uploadedRemote.push(toItem(ref, undefined, undefined, url));
  return url;
}

function backgroundTaskContext(background?: ProcessImportOptions): {
  documentPath?: string;
  documentTitle?: string;
} {
  if (!background) return {};
  const documentPath = background.documentTarget.path;
  return {
    documentPath,
    documentTitle: documentPath.split("/").pop() || background.documentTitle,
  };
}

function replaceMatchingImageRefs(content: string, originalRef: MediaRef, uploadedUrl: string): string {
  const replacements = scanMarkdownMedia(content)
    .filter((ref) =>
      ref.mediaType === "image"
      && ref.sourceType === originalRef.sourceType
      && ref.originalUrl === originalRef.originalUrl,
    )
    .map((ref) => ({
      start: ref.start,
      end: ref.end,
      value: replacementValueForRef(ref, uploadedUrl),
    }));
  return applyReplacements(content, replacements);
}

function displayNameForRef(ref: MediaRef): string {
  const value = ref.originalUrl.split(/[\\/]/).filter(Boolean).pop();
  return value ? value.split(/[?#]/, 1)[0] || "导入图片" : "导入图片";
}

function applyReplacements(content: string, replacements: Replacement[]): string {
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((output, replacement) => {
      return output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
    }, content);
}

function dedupeFailedByUrl(items: ImportedMediaItem[]): ImportedMediaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.originalUrl)) {
      return false;
    }
    seen.add(item.originalUrl);
    return true;
  });
}

function replacementValueForRef(ref: MediaRef, uploadedUrl: string): string {
  if (ref.syntax === "image-flow") {
    // 横滑图组整体保留原结构，只替换组内图片 URL。
    return uploadedUrl;
  }
  if (ref.mediaType === "image") {
    // 统一归一化为 <img src alt width height> 标签语法。
    const obsidianSize = parseObsidianSizeParts(ref.obsidianMeta?.size);
    return formatHtmlImage({
      src: uploadedUrl,
      alt: ref.alt ?? ref.htmlImageMeta?.alt ?? ref.obsidianMeta?.alt ?? "",
      width: ref.width ?? ref.htmlImageMeta?.width ?? obsidianSize?.width,
      height: ref.height ?? ref.htmlImageMeta?.height ?? obsidianSize?.height,
    });
  }
  return uploadedUrl;
}

function parseObsidianSizeParts(size?: string): {width?: string; height?: string} | undefined {
  if (!size) return undefined;
  const match = /^(\d*%?)x(\d*%?)$/.exec(size);
  if (!match) return undefined;
  return {
    width: match[1] || undefined,
    height: match[2] || undefined,
  };
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
