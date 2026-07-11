export type MediaType = "image" | "video";
export type MediaSourceType = "local" | "remote" | "data" | "blob" | "anchor" | "unsupported" | "empty";
export type MediaSyntax = "markdown-image" | "markdown-link" | "html-img" | "html-video" | "html-source" | "image-flow" | "obsidian-embed";
export type ReplacementMode = "url" | "token";

export interface ObsidianMeta {
  target: string;
  alt: string;
  size?: string;
}

export interface HtmlImageMeta {
  alt: string;
  width?: string;
  height?: string;
}

export interface MediaRef {
  start: number;
  end: number;
  originalUrl: string;
  mediaType: MediaType;
  sourceType: MediaSourceType;
  syntax: MediaSyntax;
  replacementMode: ReplacementMode;
  obsidianMeta?: ObsidianMeta;
  htmlImageMeta?: HtmlImageMeta;
}

const IMAGE_EXT = /\.(?:jpe?g|png|gif|svg)(?:[?#].*)?$/i;
const VIDEO_EXT = /\.(?:mp4|mov|m4v|webm|avi|mkv)(?:[?#].*)?$/i;
const MARKDOWN_IMAGE_RE = /!\[([^\]\\]*(?:\\.[^\]\\]*)*)\]\(([^)\n]+)\)/g;
const MARKDOWN_LINK_RE = /(?<!!)\[([^\]\\]*(?:\\.[^\]\\]*)*)\]\(([^)\n]+)\)/g;
const HTML_MEDIA_RE = /<(img|video|source)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\2[^>]*>/gi;
const OBSIDIAN_EMBED_RE = /!\[\[([^\]\n]+)\]\]/g;

export function scanMarkdownMedia(markdown: string): MediaRef[] {
  const refs: MediaRef[] = [];
  refs.push(...scanMarkdownImages(markdown));
  refs.push(...scanHtmlMedia(markdown));
  refs.push(...scanObsidianEmbeds(markdown));
  refs.push(...scanMarkdownVideoLinks(markdown));
  return dedupeRefs(refs).sort((a, b) => a.start - b.start);
}

export function classifyMediaSource(url: string): MediaSourceType {
  const value = url.trim();
  if (!value) return "empty";
  if (value.startsWith("#")) return "anchor";
  if (/^data:/i.test(value)) return "data";
  if (/^blob:/i.test(value)) return "blob";
  if (/^(https?):\/\//i.test(value)) return "remote";
  if (/^\/\//.test(value)) return "remote";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return "unsupported";
  return "local";
}

export function isImageUrl(url: string): boolean {
  return IMAGE_EXT.test(stripUrlDecorations(url));
}

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(stripUrlDecorations(url));
}

export function toObsidianMarkdownImage(url: string, meta?: ObsidianMeta): string {
  const alt = meta?.alt ?? "";
  const size = meta?.size;
  if (size) {
    return `![${escapeMarkdownAlt(alt)}](${url} =${size})`;
  }
  return `![${escapeMarkdownAlt(alt)}](${url})`;
}

function scanMarkdownImages(markdown: string): MediaRef[] {
  const refs: MediaRef[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const rawInner = match[2];
    const parsed = parseMarkdownDestination(rawInner);
    if (!parsed) continue;

    const matchStart = match.index ?? 0;
    const innerStart = matchStart + match[0].indexOf(rawInner);
    refs.push({
      start: innerStart + parsed.urlStart,
      end: innerStart + parsed.urlEnd,
      originalUrl: parsed.url,
      mediaType: isVideoUrl(parsed.url) ? "video" : "image",
      sourceType: classifyMediaSource(parsed.url),
      syntax: "markdown-image",
      replacementMode: "url",
    });
  }
  return refs;
}

function scanMarkdownVideoLinks(markdown: string): MediaRef[] {
  const refs: MediaRef[] = [];
  for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
    const rawInner = match[2];
    const parsed = parseMarkdownDestination(rawInner);
    if (!parsed || !isVideoUrl(parsed.url)) continue;

    const matchStart = match.index ?? 0;
    const innerStart = matchStart + match[0].indexOf(rawInner);
    refs.push({
      start: innerStart + parsed.urlStart,
      end: innerStart + parsed.urlEnd,
      originalUrl: parsed.url,
      mediaType: "video",
      sourceType: classifyMediaSource(parsed.url),
      syntax: "markdown-link",
      replacementMode: "url",
    });
  }
  return refs;
}

function scanHtmlMedia(markdown: string): MediaRef[] {
  const refs: MediaRef[] = [];
  for (const match of markdown.matchAll(HTML_MEDIA_RE)) {
    const tag = match[1].toLowerCase();
    const url = match[3];
    const matchStart = match.index ?? 0;
    const urlStart = matchStart + match[0].indexOf(url);
    const isImage = tag === "img";
    refs.push({
      start: isImage ? matchStart : urlStart,
      end: isImage ? matchStart + match[0].length : urlStart + url.length,
      originalUrl: url,
      mediaType: isImage ? "image" : "video",
      sourceType: classifyMediaSource(url),
      syntax: isImage ? "html-img" : tag === "video" ? "html-video" : "html-source",
      replacementMode: isImage ? "token" : "url",
      htmlImageMeta: isImage ? parseHtmlImageMeta(match[0]) : undefined,
    });
  }
  return refs;
}

function parseHtmlImageMeta(tag: string): HtmlImageMeta {
  const alt = htmlAttribute(tag, "alt") ?? "";
  const width = htmlAttribute(tag, "width");
  const height = htmlAttribute(tag, "height");
  if (width !== undefined || height !== undefined) {
    return {alt, width, height};
  }

  const style = htmlAttribute(tag, "style") ?? "";
  const zoom = /(?:^|;)\s*zoom\s*:\s*([^;]+)/i.exec(style)?.[1].trim();
  return {alt, width: zoom || undefined};
}

function htmlAttribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

function scanObsidianEmbeds(markdown: string): MediaRef[] {
  const refs: MediaRef[] = [];
  for (const match of markdown.matchAll(OBSIDIAN_EMBED_RE)) {
    const body = match[1].trim();
    const meta = parseObsidianBody(body);
    const target = meta.target;
    if (!target) continue;

    refs.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      originalUrl: target,
      mediaType: isVideoUrl(target) ? "video" : "image",
      sourceType: classifyMediaSource(target),
      syntax: "obsidian-embed",
      replacementMode: "token",
      obsidianMeta: meta,
    });
  }
  return refs;
}

function parseMarkdownDestination(value: string): {url: string; urlStart: number; urlEnd: number} | null {
  let i = 0;
  while (i < value.length && /\s/.test(value[i])) i++;
  if (i >= value.length) return null;

  if (value[i] === "<") {
    const close = value.indexOf(">", i + 1);
    if (close === -1) return null;
    return {url: value.slice(i + 1, close), urlStart: i + 1, urlEnd: close};
  }

  const start = i;
  const mediaUrlEnd = findMediaPathEnd(value, start);
  if (mediaUrlEnd) {
    const url = value.slice(start, mediaUrlEnd).trim();
    return {url, urlStart: start, urlEnd: start + url.length};
  }

  let inQuote: string | null = null;
  while (i < value.length) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== "\\") {
      inQuote = inQuote === ch ? null : inQuote ?? ch;
    }
    if (!inQuote && /\s/.test(ch)) break;
    i++;
  }

  const url = value.slice(start, i).trim();
  if (!url) return null;
  return {url, urlStart: start, urlEnd: start + url.length};
}

function findMediaPathEnd(value: string, start: number): number | null {
  const rest = value.slice(start);
  const match = rest.match(/^.+?\.(?:jpe?g|png|gif|mp4|mov|m4v|webm|avi|mkv)(?:[?#][^\s]*)?/i);
  if (!match) return null;
  return start + match[0].length;
}

function parseObsidianBody(body: string): ObsidianMeta {
  const [targetPart, ...rest] = body.split("|");
  const target = targetPart.trim();
  const hint = rest.join("|").trim();
  const size = parseObsidianSize(hint);
  return {
    target,
    alt: size ? "" : hint,
    size,
  };
}

function parseObsidianSize(hint: string): string | undefined {
  if (/^\d+$/.test(hint)) return `${hint}x`;
  if (/^\d+x\d+$/.test(hint)) return hint;
  if (/^\d+x$/.test(hint)) return hint;
  if (/^x\d+$/.test(hint)) return hint;
  return undefined;
}

function dedupeRefs(refs: MediaRef[]): MediaRef[] {
  const seen = new Set<string>();
  const out: MediaRef[] = [];
  for (const ref of refs) {
    const key = `${ref.start}:${ref.end}:${ref.syntax}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function stripUrlDecorations(url: string): string {
  return url.split(/[?#]/)[0];
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

