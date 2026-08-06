import {ARTICLE_ROOT_SELECTOR, LEGACY_ARTICLE_ROOT_SELECTORS} from "../../articleRoot.ts";

// 把主题 CSS 的选择器改写为指定作用域（缩略图用卡片唯一 scope class；
// 用户 CSS 主题在加载时改写为 #article，防止裸选择器污染应用 UI）。
// 规则：选择器以文章根开头 → 替换为 .scope；否则（裸选择器如 .hljs）→ 前面补 ".scope "。
// 仅用于主题选择器对话框的缩略图，不影响复制管线。

const ARTICLE_ROOT_SELECTORS = [ARTICLE_ROOT_SELECTOR, ...LEGACY_ARTICLE_ROOT_SELECTORS];

function stripArticleRootSelector(selector: string): string | null {
  for (const rootSelector of ARTICLE_ROOT_SELECTORS) {
    if (selector === rootSelector) return "";
    if (selector.startsWith(rootSelector) && !/[-_a-zA-Z0-9]/.test(selector[rootSelector.length] ?? "")) {
      return selector.slice(rootSelector.length);
    }
  }
  return null;
}

// 单条选择器（逗号分隔后的一个）改写。
function scopeSelector(sel: string, scopeSelectorPrefix: string): string {
  const s = sel.trim();
  if (!s) return s;
  const suffix = stripArticleRootSelector(s);
  if (suffix != null) return `${scopeSelectorPrefix}${suffix}`;
  return `${scopeSelectorPrefix} ${s}`;
}

// 把一段选择器列表（可能含逗号）逐个改写后用 ", " 连接。
function scopeSelectorList(selectorList: string, scopeSelectorPrefix: string): string {
  return selectorList
    .split(",")
    .map((sel) => scopeSelector(sel, scopeSelectorPrefix))
    .join(", ");
}

// 通用作用域改写：scopeSelectorPrefix 为完整选择器前缀（如 ".tp-xxx" 或 "#article"）。
export function scopeCssTo(css: string, scopeSelectorPrefix: string): string {
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

    // at-rule：仅 @media/@supports 内部是嵌套规则，递归改写；其余（@font-face/@keyframes 等
    // 内部是声明而非规则）整块原样透传，避免 body 被误当规则解析而清空。
    if (prelude.startsWith("@")) {
      const blockEnd = matchBrace(noComment, braceOpen);
      const inner = noComment.slice(braceOpen + 1, blockEnd);
      const atName = prelude.match(/^@([a-zA-Z-]+)/)?.[1].toLowerCase();
      if (atName === "media" || atName === "supports") {
        out += `${prelude} { ${scopeCssTo(inner, scopeSelectorPrefix)} }\n`;
      } else {
        out += `${prelude} {${inner}}\n`;
      }
      i = blockEnd + 1;
      continue;
    }

    // 普通规则：改写选择器，body 原样。
    const blockEnd = matchBrace(noComment, braceOpen);
    const body = noComment.slice(braceOpen + 1, blockEnd).trim();
    out += `${scopeSelectorList(prelude, scopeSelectorPrefix)} {${body ? ` ${body} ` : ""}}\n`;
    i = blockEnd + 1;
  }
  return out;
}

// 缩略图专用：改写为卡片唯一 scope class。
export function scopeCss(css: string, scopeClass: string): string {
  return scopeCssTo(css, `.${scopeClass}`);
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
