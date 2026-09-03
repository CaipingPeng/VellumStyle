/**
 * Markdown 表格解析与生成工具。
 * 结构与边界处理思路参考 doocs/md 的表格编辑器实现，按本项目代码风格改写。
 */
export type TableCellAlignment = "left" | "center" | "right";

export interface MarkdownTableData {
  header: string[];
  aligns: Array<TableCellAlignment | null>;
  rows: string[][];
}

export interface MarkdownTableRange {
  from: number;
  to: number;
  text: string;
}

export function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of line.trim()) {
    if (escaped) {
      current += char === "|" ? "|" : `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "|") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (escaped) current += "\\";
  cells.push(current);
  const trimmed = cells.map((cell) => cell.trim());
  if (trimmed[0] === "") trimmed.shift();
  if (trimmed[trimmed.length - 1] === "") trimmed.pop();
  return trimmed;
}

export function isTableDelimiterLine(line: string): boolean {
  if (!line.includes("|") || !line.includes("-")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function isTableBodyContinuationLine(line: string): boolean {
  if (/^(?: {4}|\t)/.test(line)) return false;
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(">")) return false;
  if (/^#{1,6}(?:\s|$)/.test(trimmed)) return false;
  const compact = trimmed.replace(/ /g, "");
  if (/^-{3,}$/.test(compact) || /^_{3,}$/.test(compact) || /^\*{3,}$/.test(compact)) return false;
  if (/^(?:`{3,}|~{3,})/.test(trimmed)) return false;
  if (/^(?:[*+-]|\d{1,9}[.)])(?:\s|$)/.test(trimmed)) return false;
  if (/^<[a-z!/]/i.test(trimmed)) return false;
  return true;
}

export function findAllMarkdownTables(documentText: string): MarkdownTableRange[] {
  const lines = documentText.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const ranges: MarkdownTableRange[] = [];
  let fenceChar = "";
  let fenceLength = 0;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1];
      if (!fenceChar) {
        fenceChar = marker[0];
        fenceLength = marker.length;
      } else if (
        marker[0] === fenceChar
        && marker.length >= fenceLength
        && /^ {0,3}(?:`{3,}|~{3,})\s*$/.test(line)
      ) {
        fenceChar = "";
        fenceLength = 0;
      }
      index++;
      continue;
    }
    if (fenceChar) {
      index++;
      continue;
    }

    if (
      index + 1 < lines.length
      && line.includes("|")
      && isTableBodyContinuationLine(line)
      && !isTableDelimiterLine(line)
      && isTableDelimiterLine(lines[index + 1])
      && splitTableRow(line).length === splitTableRow(lines[index + 1]).length
    ) {
      let end = index + 2;
      while (end < lines.length && isTableBodyContinuationLine(lines[end])) end++;
      ranges.push({
        from: lineStarts[index],
        to: end < lines.length ? lineStarts[end] - 1 : documentText.length,
        text: lines.slice(index, end).join("\n"),
      });
      index = end;
      continue;
    }
    index++;
  }
  return ranges;
}

export function parseMarkdownTable(text: string): MarkdownTableData | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2 || isTableDelimiterLine(lines[0]) || !isTableDelimiterLine(lines[1])) return null;
  const header = splitTableRow(lines[0]);
  const delimiter = splitTableRow(lines[1]);
  if (header.length === 0 || header.length !== delimiter.length) return null;
  const aligns = delimiter.map((cell): TableCellAlignment | null => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
  const rows = lines.slice(2).filter((line) => line.trim()).map(splitTableRow);
  return {header, aligns, rows};
}

function escapeCell(cell: string): string {
  const escaped = cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>").trim();
  return escaped || " ";
}

function delimiterCell(align: TableCellAlignment | null): string {
  if (align === "left") return ":---";
  if (align === "center") return ":---:";
  if (align === "right") return "---:";
  return "---";
}

export function tableColumnCount(data: MarkdownTableData): number {
  return Math.max(data.header.length, data.aligns.length, ...data.rows.map((row) => row.length), 1);
}

export function buildMarkdownTable(data: MarkdownTableData): string {
  const columns = tableColumnCount(data);
  const pad = (cells: string[]) => Array.from({length: columns}, (_, index) => escapeCell(cells[index] ?? ""));
  return [
    `| ${pad(data.header).join(" | ")} |`,
    `| ${Array.from({length: columns}, (_, index) => delimiterCell(data.aligns[index] ?? null)).join(" | ")} |`,
    ...data.rows.map((row) => `| ${pad(row).join(" | ")} |`),
  ].join("\n");
}

export function findMarkdownTableAt(documentText: string, position: number): MarkdownTableRange | null {
  const clamped = Math.max(0, Math.min(position, documentText.length));
  return findAllMarkdownTables(documentText).find((range) => clamped >= range.from && clamped <= range.to) ?? null;
}

export function relocateMarkdownTable(documentText: string, stored: MarkdownTableRange): MarkdownTableRange | null {
  if (stored.from >= 0 && stored.to <= documentText.length && documentText.slice(stored.from, stored.to) === stored.text) {
    return stored;
  }
  const matches = findAllMarkdownTables(documentText).filter((range) => range.text === stored.text);
  if (matches.length === 0) return null;
  return matches.reduce((best, range) =>
    Math.abs(range.from - stored.from) < Math.abs(best.from - stored.from) ? range : best,
  );
}

export function createTableData(rowCount = 3, columnCount = 3): MarkdownTableData {
  return {
    header: Array.from({length: columnCount}, () => ""),
    aligns: Array.from({length: columnCount}, () => null),
    rows: Array.from({length: rowCount}, () => Array.from({length: columnCount}, () => "")),
  };
}
