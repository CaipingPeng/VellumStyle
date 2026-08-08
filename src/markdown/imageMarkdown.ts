export interface MarkdownImageInput {
  alt: string;
  url: string;
  title?: string;
  width?: number | string;
  height?: number | string;
}

export interface HtmlImageInput {
  src: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
}

export interface ReplaceImageSizeResult {
  markdown: string;
  changed: boolean;
}

interface BaseImageToken {
  start: number;
  end: number;
}

interface MarkdownImageToken extends BaseImageToken {
  kind: "markdown";
  alt: string;
  url: string;
  title?: string;
}

interface HtmlImageToken extends BaseImageToken {
  kind: "html";
  alt: string;
  url: string;
  width?: string;
  height?: string;
}

type ImageToken = MarkdownImageToken | HtmlImageToken;

const MARKDOWN_IMAGE_RE = /!\[((?:\\.|[^\]\\])*)\]\(([^)\n]*)\)/g;
const HTML_IMG_RE = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

// 横滑图组行（旧语法 <![a](x),![b](y)> 与新语法 <img ...>,<img ...>）。
// 与 markdown/plugins/image-flow.ts 的识别保持一致，尺寸回写时跳过组内图片，
// 避免预览序号（不含横滑图）与源码枚举（若含横滑图）错位。
const IMAGE_FLOW_OLD_LINE_RE = /^<((?:!\[[^[\]]*\]\([^()]+\)(?:,?\s*(?=>)|,\s*(?!>)))+)>/;
const IMAGE_FLOW_HTML_LINE_RE = /^<img\b[^>]*>(?:\s*,\s*<img\b[^>]*>)+$/;

export function formatMarkdownImage({alt, url, title, width, height}: MarkdownImageInput): string {
  const parts = [url];
  if (title) {
    parts.push(`"${escapeMarkdownTitle(title)}"`);
  }
  if (width !== undefined || height !== undefined) {
    parts.push(`=${formatDimension(width)}x${formatDimension(height)}`);
  }
  return `![${escapeMarkdownAlt(alt)}](${parts.join(" ")})`;
}

// 新插入统一走 <img> 标签语法，属性仅保留 src/alt/width/height。
// & 转义为 &amp;，保证产出合法 HTML（与 markdown-it 对属性值的转义一致）。
export function formatHtmlImage({src, alt = "", width, height}: HtmlImageInput): string {
  const attrs: string[] = [
    `src="${escapeHtmlAttr(src)}"`,
    `alt="${escapeHtmlAttr(alt)}"`,
  ];
  if (width !== undefined && width !== "") {
    attrs.push(`width="${escapeHtmlAttr(String(width))}"`);
  }
  if (height !== undefined && height !== "") {
    attrs.push(`height="${escapeHtmlAttr(String(height))}"`);
  }
  return `<img ${attrs.join(" ")}>`;
}

export function replaceMarkdownImageSizeByIndex(
  markdown: string,
  imageIndex: number,
  size: {width: number | string; height?: number | string},
): ReplaceImageSizeResult {
  if (imageIndex < 0) {
    return {markdown, changed: false};
  }

  const images = parseResizableImages(markdown);
  const image = images[imageIndex];
  if (!image) {
    return {markdown, changed: false};
  }

  if (image.kind === "markdown") {
    const replacement = formatMarkdownImage({
      alt: image.alt,
      url: image.url,
      title: image.title,
      width: normalizeSizeDimension(size.width),
      height: normalizeSizeDimension(size.height),
    });

    return {
      markdown: markdown.slice(0, image.start) + replacement + markdown.slice(image.end),
      changed: true,
    };
  }

  const rewritten = rewriteHtmlImageSize(markdown.slice(image.start, image.end), {
    width: normalizeSizeDimension(size.width),
    height: normalizeSizeDimension(size.height),
  });
  return {
    markdown: markdown.slice(0, image.start) + rewritten + markdown.slice(image.end),
    changed: true,
  };
}

function parseResizableImages(markdown: string): ImageToken[] {
  const skipRanges = imageFlowLineRanges(markdown);
  return [
    ...parseMarkdownImages(markdown, skipRanges),
    ...parseHtmlImages(markdown, skipRanges),
  ].sort((a, b) => a.start - b.start);
}

function parseMarkdownImages(markdown: string, skipRanges: SourceRange[]): MarkdownImageToken[] {
  const images: MarkdownImageToken[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsAnyRange(start, end, skipRanges)) {
      continue;
    }
    const parsed = parseImageDestination(match[2]);
    if (!parsed) {
      continue;
    }
    images.push({
      kind: "markdown",
      start,
      end,
      alt: unescapeMarkdownAlt(match[1]),
      ...parsed,
    });
  }
  return images;
}

function parseHtmlImages(markdown: string, skipRanges: SourceRange[]): HtmlImageToken[] {
  const images: HtmlImageToken[] = [];
  for (const match of markdown.matchAll(HTML_IMG_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsAnyRange(start, end, skipRanges)) {
      continue;
    }
    const src = htmlAttribute(match[0], "src");
    if (!src) {
      continue;
    }
    images.push({
      kind: "html",
      start,
      end,
      alt: htmlAttribute(match[0], "alt") ?? "",
      url: src,
      width: htmlAttribute(match[0], "width"),
      height: htmlAttribute(match[0], "height"),
    });
  }
  return images;
}

// 只重写 width/height 属性，保留标签里其余属性（class/style/data-* 等）原样不动。
function rewriteHtmlImageSize(
  tag: string,
  size: {width?: number | string; height?: number | string},
): string {
  const out: string[] = [];
  let i = 0;
  let quote: string | null = null;
  while (i < tag.length) {
    const ch = tag[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      out.push(ch);
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out.push(ch);
      i++;
      continue;
    }
    if (ch === "w" || ch === "h") {
      const match = /^(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.exec(tag.slice(i));
      if (match) {
        if (out.length > 0 && /\s/.test(out[out.length - 1])) {
          out.pop();
        }
        i += match[0].length;
        continue;
      }
    }
    out.push(ch);
    i++;
  }

  const stripped = out.join("");
  const closeIndex = stripped.lastIndexOf(">");
  if (closeIndex < 0) {
    return tag;
  }
  const attrs: string[] = [];
  if (size.width !== undefined && size.width !== "") {
    attrs.push(`width="${escapeHtmlAttr(String(size.width))}"`);
  }
  if (size.height !== undefined && size.height !== "") {
    attrs.push(`height="${escapeHtmlAttr(String(size.height))}"`);
  }
  const insert = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
  return stripped.slice(0, closeIndex) + insert + stripped.slice(closeIndex);
}

interface SourceRange {
  start: number;
  end: number;
}

function imageFlowLineRanges(markdown: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  const lines = markdown.split("\n");
  let offset = 0;
  for (const line of lines) {
    if (IMAGE_FLOW_OLD_LINE_RE.test(line) || IMAGE_FLOW_HTML_LINE_RE.test(line)) {
      ranges.push({start: offset, end: offset + line.length});
    }
    offset += line.length + 1;
  }
  return ranges;
}

function overlapsAnyRange(start: number, end: number, ranges: SourceRange[]): boolean {
  return ranges.some((range) => start < range.end && range.start < end);
}

function parseImageDestination(value: string): {url: string; title?: string} | null {
  let rest = value.trim();
  if (!rest) {
    return null;
  }

  rest = rest.replace(/\s+=\d*%?x\d*%?\s*$/, "").trim();
  if (!rest) {
    return null;
  }

  const titleMatch = rest.match(/\s+(["'])([\s\S]*?)\1\s*$/);
  const title = titleMatch?.[2];
  if (titleMatch) {
    rest = rest.slice(0, titleMatch.index).trim();
  }

  if (rest.startsWith("<") && rest.endsWith(">")) {
    rest = rest.slice(1, -1);
  }

  return rest ? {url: rest, title} : null;
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

function unescapeMarkdownAlt(value: string): string {
  return value.replace(/\\([\]\\])/g, "$1");
}

function escapeMarkdownTitle(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlAttribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  ).exec(tag);
  if (!match) {
    return undefined;
  }
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function formatDimension(value: number | string | undefined): string {
  return value === undefined ? "" : String(value);
}

function normalizeSizeDimension(value: number | string | undefined): number | string | undefined {
  if (typeof value === "number") {
    return Math.max(1, Math.round(value));
  }
  return value;
}
