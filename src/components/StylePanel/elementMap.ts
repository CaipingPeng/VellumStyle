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
