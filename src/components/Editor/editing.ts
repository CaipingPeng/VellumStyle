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
