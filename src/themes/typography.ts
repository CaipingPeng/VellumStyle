// 文章排版缩放：把主题 CSS 按「全局倍率 × 元素角色倍率」重写成字面 px。
//
// 为什么是「重写 CSS 文本」而不是 CSS 变量：
// 微信会剥离根元素上的 `--x` 定义（见 docs/用户主题制作指南.md §8.9），
// var() 方案在复制/发布链路上有真实风险；重写后落地的是字面 px，
// juice 内联、微信渲染、导出 PDF/长图天然一致，不需要任何额外分支。
//
// 两条缩放规则：
//   · 绝对 px —— 不继承，所以乘 global × roleScale；
//   · 相对 em / % —— 已经随父级自动缩放，所以只乘 roleScale（否则会重复放大）。
//   rem 在任何情况下都先折算成 px（见 normalizeRemToPx）。

export interface TypographyState {
  /** 全局倍率，作用到整篇文章 */
  global: number;
  /** 角色倍率：roleKey → 倍率，未记录的角色视为 1 */
  roles: Record<string, number>;
}

export const DEFAULT_TYPOGRAPHY: TypographyState = {global: 1, roles: {}};

export const GLOBAL_MIN = 0.8;
export const GLOBAL_MAX = 1.5;
export const ROLE_MIN = 0.6;
export const ROLE_MAX = 2;
export const SCALE_STEP = 0.05;

/** 兜底角色：命中不了任何具体角色时归到这里，它等于「全文」，只有全局倍率 */
export const ROOT_ROLE = "article";

export interface FontRole {
  key: string;
  /** 面板里显示的名字 */
  label: string;
  /** 用于 DOM 点击命中与高亮轮廓 */
  scope: string;
  /** 用于生成字号覆盖规则（应当是真正承载文字的元素） */
  target: string;
  /** 面板里的一句说明 */
  hint: string;
}

// 顺序即点击命中的优先级：越靠前越具体。
// 例：引用块里的段落应当命中「引用」而不是「正文段落」。
export const FONT_ROLES: FontRole[] = [
  {
    key: "code",
    label: "代码块",
    scope: "pre.custom",
    target: "pre.custom code.hljs",
    hint: "含代码主题配色的等宽正文",
  },
  {
    key: "inlineCode",
    label: "行内代码",
    scope: "p code, li code",
    target: "p code, li code",
    hint: "正文与列表里的 `代码`",
  },
  {key: "h1", label: "一级标题", scope: "h1", target: "h1 .content", hint: "文章大标题"},
  {key: "h2", label: "二级标题", scope: "h2", target: "h2 .content", hint: "章节标题"},
  {key: "h3", label: "三级标题", scope: "h3", target: "h3 .content", hint: "小节标题"},
  {key: "h4", label: "四级标题", scope: "h4", target: "h4 .content", hint: "四级标题"},
  {key: "h5", label: "五级标题", scope: "h5", target: "h5 .content", hint: "五级标题"},
  {key: "h6", label: "六级标题", scope: "h6", target: "h6 .content", hint: "六级标题"},
  {
    key: "figcaption",
    label: "图片图注",
    scope: "figure figcaption",
    target: "figure figcaption",
    hint: "独立图片下方的说明文字",
  },
  {
    key: "footnotes",
    label: "文末脚注",
    scope: ".footnotes",
    target: ".footnotes",
    hint: "链接尾注区（含脚注编号）",
  },
  {
    key: "toc",
    label: "目录卡片",
    scope: ".table-of-contents",
    target: ".table-of-contents",
    hint: "[toc] 生成的目录",
  },
  {
    key: "table",
    label: "表格",
    scope: "table",
    target: "table",
    hint: "表格内全部单元格",
  },
  {
    key: "blockquote",
    label: "引用",
    scope: "blockquote",
    target: "blockquote",
    hint: "引用块（含嵌套层）",
  },
  {
    key: "li",
    label: "列表",
    scope: "li",
    target: "li section",
    hint: "无序 / 有序列表项",
  },
  {
    key: "p",
    label: "正文段落",
    scope: "p",
    target: "p",
    hint: "普通段落文字",
  },
];

export const FONT_ROLE_BY_KEY: Record<string, FontRole> = Object.fromEntries(
  FONT_ROLES.map((role) => [role.key, role]),
);

// ---------------------------------------------------------------- 数值处理

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampGlobal(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TYPOGRAPHY.global;
  return Math.min(Math.max(round2(n), GLOBAL_MIN), GLOBAL_MAX);
}

export function clampRole(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(round2(n), ROLE_MIN), ROLE_MAX);
}

/** 把任意持久化数据收敛成合法的排版状态（未知角色会被丢弃）。 */
export function sanitizeTypography(raw: unknown): TypographyState {
  const source = (raw ?? {}) as Partial<TypographyState>;
  const roles: Record<string, number> = {};
  const rawRoles = source.roles;
  if (rawRoles && typeof rawRoles === "object") {
    for (const [key, value] of Object.entries(rawRoles as Record<string, unknown>)) {
      if (!FONT_ROLE_BY_KEY[key]) continue;
      const scale = clampRole(value);
      if (scale !== 1) roles[key] = scale;
    }
  }
  return {global: clampGlobal(source.global), roles};
}

export function isDefaultTypography(state: TypographyState): boolean {
  return state.global === 1 && Object.keys(state.roles).length === 0;
}

export function roleScale(state: TypographyState, roleKey: string): number {
  return state.roles[roleKey] ?? 1;
}

// ---------------------------------------------------------------- 步进（UI 共用）

/** 按步长进退一档，并夹在允许区间内。 */
export function stepScale(
  current: number,
  direction: 1 | -1,
  step: number,
  min: number,
  max: number,
): number {
  const next = round2(current + direction * step);
  return Math.min(Math.max(next, min), max);
}

export function formatScale(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

const EPSILON = 1e-6;

/** 到了区间边界就该把对应的加减按钮禁掉。 */
export function canStepScale(scale: number, direction: 1 | -1, min: number, max: number): boolean {
  return direction === 1 ? scale < max - EPSILON : scale > min + EPSILON;
}

// ---------------------------------------------------------------- rem 折算

// 主题里的 `rem` 相对的是**应用根元素 `<html>`**，不是文章容器
// （「雾屿」全部标题都写成 2.2rem 这类，改 #article 字号时纹丝不动，
//   反过来还会被应用界面字号绑架）。载入时统一按 16px 基准折算成 px，
// 把字号控制权交还给文章。
export const REM_BASE_PX = 16;

// 保持索引不变，扫描分隔符时跳过注释和字符串中的 CSS 标点。
function maskCssLiterals(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
    (literal) => " ".repeat(literal.length));
}

export function normalizeRemToPx(css: string, basePx = REM_BASE_PX): string {
  if (!/rem/i.test(css)) return css;
  const masked = maskCssLiterals(css);
  return css.replace(/(?<![\w.-])(-?(?:\d*\.)?\d+)rem\b/gi, (_match, raw: string, offset: number) => {
    if (masked.slice(offset, offset + _match.length) !== _match) return _match;
    const value = Number(raw);
    if (!Number.isFinite(value)) return _match;
    return `${round2(value * basePx)}px`;
  });
}

// ---------------------------------------------------------------- 选择器分类

const ARTICLE_ROOT_SELECTORS = ["#article", "#nice", "#wechat-article"];

// 去掉文章根前缀，拿到相对选择器；整段就是根时返回空串。
function stripArticleRoot(selector: string): string {
  for (const root of ARTICLE_ROOT_SELECTORS) {
    if (selector === root) return "";
    if (selector.startsWith(root) && !/[-_a-zA-Z0-9]/.test(selector[root.length] ?? "")) {
      return selector.slice(root.length).trim();
    }
  }
  return selector;
}

const RE_CODE_BLOCK = /(^|[\s>])pre\.custom\b|\bcode\.hljs\b|\.hljs\b/;
const RE_INLINE_CODE = /\b(p|li)\s+code\b/;
const RE_HEADING = /(^|[\s>])h([1-6])\b/;
const RE_TABLE = /(^|[\s>])(table|thead|tbody|tr|th|td)\b/;
const RE_FOOTNOTE = /\.footnote/;

/**
 * 把一条主题选择器归到某个角色。分类只看「这条规则会给谁设字号」，
 * 顺序有意为之：代码块 → 行内代码 → 标题 → 图注 → 脚注 → 目录 → 表格 → 引用 → 列表 → 段落。
 */
export function classifySelector(selector: string): string {
  const s = stripArticleRoot(selector.trim()).replace(/\s+/g, " ");
  if (!s) return ROOT_ROLE;

  if (RE_CODE_BLOCK.test(s)) return "code";
  if (RE_INLINE_CODE.test(s)) return "inlineCode";

  const heading = s.match(RE_HEADING);
  if (heading) return `h${heading[2]}`;

  if (/\bfigcaption\b/.test(s)) return "figcaption";
  if (RE_FOOTNOTE.test(s)) return "footnotes";
  if (/\.table-of-contents\b/.test(s)) return "toc";
  if (RE_TABLE.test(s)) return "table";
  if (/\bblockquote\b/.test(s)) return "blockquote";
  if (/(^|[\s>])li\b/.test(s) || /(^|[\s>])(ul|ol)\b/.test(s)) return "li";
  if (/(^|[\s>])p\b/.test(s)) return "p";
  return ROOT_ROLE;
}

// ---------------------------------------------------------------- 声明缩放

const PX_VALUE = /^((?:\d*\.)?\d+)px$/i;
const EM_VALUE = /^((?:\d*\.)?\d+)em$/i;
const PERCENT_VALUE = /^((?:\d*\.)?\d+)%$/;

/**
 * 缩放单条 font-size 值。返回 null 表示不是可缩放的数值（关键字 / calc() / 变量等），原样保留。
 * factorPx 用于绝对长度，factorRel 用于相对长度——两者不同的原因见文件头注释。
 */
export function scaleFontSizeValue(value: string, factorPx: number, factorRel: number): string | null {
  const trimmed = value.trim();
  const important = /\s*!important$/i.test(trimmed);
  const bare = important ? trimmed.replace(/\s*!important$/i, "").trim() : trimmed;
  const suffix = important ? " !important" : "";

  const px = bare.match(PX_VALUE);
  if (px) return `${round2(Number(px[1]) * factorPx)}px${suffix}`;

  const em = bare.match(EM_VALUE);
  if (em) return `${round2(Number(em[1]) * factorRel)}em${suffix}`;

  const percent = bare.match(PERCENT_VALUE);
  if (percent) return `${round2(Number(percent[1]) * factorRel)}%${suffix}`;

  return null;
}

// 逐条声明扫描：只动 font-size，其余原样保留（含缩进与顺序）。
function scaleDeclarations(body: string, factorPx: number, factorRel: number, onlyFontSize = false): {css: string; touched: boolean} {
  let touched = false;
  const masked = maskCssLiterals(body);
  let start = 0;
  const parts = masked.split(";").map((maskedPart) => {
    const part = body.slice(start, start + maskedPart.length);
    start += maskedPart.length + 1;
    const colon = maskedPart.indexOf(":");
    if (colon === -1) return onlyFontSize ? "" : part;
    if (maskedPart.slice(0, colon).trim().toLowerCase() !== "font-size") return onlyFontSize ? "" : part;
    const scaled = scaleFontSizeValue(part.slice(colon + 1), factorPx, factorRel);
    if (scaled === null) return onlyFontSize ? "" : part;
    touched = true;
    return `${part.slice(0, colon + 1)} ${scaled}`;
  });
  return {css: parts.join(";"), touched};
}

// ---------------------------------------------------------------- 规则遍历

function matchBrace(str: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < str.length; i += 1) {
    if (str[i] === "{") depth += 1;
    else if (str[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return str.length - 1;
}

function transformRule(selectorList: string, body: string, state: TypographyState, declared: Set<string>, fontSelectors: string[]): string {
  const inheritsScaledRole = (selector: string, roleKey: string) => roleKey !== ROOT_ROLE
    && roleScale(state, roleKey) !== 1
    && fontSelectors.some((ancestor) => selector.startsWith(`${ancestor} `)
      && !/^[+~]/.test(selector.slice(ancestor.length).trim())
      && classifySelector(ancestor) === roleKey);
  // 同一条规则里的多个选择器可能属于不同角色，必须按角色拆开分别缩放。
  const groups = new Map<string, string[]>();
  for (const raw of selectorList.split(",")) {
    const selector = raw.trim();
    if (!selector) continue;
    const roleKey = classifySelector(selector);
    const inheritsRole = inheritsScaledRole(selector, roleKey);
    const groupKey = `${roleKey}:${stripArticleRoot(selector) === ""}:${inheritsRole}`;
    const list = groups.get(groupKey);
    if (list) list.push(selector);
    else groups.set(groupKey, [selector]);
  }

  let out = "";
  for (const selectors of groups.values()) {
    const roleKey = classifySelector(selectors[0]);
    const isRoot = roleKey === ROOT_ROLE;
    // 根元素之上没有任何已缩放的内容，所以它的 em 也要吃全局倍率。
    const factorPx = state.global * (isRoot ? 1 : roleScale(state, roleKey));
    // 未分类的后代（mark / ruby rt 等）也会归到 ROOT_ROLE，但它们已经
    // 继承了文章字号，只有真正的文章根才能再次乘全局倍率。
    const inheritsRole = inheritsScaledRole(selectors[0], roleKey);
    const factorRel = isRoot
      ? (selectors.every((selector) => stripArticleRoot(selector) === "") ? state.global : 1)
      : (inheritsRole ? 1 : roleScale(state, roleKey));
    const {css, touched} = scaleDeclarations(body, factorPx, factorRel);
    // 引号等伪元素的字号不能代表引用正文已有字号，否则会阻止正文兜底。
    if (touched && selectors.some((selector) => !/::|:(?:before|after)\b/.test(selector))) declared.add(roleKey);
    out += `${selectors.join(", ")} {${css}}\n`;
  }
  return out;
}

function walkRules(css: string, transform: (selector: string, body: string, context: string[]) => string, context: string[] = []): string {
  const masked = maskCssLiterals(css);
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = masked.indexOf("{", i);
    if (open === -1) {
      out += css.slice(i);
      break;
    }
    const prelude = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, " ").trim();
    const close = matchBrace(masked, open);
    const inner = css.slice(open + 1, close);

    if (prelude.startsWith("@")) {
      const atName = prelude.match(/^@([a-zA-Z-]+)/)?.[1]?.toLowerCase();
      // @media / @supports 内部是嵌套规则，递归；其余（@font-face / @keyframes）
      // 内部是声明而非规则，整块透传，避免被误当规则解析。
      out += atName === "media" || atName === "supports"
        ? `${prelude} { ${walkRules(inner, transform, [...context, prelude])} }\n`
        : `${prelude} {${inner}}\n`;
      i = close + 1;
      continue;
    }

    if (prelude) out += transform(prelude, inner, context);
    i = close + 1;
  }
  return out;
}

// 主题没有给某个角色声明字号时的兜底：用 em 覆盖。
// em 相对的是父级——父级继承的是已按 global 缩放过的文章根字号，
// 所以这里只乘 roleScale 正好，不会重复放大。
function buildFallbackCss(state: TypographyState, declared: Set<string>): string {
  let out = "";
  for (const role of FONT_ROLES) {
    const scale = roleScale(state, role.key);
    if (scale === 1 || declared.has(role.key)) continue;
    const selectors = role.target.split(",").map((selector) => `#article ${selector.trim()}`).join(", ");
    out += `${selectors} { font-size: ${round2(scale)}em; }\n`;
    if (role.key === "blockquote") {
      out += "#article blockquote blockquote { font-size: inherit; }\n";
    }
  }
  return out;
}

/**
 * 把主题（或代码主题）CSS 按排版状态重写。
 * rem 折算**无条件执行**——它修的是「主题字号被应用界面字号绑架」这个既有缺陷，
 * 与用户有没有调倍率无关。
 */
export function scaleThemeCss(css: string, state: TypographyState = DEFAULT_TYPOGRAPHY): string {
  const normalized = normalizeRemToPx(css);
  if (isDefaultTypography(state)) return normalized;

  const declared = new Set<string>();
  // 同一角色内的相对字号已经继承祖先的倍率，例如 h1 与 h1 .prefix。
  // 先收集字号声明，避免声明顺序影响是否重复缩放。
  const fontSelectors: Array<{selector: string; context: string[]}> = [];
  walkRules(normalized, (selectors, body, context) => {
    if (scaleDeclarations(body, 1, 1).touched) {
      fontSelectors.push(...selectors.split(",").map((selector) => ({selector: selector.trim(), context})));
    }
    return "";
  });
  const scaled = walkRules(normalized, (selectors, body, context) => {
    const ancestors = fontSelectors.filter((entry) => entry.context.every((condition, index) => context[index] === condition))
      .map((entry) => entry.selector);
    let out = transformRule(selectors, body, state, declared, ancestors);
    // 通用 p 的绝对字号会盖过引用/列表等容器的继承字号。
    // 在原规则的位置补足上下文，仅复制字号，保持后面的专用主题规则优先。
    if (selectors.split(",").some((selector) => selector.trim() === "#article p")) {
      const fonts = scaleDeclarations(body, 1, 1, true);
      if (fonts.touched) {
        for (const [role, scope] of [["blockquote", "blockquote"], ["li", "li"], ["footnotes", ".footnotes"], ["toc", ".table-of-contents"], ["table", "table"]]) {
          if (roleScale(state, role) === 1 && roleScale(state, "p") === 1) continue;
          out += transformRule(`#article ${scope} p`, fonts.css, state, declared, ancestors);
        }
      }
    }
    return out;
  });
  const fallback = buildFallbackCss(state, declared);
  return fallback ? `${scaled}\n${fallback}` : scaled;
}

// ---------------------------------------------------------------- DOM 命中

const NON_TEXT_SELECTOR = "img, svg, .vs-image-resize-overlay, .vs-video-placeholder, .vs-audio-placeholder, .vs-videosnap-placeholder, mpvoice, mp-common-mpaudio, mp-common-clmusic, mp-common-videosnap";

/**
 * 把预览里被点击的元素映射到角色。返回 null 表示不该响应（图片、媒体卡片等）。
 * 命中不了具体角色时回落到 ROOT_ROLE，这样用户点空白也能拿到全局控制。
 */
export function roleForElement(element: Element, articleRoot: Element): string | null {
  if (!articleRoot.contains(element)) return null;
  if (element.closest(NON_TEXT_SELECTOR)) return null;

  for (const role of FONT_ROLES) {
    if (element.closest(role.scope)) return role.key;
  }
  return ROOT_ROLE;
}

/** 该角色在预览里对应的元素列表（用于高亮与定位）。 */
export function elementsForRole(articleRoot: Element, roleKey: string): Element[] {
  if (roleKey === ROOT_ROLE) return [articleRoot];
  const role = FONT_ROLE_BY_KEY[roleKey];
  if (!role) return [];
  return Array.from(articleRoot.querySelectorAll(role.scope));
}

export function describeTypography(state: TypographyState): string {
  const parts = [`全局 ${Math.round(state.global * 100)}%`];
  for (const [key, scale] of Object.entries(state.roles)) {
    if (scale === 1) continue;
    const label = FONT_ROLE_BY_KEY[key]?.label ?? key;
    parts.push(`${label} ${Math.round(scale * 100)}%`);
  }
  return parts.join(" · ");
}
