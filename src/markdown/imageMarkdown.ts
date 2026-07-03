export interface MarkdownImageInput {
  alt: string;
  url: string;
  title?: string;
  width?: number | string;
  height?: number | string;
}

export interface ReplaceImageSizeResult {
  markdown: string;
  changed: boolean;
}

interface MarkdownImageToken {
  start: number;
  end: number;
  alt: string;
  url: string;
  title?: string;
}

const MARKDOWN_IMAGE_RE = /!\[((?:\\.|[^\]\\])*)\]\(([^)\n]*)\)/g;

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

export function replaceMarkdownImageSizeByIndex(
  markdown: string,
  imageIndex: number,
  size: {width: number | string; height?: number | string},
): ReplaceImageSizeResult {
  if (imageIndex < 0) {
    return {markdown, changed: false};
  }

  const images = parseMarkdownImages(markdown);
  const image = images[imageIndex];
  if (!image) {
    return {markdown, changed: false};
  }

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

function parseMarkdownImages(markdown: string): MarkdownImageToken[] {
  const images: MarkdownImageToken[] = [];
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const parsed = parseImageDestination(match[2]);
    if (!parsed) {
      continue;
    }
    images.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      alt: unescapeMarkdownAlt(match[1]),
      ...parsed,
    });
  }
  return images;
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

function formatDimension(value: number | string | undefined): string {
  return value === undefined ? "" : String(value);
}

function normalizeSizeDimension(value: number | string | undefined): number | string | undefined {
  if (typeof value === "number") {
    return Math.max(1, Math.round(value));
  }
  return value;
}
