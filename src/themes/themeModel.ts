export interface StyleKey {
  selector: string;
  key: string;
  format: string | null;
}
export interface StyleItem {
  id: string;
  value: string | null;
  keys: StyleKey[] | null;
  children: StyleItem[] | null;
}
export interface StyleModel {
  id: string;
  label: string;
  styles: StyleItem[];
  selectors?: string[];
}

function isStyleKey(data: unknown): data is StyleKey {
  const key = data as StyleKey;
  return (
    key != null &&
    typeof key.selector === "string" &&
    typeof key.key === "string" &&
    (key.format === null || typeof key.format === "string")
  );
}

function isStyleItem(data: unknown): data is StyleItem {
  const item = data as StyleItem;
  if (item == null || typeof item.id !== "string") return false;
  if (item.value != null && typeof item.value !== "string") return false;
  if (item.keys != null && (!Array.isArray(item.keys) || !item.keys.every(isStyleKey))) return false;
  if (item.children != null && (!Array.isArray(item.children) || !item.children.every(isStyleItem))) return false;
  return true;
}

// 宽容校验：未知字段忽略，但会递归校验 model/styles/keys/children 的核心形态，避免坏主题导入后编译崩溃。
export function validateModel(data: unknown): data is StyleModel[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (m) =>
      m != null &&
      typeof (m as StyleModel).id === "string" &&
      Array.isArray((m as StyleModel).styles) &&
      (m as StyleModel).styles.every(isStyleItem),
  );
}
