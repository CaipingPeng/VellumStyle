import type {StyleModel, StyleItem} from "./themeModel.ts";

// 把声明值归一化为浏览器 CSSOM 序列化后的形态，使编译产物与 mdnice data.style 一致：
// 1) 逗号后补空格（rgba(0,0,0,1) → rgba(0, 0, 0, 1)，字体列表同理）；
// 2) content 的单引号字符串归一化为双引号（'❝' → "❝"）。
function normalizeValue(value: string): string {
  let v = value.replace(/,(?=\S)/g, ", ");
  v = v.replace(/'([^']*)'/g, '"$1"');
  return v;
}

// model → CSS。纯函数，无副作用。format 字段一律忽略（样本与 default 均未用到）。
export function compileModel(models: StyleModel[]): string {
  const ruleMap = new Map<string, Map<string, string>>();
  const commonBlocks: string[] = [];

  function visit(item: StyleItem) {
    if (item.id === "common" && typeof item.value === "string") {
      // common 块原样透传，但需要：
      // 1) 剥掉 CSS 注释——浏览器序列化的 data.style 不含注释，且注释若紧贴选择器会污染解析；
      // 2) 同样做值归一化（逗号补空格、单引号转双引号），使其与浏览器序列化形态一致。
      const stripped = item.value.replace(/\/\*[\s\S]*?\*\//g, "");
      commonBlocks.push(normalizeValue(stripped));
      return;
    }
    if (item.keys && item.value != null) {
      const normalized = normalizeValue(item.value);
      for (const k of item.keys) {
        let m = ruleMap.get(k.selector);
        if (!m) {
          m = new Map();
          ruleMap.set(k.selector, m);
        }
        m.set(k.key, normalized);
      }
    }
    if (item.children) {
      for (const c of item.children) visit(c);
    }
  }

  for (const model of models) {
    for (const s of model.styles) visit(s);
  }

  const parts: string[] = [];
  for (const [selector, decls] of ruleMap) {
    const body = Array.from(decls, ([k, v]) => `${k}: ${v}`).join("; ");
    parts.push(`${selector} { ${body} }`);
  }
  parts.push(...commonBlocks);
  return parts.join("\n");
}
