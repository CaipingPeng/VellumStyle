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
  documentChanged?: boolean;
}

export function shouldReplaceEditorDoc({
  currentDoc,
  incomingValue,
  composing,
  compositionSettling = false,
  externalUpdate = true,
  lastEmittedValue = null,
  latestKnownValue = null,
  documentChanged = false,
}: EditorDocSyncInput): boolean {
  if (composing || compositionSettling || currentDoc === incomingValue) {
    return false;
  }

  if (latestKnownValue !== null && incomingValue !== latestKnownValue) {
    return false;
  }

  if (lastEmittedValue !== null && !documentChanged) {
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

// 旧版 WebView 的中文符号补偿已停用，避免与 CodeMirror 原生输入重复写入。
export function shouldHandleDirectTextInput(_input: DirectTextInput): boolean {
  return false;
}

export interface RecoverCompositionTextInput {
  data: string | null;
  startDoc: string | null;
  currentDoc: string;
}

export function shouldRecoverCompositionTextInput({
  data: _data,
  startDoc: _startDoc,
  currentDoc: _currentDoc,
}: RecoverCompositionTextInput): boolean {
  return false;
}

export interface FallbackChineseSymbolKey {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export function getFallbackChineseSymbolFromKey({
  key: _key,
  ctrlKey: _ctrlKey,
  altKey: _altKey,
  metaKey: _metaKey,
}: FallbackChineseSymbolKey): string | null {
  return null;
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


export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export type LineSyntax =
  | {type: "heading"; level: 1 | 2 | 3 | 4}
  | {type: "orderedList"}
  | {type: "unorderedList"}
  | {type: "blockquote"};

interface SelectedLine {
  from: number;
  text: string;
}

const headingPattern = /^([\t ]{0,3})(#{1,6})(?:[\t ]+|$)/;
const listPattern = /^([\t ]*)(?:(?:[-+*])[\t ]+|(?:\d+)[.)][\t ]+)/;
const orderedListPattern = /^([\t ]*)\d+[.)][\t ]+/;
const unorderedListPattern = /^([\t ]*)[-+*][\t ]+/;
const quotePattern = /^([\t ]*)>[\t ]?/;
const indentPattern = /^[\t ]*/;

function getSelectedLines(doc: string, anchor: number, head: number): SelectedLine[] {
  const selectionFrom = Math.min(anchor, head);
  const selectionTo = Math.max(anchor, head);
  const inclusiveTo = selectionTo > selectionFrom && doc[selectionTo - 1] === "\n"
    ? selectionTo - 1
    : selectionTo;
  let lineFrom = selectionFrom === 0 ? 0 : doc.lastIndexOf("\n", selectionFrom - 1) + 1;
  const lines: SelectedLine[] = [];

  while (lineFrom <= inclusiveTo) {
    const newline = doc.indexOf("\n", lineFrom);
    const lineTo = newline === -1 ? doc.length : newline;
    lines.push({from: lineFrom, text: doc.slice(lineFrom, lineTo)});
    if (newline === -1) break;
    lineFrom = newline + 1;
  }
  return lines;
}

function prefixChange(line: SelectedLine, match: RegExpMatchArray, insert: string): TextChange {
  const indentLength = match[1].length;
  return {
    from: line.from + indentLength,
    to: line.from + match[0].length,
    insert,
  };
}

function indentEnd(line: SelectedLine): number {
  return line.from + (line.text.match(indentPattern)?.[0].length ?? 0);
}

export function toggleLineSyntax(
  doc: string,
  anchor: number,
  head: number,
  syntax: LineSyntax,
): TextChange[] {
  const collapsed = anchor === head;
  const targets = getSelectedLines(doc, anchor, head)
    .filter((line) => collapsed || line.text.trim().length > 0);
  if (targets.length === 0) return [];

  if (syntax.type === "heading") {
    const targetMark = "#".repeat(syntax.level);
    const matches = targets.map((line) => line.text.match(headingPattern));
    const remove = matches.every((match) => match?.[2] === targetMark);
    return targets.map((line, index) => {
      const match = matches[index];
      if (match) return prefixChange(line, match, remove ? "" : `${targetMark} `);
      const from = indentEnd(line);
      return {from, to: from, insert: `${targetMark} `};
    });
  }

  if (syntax.type === "blockquote") {
    const matches = targets.map((line) => line.text.match(quotePattern));
    const remove = matches.every(Boolean);
    return targets.map((line, index) => {
      const match = matches[index];
      if (remove && match) return prefixChange(line, match, "");
      const from = indentEnd(line);
      return {from, to: from, insert: "> "};
    });
  }

  const targetPattern = syntax.type === "orderedList" ? orderedListPattern : unorderedListPattern;
  const targetPrefix = syntax.type === "orderedList" ? "1. " : "- ";
  const targetMatches = targets.map((line) => line.text.match(targetPattern));
  const remove = targetMatches.every(Boolean);
  return targets.map((line, index) => {
    const targetMatch = targetMatches[index];
    if (remove && targetMatch) return prefixChange(line, targetMatch, "");
    const anyListMatch = line.text.match(listPattern);
    if (anyListMatch) return prefixChange(line, anyListMatch, targetPrefix);
    const from = indentEnd(line);
    return {from, to: from, insert: targetPrefix};
  });
}
