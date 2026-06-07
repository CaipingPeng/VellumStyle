import type {StyleModel, StyleItem} from "./themeModel.ts";

// model → CSS。纯函数，无副作用。format 字段一律忽略（样本与 default 均未用到）。
export function compileModel(models: StyleModel[]): string {
  const ruleMap = new Map<string, Map<string, string>>();
  const commonBlocks: string[] = [];

  function visit(item: StyleItem) {
    if (item.id === "common" && typeof item.value === "string") {
      commonBlocks.push(item.value);
      return;
    }
    if (item.keys && item.value != null) {
      for (const k of item.keys) {
        let m = ruleMap.get(k.selector);
        if (!m) {
          m = new Map();
          ruleMap.set(k.selector, m);
        }
        m.set(k.key, item.value);
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
