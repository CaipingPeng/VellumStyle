import {GENERATED_HLJS_THEMES_CORE} from "./generatedHljsThemesCore.ts";
import {ARTICLE_ROOT_SELECTOR} from "../articleRoot.ts";

export const DEFAULT_CODE_THEME_ID = "vs2015";
export type CodeThemeId = string;

export const DEFAULT_PINNED_CODE_THEME_IDS: CodeThemeId[] = [
  "vs2015",
  "github",
  "github-dark",
  "atom-one-dark",
  "atom-one-light",
  "monokai-sublime",
  "night-owl",
  "xcode",
];

export interface CodeTheme {
  id: CodeThemeId;
  name: string;
  group: "Highlight.js" | "Base16";
  sourcePath: string;
  css: string;
}

const CODE_BLOCK_BASE_CSS = `
${ARTICLE_ROOT_SELECTOR} pre.custom {
  box-sizing: border-box;
  margin: 16px 0;
  padding: 0;
  border-radius: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: pre;
  word-wrap: normal;
}
${ARTICLE_ROOT_SELECTOR} pre.custom code.hljs {
  box-sizing: border-box;
  min-width: 100%;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 14px;
  line-height: 1.55;
  white-space: inherit;
}
${ARTICLE_ROOT_SELECTOR} pre.mermaid {
  box-sizing: border-box;
  margin: 18px 0;
  padding: 8px 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  text-align: center;
  background: transparent;
}
${ARTICLE_ROOT_SELECTOR} pre.mermaid svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
${ARTICLE_ROOT_SELECTOR} pre.mermaid.mermaid-error {
  padding: 12px;
  border: 1px solid rgba(229, 72, 77, 0.3);
  border-radius: 8px;
  color: #9f1239;
  text-align: left;
  white-space: pre-wrap;
}
`;

const FOOTNOTE_LAYOUT_BASE_CSS = `
${ARTICLE_ROOT_SELECTOR} .footnotes {
  word-break: break-word;
  overflow-wrap: break-word;
}
${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-item {
  display: block !important;
}
${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-num {
  display: inline !important;
  width: auto !important;
  min-width: 0 !important;
  margin-right: 0.25em;
}
${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-item p {
  display: inline !important;
  margin: 0 !important;
  padding: 0 !important;
  flex: initial !important;
}
`;

// 横滑图片组（image-flow）的系统级渲染规则：与主题完全解耦，始终随预览/复制注入。
// 插件已输出内联样式，这里作为兜底保证任何主题（含用户自建主题）下布局一致；
// 关键属性用 !important 防止被主题 CSS 覆盖。
const IMAGEFLOW_LAYOUT_BASE_CSS = `
${ARTICLE_ROOT_SELECTOR} .imageflow-layer1 {
  overflow: hidden;
  margin: 16px 0;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-layer2 {
  display: flex !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-layer3 {
  flex: 0 0 100% !important;
  min-width: 0 !important;
  scroll-snap-align: center;
  scroll-snap-stop: always;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-img {
  display: block !important;
  max-width: 100% !important;
  height: auto !important;
}
${ARTICLE_ROOT_SELECTOR} .imageflow-caption {
  margin: 8px 0 0;
  padding: 0;
  text-align: center;
  color: rgba(136, 136, 136, 1);
  font-size: 14px;
  line-height: 1.8em;
}
`;

function scopeSelector(selector: string): string[] {
  const trimmed = selector.trim();
  if (!trimmed) return [];
  if (trimmed === ".hljs") {
    return [`${ARTICLE_ROOT_SELECTOR} pre.custom`, `${ARTICLE_ROOT_SELECTOR} pre.custom code.hljs`];
  }
  if (trimmed === "pre code.hljs" || trimmed === "code.hljs") {
    return [`${ARTICLE_ROOT_SELECTOR} pre.custom code.hljs`];
  }
  return [`${ARTICLE_ROOT_SELECTOR} pre.custom ${trimmed}`];
}

function scopeSelectorList(selectorList: string): string[] {
  return Array.from(new Set(selectorList.split(",").flatMap(scopeSelector)));
}

function matchBrace(str: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < str.length; i += 1) {
    if (str[i] === "{") {
      depth += 1;
    } else if (str[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return str.length - 1;
}

function scopeHljsCss(css: string): string {
  const noComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: string[] = [];
  let i = 0;

  while (i < noComment.length) {
    const open = noComment.indexOf("{", i);
    if (open === -1) break;

    const prelude = noComment.slice(i, open).trim();
    const close = matchBrace(noComment, open);
    const body = noComment.slice(open + 1, close).trim();

    if (!prelude || !body) {
      i = close + 1;
      continue;
    }

    if (prelude.startsWith("@")) {
      const atName = prelude.match(/^@([a-zA-Z-]+)/)?.[1].toLowerCase();
      if (atName === "media" || atName === "supports") {
        rules.push(`${prelude} { ${scopeHljsCss(body)} }`);
      } else {
        rules.push(`${prelude} { ${body} }`);
      }
      i = close + 1;
      continue;
    }

    const selectors = scopeSelectorList(prelude);
    if (selectors.length > 0) {
      rules.push(`${selectors.join(",\n")} { ${body} }`);
    }
    i = close + 1;
  }

  return rules.join("\n");
}

function themeRank(theme: CodeTheme): [number, string] {
  if (theme.id === DEFAULT_CODE_THEME_ID) return [0, theme.name];
  return [theme.group === "Highlight.js" ? 1 : 2, theme.name];
}

function compareCodeThemes(a: CodeTheme, b: CodeTheme): number {
  const [rankA, nameA] = themeRank(a);
  const [rankB, nameB] = themeRank(b);
  return rankA - rankB || nameA.localeCompare(nameB);
}

function buildCodeTheme(theme: {id: string; name: string; group: "Highlight.js" | "Base16"; sourcePath: string; css: string}): CodeTheme {
  return {...theme, css: scopeHljsCss(theme.css)};
}

// 常驻主题：启动即同步可用（预览/导出立即生效），覆盖绝大多数场景。
export let CODE_THEMES: CodeTheme[] = GENERATED_HLJS_THEMES_CORE.map(buildCodeTheme).sort(compareCodeThemes);

const codeThemeListeners = new Set<() => void>();
let fullCodeThemesPromise: Promise<void> | null = null;

// 订阅代码主题目录变化（全量列表按需加载完成后触发）。
export function subscribeCodeThemes(listener: () => void): () => void {
  codeThemeListeners.add(listener);
  return () => {
    codeThemeListeners.delete(listener);
  };
}

function notifyCodeThemesChanged(): void {
  for (const listener of codeThemeListeners) {
    listener();
  }
}

// 按需加载全量代码主题（约 256 个，独立 chunk 不进主包）；幂等，可并发调用。
export function loadAllCodeThemes(): Promise<void> {
  if (!fullCodeThemesPromise) {
    fullCodeThemesPromise = import("./generatedHljsThemesFull.ts")
      .then(({GENERATED_HLJS_THEMES}) => {
        const byId = new Map(CODE_THEMES.map((theme) => [theme.id, theme]));
        for (const theme of GENERATED_HLJS_THEMES) {
          byId.set(theme.id, buildCodeTheme(theme));
        }
        CODE_THEMES = [...byId.values()].sort(compareCodeThemes);
        notifyCodeThemesChanged();
      })
      .catch((error) => {
        fullCodeThemesPromise = null;
        throw error;
      });
  }
  return fullCodeThemesPromise;
}

export function getCodeThemeById(id?: string | null): CodeTheme {
  return CODE_THEMES.find((theme) => theme.id === id) ?? CODE_THEMES.find((theme) => theme.id === DEFAULT_CODE_THEME_ID) ?? CODE_THEMES[0];
}

export function buildCodeThemeCss(codeThemeId?: string | null): string {
  return [CODE_BLOCK_BASE_CSS, getCodeThemeById(codeThemeId).css].join("\n");
}

export function buildMarkdownCss(markdownThemeCss: string, codeThemeId?: string | null): string {
  return [markdownThemeCss, IMAGEFLOW_LAYOUT_BASE_CSS, FOOTNOTE_LAYOUT_BASE_CSS, buildCodeThemeCss(codeThemeId)]
    .filter(Boolean)
    .join("\n");
}
