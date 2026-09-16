import {before, test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, statSync} from "node:fs";
import {join, relative, sep} from "node:path";
import {ARTICLE_ROOT_SELECTOR} from "../articleRoot.ts";
import {buildMarkdownCss, CODE_THEMES, DEFAULT_CODE_THEME_ID, getCodeThemeById, loadAllCodeThemes} from "./codeThemes.ts";
import {GENERATED_HLJS_THEMES_CORE} from "./generatedHljsThemesCore.ts";
import {GENERATED_HLJS_THEMES} from "./generatedHljsThemesFull.ts";

const HIGHLIGHT_STYLES_DIR = join(process.cwd(), "node_modules", "highlight.js", "styles");

// 全量代码主题按需加载；目录/回退相关断言依赖完整列表。
before(async () => {
  await loadAllCodeThemes();
});

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
  const articleCss = `${ARTICLE_ROOT_SELECTOR} pre.custom { background: #ffffff; }`;
  const css = buildMarkdownCss(articleCss);

  const codeRootBg = css.search(/#article pre\.custom\s*\{\s*background-color:\s*#1E1E1E/i);
  assert.ok(css.indexOf(articleCss) < codeRootBg);
  assert.match(css, /#article pre\.custom\s*\{[^}]*background-color:\s*#1E1E1E/i);
  assert.match(css, /#article pre\.custom code\.hljs\s*\{[^}]*background:\s*#1E1E1E/i);
});

test("脚注编号和内容布局兜底覆盖 mdnice 双列脚注规则", () => {
  const legacyFootnoteCss = `${ARTICLE_ROOT_SELECTOR} .footnote-item { display: flex; }
${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-num { width: 10%; }`;
  const css = buildMarkdownCss(legacyFootnoteCss);
  const footnotesRules = css.match(/#article \.footnotes \{[^}]*\}/g) ?? [];
  const footnotesOverride = footnotesRules[footnotesRules.length - 1] ?? "";
  const itemRules = css.match(/#article \.footnotes \.footnote-item \{[^}]*\}/g) ?? [];
  const numRules = css.match(/#article \.footnotes \.footnote-num \{[^}]*\}/g) ?? [];
  const itemOverride = itemRules[itemRules.length - 1] ?? "";
  const numOverride = numRules[numRules.length - 1] ?? "";

  assert.ok(css.lastIndexOf(`${ARTICLE_ROOT_SELECTOR} .footnotes .footnote-item`) > css.indexOf(`${ARTICLE_ROOT_SELECTOR} .footnote-item { display: flex; }`));
  assert.match(footnotesOverride, /word-break:\s*break-word/);
  assert.match(footnotesOverride, /overflow-wrap:\s*break-word/);
  assert.match(itemOverride, /display:\s*block !important/);
  assert.match(numOverride, /display:\s*inline !important/);
  assert.match(numOverride, /width:\s*auto !important/);
});

test("横滑图片组布局由系统 CSS 兜底注入，与主题无关", () => {
  const css = buildMarkdownCss("");

  assert.match(css, /#article \.imageflow-layer2\s*\{[^}]*display:\s*flex !important/);
  assert.match(css, /#article \.imageflow-layer2\s*\{[^}]*overflow-x:\s*auto !important/);
  assert.match(css, /#article \.imageflow-layer3\s*\{[^}]*flex:\s*0 0 100% !important/);
  assert.match(css, /#article \.imageflow-layer3\s*\{[^}]*min-width:\s*0 !important/);
  assert.match(css, /#article \.imageflow-img\s*\{[^}]*max-width:\s*100% !important/);
  assert.match(css, /#article \.imageflow-caption\s*\{[^}]*text-align:\s*center/);
});

test("切换代码主题会输出对应的 scoped hljs token 配色", () => {
  const css = buildMarkdownCss("", "night-owl");

  assert.match(css, /#article pre\.custom \.hljs-params\s*\{[^}]*color:\s*#7fdbca/i);
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

// Preview 里有一段优化：全量代码主题加载完（codeThemesVersion 变化）时，
// 如果重算出来的 markdown CSS 和当前注入的逐字节相同，就跳过 replaceStyle，
// 免得白白让浏览器重新解析整张样式表并重算整篇样式。
//
// 这个优化成立的前提就是下面这条断言：常驻列表里的主题在全量列表里必须**完全一致**。
// 一旦主题生成器（scripts/generate-hljs-themes.mjs）让两边产生差异，
// 常驻主题的 CSS 就会在加载瞬间发生变化，那段跳过逻辑就会漏掉一次真实更新 ——
// 所以这里把它钉死，失败时能直接看出原因。
test("常驻代码主题在全量列表里逐字节相同（Preview 跳过重复注入的前提）", () => {
  const fullById = new Map(GENERATED_HLJS_THEMES.map((theme) => [theme.id, theme]));

  for (const core of GENERATED_HLJS_THEMES_CORE) {
    const full = fullById.get(core.id);
    assert.ok(full, `全量列表缺少常驻主题 ${core.id}`);
    assert.deepEqual(
      full,
      core,
      `常驻主题 ${core.id} 在全量列表里不一致：全量加载后它的 CSS 会变，` +
        `Preview 里「字符串没变就跳过 replaceStyle」的优化会漏掉这次更新`,
    );
  }
});
