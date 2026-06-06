// 把主题 CSS 的选择器改写到卡片唯一 scope class，使多个不同主题缩略图能同页共存。
// 规则：选择器以 #nice 开头 → 替换 #nice 为 .scope；否则（裸选择器如 .hljs）→ 前面补 ".scope "。
// 仅用于主题选择器对话框的缩略图，不影响复制管线。

// 单条选择器（逗号分隔后的一个）改写。
function scopeSelector(sel: string, scopeClass: string): string {
  const s = sel.trim();
  if (!s) return s;
  if (s === "#nice") return `.${scopeClass}`;
  if (s.startsWith("#nice")) return `.${scopeClass}${s.slice("#nice".length)}`;
  return `.${scopeClass} ${s}`;
}

// 把一段选择器列表（可能含逗号）逐个改写后用 ", " 连接。
function scopeSelectorList(selectorList: string, scopeClass: string): string {
  return selectorList
    .split(",")
    .map((sel) => scopeSelector(sel, scopeClass))
    .join(", ");
}

export function scopeCss(css: string, scopeClass: string): string {
  // 去掉块注释，简化解析。
  const noComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  const n = noComment.length;
  while (i < n) {
    const braceOpen = noComment.indexOf("{", i);
    if (braceOpen === -1) {
      break; // 无更多规则
    }
    const prelude = noComment.slice(i, braceOpen).trim();

    // at-rule（@media/@supports 等）：保留 prelude，递归处理其内部块。
    if (prelude.startsWith("@")) {
      const blockEnd = matchBrace(noComment, braceOpen);
      const inner = noComment.slice(braceOpen + 1, blockEnd);
      out += `${prelude} { ${scopeCss(inner, scopeClass)} }\n`;
      i = blockEnd + 1;
      continue;
    }

    // 普通规则：改写选择器，body 原样。
    const blockEnd = matchBrace(noComment, braceOpen);
    const body = noComment.slice(braceOpen + 1, blockEnd).trim();
    out += `${scopeSelectorList(prelude, scopeClass)} {${body ? ` ${body} ` : ""}}\n`;
    i = blockEnd + 1;
  }
  return out;
}

// 从 openIdx（'{'）找到匹配的 '}' 下标（支持嵌套，用于 at-rule）。
function matchBrace(str: string, openIdx: number): number {
  let depth = 0;
  for (let k = openIdx; k < str.length; k++) {
    if (str[k] === "{") depth++;
    else if (str[k] === "}") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return str.length - 1;
}
