import {invoke} from "@tauri-apps/api/core";
import {isTauriRuntime} from "./tauriEnv.ts";

export interface DocumentHistorySnapshot {
  id: string;
  createdAt: number;
  content: string;
}

export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

const webHistory = new Map<string, DocumentHistorySnapshot[]>();

export function recordWebDocumentTransition(path: string, before: string, after: string): void {
  if (before === after || !path.toLocaleLowerCase().endsWith(".md")) return;
  const current = webHistory.get(path) ?? [];
  const append = (content: string, createdAt: number) => {
    if (current[current.length - 1]?.content === content) return;
    current.push({id: `${createdAt}-${current.length}`, createdAt, content});
  };
  const timestamp = Date.now();
  append(before, timestamp);
  append(after, timestamp + 1);
  webHistory.set(path, current.slice(-30));
}

export async function listDocumentHistory(path: string): Promise<DocumentHistorySnapshot[]> {
  if (!isTauriRuntime()) return [...(webHistory.get(path) ?? [])].reverse();
  return invoke<DocumentHistorySnapshot[]>("list_document_history", {path});
}

function coarseDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix++;
  const result: DiffLine[] = [];
  for (let index = 0; index < prefix; index++) result.push({type: "same", text: oldLines[index], oldLine: index + 1, newLine: index + 1});
  for (let index = prefix; index < oldLines.length - suffix; index++) result.push({type: "remove", text: oldLines[index], oldLine: index + 1, newLine: null});
  for (let index = prefix; index < newLines.length - suffix; index++) result.push({type: "add", text: newLines[index], oldLine: null, newLine: index + 1});
  for (let index = suffix - 1; index >= 0; index--) {
    const oldIndex = oldLines.length - 1 - index;
    const newIndex = newLines.length - 1 - index;
    result.push({type: "same", text: oldLines[oldIndex], oldLine: oldIndex + 1, newLine: newIndex + 1});
  }
  return result;
}

export function createLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  // 常规文章使用精确 LCS；超大文章退化为前后缀比较，避免 O(n*m) 内存占用卡住 UI。
  if (oldLines.length * newLines.length > 1_000_000) return coarseDiff(oldLines, newLines);

  const width = newLines.length + 1;
  const lcs = new Uint32Array((oldLines.length + 1) * width);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex--) {
      const cell = oldIndex * width + newIndex;
      lcs[cell] = oldLines[oldIndex] === newLines[newIndex]
        ? lcs[(oldIndex + 1) * width + newIndex + 1] + 1
        : Math.max(lcs[(oldIndex + 1) * width + newIndex], lcs[oldIndex * width + newIndex + 1]);
    }
  }

  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      result.push({type: "same", text: oldLines[oldIndex], oldLine: oldIndex + 1, newLine: newIndex + 1});
      oldIndex++;
      newIndex++;
    } else if (newIndex < newLines.length && (oldIndex === oldLines.length || lcs[oldIndex * width + newIndex + 1] >= lcs[(oldIndex + 1) * width + newIndex])) {
      result.push({type: "add", text: newLines[newIndex], oldLine: null, newLine: newIndex + 1});
      newIndex++;
    } else {
      result.push({type: "remove", text: oldLines[oldIndex], oldLine: oldIndex + 1, newLine: null});
      oldIndex++;
    }
  }
  return result;
}
