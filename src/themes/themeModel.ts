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

// 宽容校验：是数组、每项有 string id 与 styles 数组。未知字段忽略（mdnice 改版兼容）。
export function validateModel(data: unknown): data is StyleModel[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (m) =>
      m != null &&
      typeof (m as StyleModel).id === "string" &&
      Array.isArray((m as StyleModel).styles),
  );
}
