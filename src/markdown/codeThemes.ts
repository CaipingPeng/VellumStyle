import {GENERATED_HLJS_THEMES} from "./generatedHljsThemes.ts";

export const DEFAULT_CODE_THEME_ID = "vs2015";
export type CodeThemeId = string;

export interface CodeTheme {
  id: CodeThemeId;
  name: string;
  group: "Highlight.js" | "Base16";
  sourcePath: string;
  css: string;
}

const CODE_BLOCK_BASE_CSS = `
#nice pre.custom {
  box-sizing: border-box;
  margin: 16px 0;
  padding: 0;
  border-radius: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: pre;
  word-wrap: normal;
}
#nice pre.custom code.hljs {
  box-sizing: border-box;
  min-width: 100%;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 14px;
  line-height: 1.55;
  white-space: inherit;
}
`;

function scopeSelector(selector: string): string[] {
  const trimmed = selector.trim();
  if (!trimmed) return [];
  if (trimmed === ".hljs") {
    return ["#nice pre.custom", "#nice pre.custom code.hljs"];
  }
  if (trimmed === "pre code.hljs" || trimmed === "code.hljs") {
    return ["#nice pre.custom code.hljs"];
  }
  return [`#nice pre.custom ${trimmed}`];
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

export const CODE_THEMES: CodeTheme[] = GENERATED_HLJS_THEMES.map((theme) => ({
  ...theme,
  css: scopeHljsCss(theme.css),
})).sort((a, b) => {
  const [rankA, nameA] = themeRank(a);
  const [rankB, nameB] = themeRank(b);
  return rankA - rankB || nameA.localeCompare(nameB);
});

export function getCodeThemeById(id?: string | null): CodeTheme {
  return CODE_THEMES.find((theme) => theme.id === id) ?? CODE_THEMES.find((theme) => theme.id === DEFAULT_CODE_THEME_ID) ?? CODE_THEMES[0];
}

export function buildCodeThemeCss(codeThemeId?: string | null): string {
  return [CODE_BLOCK_BASE_CSS, getCodeThemeById(codeThemeId).css].join("\n");
}

export function buildMarkdownCss(markdownThemeCss: string, codeThemeId?: string | null): string {
  return [markdownThemeCss, buildCodeThemeCss(codeThemeId)].filter(Boolean).join("\n");
}
