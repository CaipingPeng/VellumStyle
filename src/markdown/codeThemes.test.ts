import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, statSync} from "node:fs";
import {join, relative, sep} from "node:path";
import {buildMarkdownCss, CODE_THEMES, DEFAULT_CODE_THEME_ID, getCodeThemeById} from "./codeThemes.ts";

const HIGHLIGHT_STYLES_DIR = join(process.cwd(), "node_modules", "highlight.js", "styles");

function listHljsThemeIds(dir = HIGHLIGHT_STYLES_DIR): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        return listHljsThemeIds(full);
      }
      if (!entry.endsWith(".css") || entry.endsWith(".min.css")) {
        return [];
      }
      return relative(HIGHLIGHT_STYLES_DIR, full).split(sep).join("/").replace(/\.css$/, "");
    })
    .sort((a, b) => a.localeCompare(b));
}

test("默认代码主题为 VS2015，未知 id 也回退到 VS2015", () => {
  assert.equal(DEFAULT_CODE_THEME_ID, "vs2015");
  assert.equal(getCodeThemeById().id, "vs2015");
  assert.equal(getCodeThemeById("missing-theme").id, "vs2015");
});

test("文章主题 CSS 先注入，代码主题 CSS 后注入以保持独立覆盖", () => {
  const articleCss = "#nice pre.custom { background: #ffffff; }";
  const css = buildMarkdownCss(articleCss);

  assert.ok(css.indexOf(articleCss) < css.indexOf("#nice pre.custom,\n#nice pre.custom code.hljs"));
  assert.match(css, /#nice pre\.custom,\s*#nice pre\.custom code\.hljs\s*\{[^}]*background:\s*#1E1E1E/i);
});

test("切换代码主题会输出对应的 scoped hljs token 配色", () => {
  const css = buildMarkdownCss("", "night-owl");

  assert.match(css, /#nice pre\.custom \.hljs-params\s*\{[^}]*color:\s*#7fdbca/i);
  assert.doesNotMatch(css, /(^|\n)\.hljs-params\s*\{/);
});

test("内置代码主题覆盖 highlight.js 全量非 min CSS 主题", () => {
  const expectedIds = listHljsThemeIds();
  const ids = CODE_THEMES.map((theme) => theme.id);

  assert.equal(CODE_THEMES.length, expectedIds.length);
  assert.equal(new Set(ids).size, expectedIds.length);
  assert.deepEqual([...ids].sort((a, b) => a.localeCompare(b)), expectedIds);
  assert.ok(ids.includes("base16/onedark"));
});

test("带本地图片资源的 hljs 主题会被转成自包含 data URI", () => {
  assert.match(getCodeThemeById("brown-paper").css, /data:image\/png;base64/);
  assert.match(getCodeThemeById("pojoaque").css, /data:image\/jpeg;base64/);
  assert.doesNotMatch(getCodeThemeById("brown-paper").css, /url\(\.\//);
  assert.doesNotMatch(getCodeThemeById("pojoaque").css, /url\(\.\//);
});
