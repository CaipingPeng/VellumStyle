import MarkdownIt from "markdown-it";

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

interface SourceRange {
  start: number;
  end: number;
}

interface HtmlTagRange extends SourceRange {
  name: string;
  closing: boolean;
  source: string;
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
const OBSIDIAN_EMBED_RE = /!\[\[([^\]\n]+)\]\]/g;
const markdownIt = new MarkdownIt({html: true});

export function scanMarkdownMedia(markdown: string): MediaRef[] {
  const ignoredRanges = findIgnoredCodeRanges(markdown);
  const refs: MediaRef[] = [];
  refs.push(...scanMarkdownImages(markdown));
  refs.push(...scanHtmlMedia(markdown));
  refs.push(...scanObsidianEmbeds(markdown));
  refs.push(...scanMarkdownVideoLinks(markdown));
  return dedupeRefs(refs)
    .filter((ref) => !ignoredRanges.some((range) => overlapsRange(ref, range)))
    .sort((a, b) => a.start - b.start);
}

function findIgnoredCodeRanges(markdown: string): SourceRange[] {
  const tokens = markdownIt.parse(markdown, {});
  const lineStarts = findLineStarts(markdown);
  const ranges: SourceRange[] = [];

  for (const token of tokens) {
    if (!token.map) continue;
    const tokenRange = sourceRangeFromLineMap(token.map, lineStarts, markdown.length);
    if (token.type === "fence" || token.type === "code_block") {
      ranges.push(tokenRange);
      continue;
    }

    const source = markdown.slice(tokenRange.start, tokenRange.end);
    if (token.type === "html_block") {
      const htmlCodeRanges = findHtmlCodeRanges(source);
      if (/^\s*<pre\b/i.test(token.content)) {
        const blockPreStart = findHtmlTags(source).find((tag) => tag.name === "pre" && !tag.closing)?.start;
        const closedBlockPre = htmlCodeRanges.find((range) => range.start === blockPreStart);
        ranges.push(closedBlockPre ?? tokenRange);
      }
      ranges.push(...shiftRanges(htmlCodeRanges, tokenRange.start));
      continue;
    }
    if (token.type === "inline") {
      ranges.push(...shiftRanges(findInlineCodeRanges(source), tokenRange.start));
      ranges.push(...shiftRanges(findHtmlCodeRanges(source), tokenRange.start));
    }
  }

  return mergeRanges(ranges);
}

function shiftRanges(ranges: SourceRange[], offset: number): SourceRange[] {
  return ranges.map((range) => ({start: offset + range.start, end: offset + range.end}));
}

function findHtmlTags(source: string): HtmlTagRange[] {
  const tagPattern = /<\/?([A-Za-z][A-Za-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  return [...source.matchAll(tagPattern)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    name: match[1].toLowerCase(),
    closing: match[0].startsWith("</"),
    source: match[0],
  }));
}

function findHtmlCodeRanges(source: string): SourceRange[] {
  const openTags = new Map<string, SourceRange[]>();
  const ranges: SourceRange[] = [];

  for (const htmlTag of findHtmlTags(source)) {
    if (htmlTag.name !== "code" && htmlTag.name !== "pre") continue;
    if (isEscapedAt(source, htmlTag.start)) continue;

    const stack = openTags.get(htmlTag.name) ?? [];
    if (!htmlTag.closing) {
      stack.push(htmlTag);
      openTags.set(htmlTag.name, stack);
      continue;
    }

    const opener = stack.pop();
    if (opener) ranges.push({start: opener.start, end: htmlTag.end});
  }

  return ranges;
}

function findLineStarts(markdown: string): number[] {
  const starts = [0];
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function sourceRangeFromLineMap(map: [number, number], lineStarts: number[], sourceLength: number): SourceRange {
  return {
    start: lineStarts[map[0]] ?? sourceLength,
    end: lineStarts[map[1]] ?? sourceLength,
  };
}

function findInlineCodeRanges(markdown: string): SourceRange[] {
  const runs: Array<SourceRange & {length: number; escaped: boolean}> = [];
  const runIndicesByLength = new Map<number, number[]>();
  const htmlTags = findHtmlTags(markdown);
  let htmlTagIndex = 0;
  let offset = 0;
  while (offset < markdown.length) {
    while (htmlTags[htmlTagIndex]?.end <= offset) htmlTagIndex++;
    const htmlTag = htmlTags[htmlTagIndex];
    if (htmlTag && htmlTag.start <= offset) {
      offset = htmlTag.end;
      continue;
    }
    if (markdown[offset] !== "`") {
      offset++;
      continue;
    }

    const start = offset;
    while (offset < markdown.length && markdown[offset] === "`") offset++;
    const run = {start, end: offset, length: offset - start, escaped: isEscapedAt(markdown, start)};
    runs.push(run);
    const indices = runIndicesByLength.get(run.length) ?? [];
    indices.push(runs.length - 1);
    runIndicesByLength.set(run.length, indices);
  }

  const ranges: SourceRange[] = [];
  for (let i = 0; i < runs.length;) {
    const run = runs[i];
    const openerLength = run.length - (run.escaped ? 1 : 0);
    if (openerLength === 0) {
      i++;
      continue;
    }

    const closerIndex = findNextRunIndex(runIndicesByLength.get(openerLength), i);
    if (closerIndex === undefined) {
      i++;
      continue;
    }

    ranges.push({start: run.end - openerLength, end: runs[closerIndex].end});
    i = closerIndex + 1;
  }
  return ranges;
}

function findNextRunIndex(indices: number[] | undefined, currentIndex: number): number | undefined {
  if (!indices) return undefined;
  let low = 0;
  let high = indices.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (indices[middle] <= currentIndex) low = middle + 1;
    else high = middle;
  }
  return indices[low];
}

function isEscapedAt(source: string, offset: number): boolean {
  let backslashCount = 0;
  for (let i = offset - 1; i >= 0 && source[i] === "\\"; i--) backslashCount++;
  return backslashCount % 2 === 1;
}

function mergeRanges(ranges: SourceRange[]): SourceRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: SourceRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({...range});
    }
  }
  return merged;
}

function overlapsRange(ref: MediaRef, range: SourceRange): boolean {
  return ref.start < range.end && range.start < ref.end;
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
  for (const htmlTag of findHtmlTags(markdown)) {
    if (htmlTag.closing || !["img", "video", "source"].includes(htmlTag.name)) continue;
    const src = htmlAttributeInfo(htmlTag.source, "src");
    if (!src) continue;

    const urlStart = htmlTag.start + src.start;
    const isImage = htmlTag.name === "img";
    refs.push({
      start: isImage ? htmlTag.start : urlStart,
      end: isImage ? htmlTag.end : urlStart + src.value.length,
      originalUrl: src.value,
      mediaType: isImage ? "image" : "video",
      sourceType: classifyMediaSource(src.value),
      syntax: isImage ? "html-img" : htmlTag.name === "video" ? "html-video" : "html-source",
      replacementMode: isImage ? "token" : "url",
      htmlImageMeta: isImage ? parseHtmlImageMeta(htmlTag.source) : undefined,
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

function htmlAttributeInfo(tag: string, name: string): {value: string; start: number} | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (!match) return undefined;

  const value = match[1] ?? match[2] ?? match[3] ?? "";
  const quote = match[1] !== undefined ? '"' : match[2] !== undefined ? "'" : undefined;
  const relativeStart = quote ? match[0].indexOf(quote) + 1 : match[0].lastIndexOf(value);
  return {value, start: match.index + relativeStart};
}

function htmlAttribute(tag: string, name: string): string | undefined {
  return htmlAttributeInfo(tag, name)?.value;
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

