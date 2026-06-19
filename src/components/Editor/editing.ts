export interface EditResult {
  insert: string;
  selFrom: number;
  selTo: number;
}

export interface EditorDocSyncInput {
  currentDoc: string;
  incomingValue: string;
  composing: boolean;
  compositionSettling?: boolean;
  externalUpdate?: boolean;
  lastEmittedValue?: string | null;
  latestKnownValue?: string | null;
}

export function shouldReplaceEditorDoc({
  currentDoc,
  incomingValue,
  composing,
  compositionSettling = false,
  externalUpdate = true,
  lastEmittedValue = null,
  latestKnownValue = null,
}: EditorDocSyncInput): boolean {
  if (composing || compositionSettling || currentDoc === incomingValue) {
    return false;
  }

  if (latestKnownValue !== null && incomingValue !== latestKnownValue) {
    return false;
  }

  if (lastEmittedValue !== null) {
    if (!externalUpdate && currentDoc === lastEmittedValue) {
      return false;
    }
    if (externalUpdate && incomingValue === lastEmittedValue) {
      return false;
    }
  }

  return true;
}

export interface EditorCompositionQueueInput {
  currentDoc: string;
  incomingValue: string;
  compositionStartValue?: string | null;
  lastEmittedValue?: string | null;
}

export function shouldQueueExternalValueDuringComposition({
  currentDoc,
  incomingValue,
  compositionStartValue = null,
  lastEmittedValue = null,
}: EditorCompositionQueueInput): boolean {
  return incomingValue !== currentDoc && incomingValue !== lastEmittedValue && incomingValue !== compositionStartValue;
}

export interface DirectTextInput {
  data: string | null;
  inputType: string;
}

function isSingleSymbolInput(data: string | null): data is string {
  return !!data && Array.from(data).length === 1 && !/[\p{L}\p{N}\s]/u.test(data);
}

export function shouldHandleDirectTextInput({data, inputType}: DirectTextInput): boolean {
  if (!["insertText", "insertCompositionText"].includes(inputType)) {
    return false;
  }
  return isSingleSymbolInput(data);
}

export interface RecoverCompositionTextInput {
  data: string | null;
  startDoc: string | null;
  currentDoc: string;
}

export function shouldRecoverCompositionTextInput({
  data,
  startDoc,
  currentDoc,
}: RecoverCompositionTextInput): boolean {
  return isSingleSymbolInput(data) && startDoc !== null && currentDoc === startDoc;
}

export interface FallbackChineseSymbolKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const fallbackChineseSymbolByKey: Record<string, string> = {
  ",": "，",
  ".": "。",
  ";": "；",
  ":": "：",
  "?": "？",
  "!": "！",
  "(": "（",
  ")": "）",
  "[": "【",
  "]": "】",
  "<": "《",
  ">": "》",
  "/": "、",
  "\\": "、",
  "$": "￥",
  "\"": "”",
  "'": "’",
};

export function getFallbackChineseSymbolFromKey({
  key,
  ctrlKey,
  altKey,
  metaKey,
}: FallbackChineseSymbolKey): string | null {
  if (ctrlKey || altKey || metaKey) {
    return null;
  }
  return fallbackChineseSymbolByKey[key] ?? null;
}

export interface RecoveredTextSelectionInput {
  from: number;
  text: string;
}

export function getSelectionAfterRecoveredTextInput({from, text}: RecoveredTextSelectionInput): number {
  return from + text.length;
}

// 行内包裹：有选区包裹选区文字（结果仍选中文字）；无选区插占位符并选中它。
export function wrapSelection(
  doc: string,
  from: number,
  to: number,
  before: string,
  after: string,
  placeholder: string,
): EditResult {
  const hasSel = to > from;
  const inner = hasSel ? doc.slice(from, to) : placeholder;
  const insert = before + inner + after;
  const selFrom = from + before.length;
  const selTo = selFrom + inner.length;
  return {insert, selFrom, selTo};
}

// 链接：有选区→选区当文字、选中 url 占位；无选区→选中文字占位（url 随后填）。
export function insertLink(doc: string, from: number, to: number): EditResult {
  const hasSel = to > from;
  if (hasSel) {
    const text = doc.slice(from, to);
    const insert = `[${text}](链接地址)`;
    const urlStart = from + `[${text}](`.length;
    return {insert, selFrom: urlStart, selTo: urlStart + "链接地址".length};
  }
  const insert = "[链接文字](链接地址)";
  const selFrom = from + 1;
  return {insert, selFrom, selTo: selFrom + "链接文字".length};
}

export interface PrefixResult {
  replaceFrom: number;
  replaceTo: number;
  insert: string;
  selFrom: number;
  selTo: number;
}

// 行级前缀：把选区扩到涉及的整行，每行行首加 prefix。光标折叠到块末尾，
// 不选中（否则会连语法符号一起选中，继续打字会覆盖掉前缀）。
export function prefixLines(doc: string, from: number, to: number, prefix: string): PrefixResult {
  const lineStart = doc.lastIndexOf("\n", from - 1) + 1;
  const nlAfter = doc.indexOf("\n", to);
  const lineEnd = nlAfter === -1 ? doc.length : nlAfter;
  const block = doc.slice(lineStart, lineEnd);
  const insert = block.split("\n").map((ln) => prefix + ln).join("\n");
  const end = lineStart + insert.length;
  return {replaceFrom: lineStart, replaceTo: lineEnd, insert, selFrom: end, selTo: end};
}

// 代码块：插入围栏。有选区→选区进围栏并选中；无选区→光标落在中间空行可直接打字。
export function insertCodeBlock(doc: string, from: number, to: number): EditResult {
  const hasSel = to > from;
  const inner = hasSel ? doc.slice(from, to) : "";
  const insert = `\n\`\`\`\n${inner}\n\`\`\`\n`;
  const start = from + "\n```\n".length;
  return {insert, selFrom: start, selTo: start + inner.length};
}
