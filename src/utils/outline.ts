export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

interface FenceState {
  marker: "`" | "~";
  length: number;
}

function fenceMatch(line: string): FenceState | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  const fence = match[1];
  return {marker: fence[0] as "`" | "~", length: fence.length};
}

function closesFence(line: string, fence: FenceState): boolean {
  const escaped = fence.marker === "`" ? "`" : "~";
  const match = line.match(new RegExp(`^ {0,3}(${escaped}{${fence.length},})\\s*$`));
  return Boolean(match);
}

function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMarkdownOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split(/\r?\n/);
  const outline: OutlineItem[] = [];
  let fence: FenceState | null = null;

  lines.forEach((line, index) => {
    const currentFence = fenceMatch(line);
    if (fence) {
      if (closesFence(line, fence)) {
        fence = null;
      }
      return;
    }
    if (currentFence) {
      fence = currentFence;
      return;
    }

    const match = line.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/);
    if (!match) return;

    const text = cleanHeadingText(match[2]);
    if (!text) return;

    outline.push({
      id: `heading-${outline.length}`,
      level: match[1].length,
      text,
      line: index,
    });
  });

  return outline;
}

export function getActiveOutlineLine(outline: OutlineItem[], currentLine: number | null): number | null {
  if (currentLine === null) return null;
  let active: number | null = null;
  for (const item of outline) {
    if (item.line <= currentLine) {
      active = item.line;
    } else {
      break;
    }
  }
  return active;
}
