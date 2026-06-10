// 优先级表：更具体的在前。selector 用 CSS selector 字符串（供 closest 用），
// matchModelId 用的判断器只看是否命中该 selector。
export interface SelectorEntry {
  selector: string;
  modelId: string;
}

// 顺序即优先级：blockquote/table 子元素先于通用 p
export const SELECTOR_PRIORITY: SelectorEntry[] = [
  {selector: "th", modelId: "tableHead"},
  {selector: "td", modelId: "tableBody"},
  {selector: "table", modelId: "table"},
  {selector: "figcaption", modelId: "imageDescription"},
  {selector: "img", modelId: "image"},
  {selector: "pre", modelId: "blockCode"},
  {selector: "code", modelId: "inlineCode"},
  {selector: "blockquote", modelId: "blockquote"},
  {selector: ".multiquote-1", modelId: "blockquote"},
  {selector: ".multiquote-2", modelId: "blockquote"},
  {selector: ".multiquote-3", modelId: "blockquote"},
  {selector: "h1", modelId: "h1"},
  {selector: "h2", modelId: "h2"},
  {selector: "h3", modelId: "h3"},
  {selector: "h4", modelId: "h4"},
  {selector: "h5", modelId: "h5"},
  {selector: "h6", modelId: "h6"},
  {selector: "a", modelId: "a"},
  {selector: "strong", modelId: "strong"},
  {selector: "em", modelId: "em"},
  {selector: "del", modelId: "del"},
  {selector: "ul", modelId: "ul"},
  {selector: "ol", modelId: "ol"},
  {selector: "p", modelId: "p"},
];

const MODEL_LABELS: Record<string, string> = {
  h1: "一级标题",
  h2: "二级标题",
  h3: "三级标题",
  h4: "四级标题",
  h5: "五级标题",
  h6: "六级标题",
  p: "正文",
  blockquote: "引用",
  ul: "无序列表",
  ol: "有序列表",
  a: "链接",
  strong: "加粗",
  em: "斜体",
  del: "删除线",
  blockCode: "代码块",
  inlineCode: "行内代码",
  table: "表格",
  tableHead: "表头",
  tableBody: "表格正文",
  image: "图片",
  imageDescription: "图片说明",
};

export function getModelLabel(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId;
}

// 纯逻辑：matches(selector) 返回该 selector 是否命中。按优先级返回首个命中的 modelId。
export function matchModelId(matches: (selector: string) => boolean): string | null {
  for (const entry of SELECTOR_PRIORITY) {
    if (matches(entry.selector)) return entry.modelId;
  }
  return null;
}

// DOM 包装：从点击的元素向上找最近祖先命中优先级表。
export function modelIdFromElement(el: Element): string | null {
  return matchModelId((selector) => el.closest(selector) != null);
}
