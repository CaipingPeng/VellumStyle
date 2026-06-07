export interface EditResult {
  insert: string;
  selFrom: number;
  selTo: number;
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
