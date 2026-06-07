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
