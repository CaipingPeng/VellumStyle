import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {render} from "../markdown/parser.ts";
import {scopeCssTo} from "../components/Theme/scopeCss.ts";
import {
  canStepScale,
  classifySelector,
  DEFAULT_TYPOGRAPHY,
  describeTypography,
  elementsForRole,
  FONT_ROLES,
  formatScale,
  normalizeRemToPx,
  ROOT_ROLE,
  roleForElement,
  sanitizeTypography,
  scaleFontSizeValue,
  scaleThemeCss,
  stepScale,
  type TypographyState,
} from "./typography.ts";

const BUILTIN_DIR = join(process.cwd(), "src", "themes", "builtin");

test("全局缩放不重复放大未分类后代的相对字号", () => {
  const out = scaleThemeCss('#article, #article mark { font-size: 1em; } #article ruby rt { font-size: .6em; }', {global: 1.5, roles: {}});
  assert.match(out, /#article \{ font-size: 1\.5em; \}/);
  assert.match(out, /#article mark \{ font-size: 1em; \}/);
  assert.match(out, /#article ruby rt \{ font-size: 0\.6em; \}/);
});

test("行内代码兜底规则的每个选择器都限制在文章内", () => {
  const out = scaleThemeCss("#article { font-size: 16px; }", {global: 1, roles: {inlineCode: 1.2}});
  assert.match(out, /#article p code, #article li code \{ font-size: 1\.2em; \}/);
});

test("标题装饰与表格行内代码继承角色倍率，不再叠乘", () => {
  const out = scaleThemeCss('#article h1 .prefix::before { font-size: .9em; } #article h1 { font-size: 30px; } #article table { font-size: 16px; } #article table td code { font-size: .95em; }', {global: 1, roles: {h1: 1.5, table: 1.5}});
  assert.match(out, /font-size: 45px/);
  assert.match(out, /font-size: 0\.9em/);
  assert.match(out, /font-size: 24px/);
  assert.match(out, /font-size: 0\.95em/);
});

test("CSS 注释和内容字符串中的标点不破坏字号重写", () => {
  const out = scaleThemeCss('/* h1 { , */ @media screen { #article p { content: "}; font-size: 9rem;"; /* ; */ font-size: 16px; } }', {global: 1.5, roles: {p: 1.2}});
  assert.match(out, /@media screen/);
  assert.match(out, /content: "}; font-size: 9rem;"/);
  assert.match(out, /font-size: 28\.8px/);
});

test("rem 折算支持省略整数部分且不改写内容字符串", () => {
  assert.equal(normalizeRemToPx('#article { margin: -.5rem .5rem; content: "1rem"; }'), '#article { margin: -8px 8px; content: "1rem"; }');
});

test("引用的装饰字号不阻止正文兜底，通用段落绝对字号也能随引用调整", () => {
  const state = {global: 1, roles: {blockquote: 1.5}};
  const decoration = scaleThemeCss('#article blockquote::before { font-size: 18px; }', state);
  assert.match(decoration, /#article blockquote \{ font-size: 1\.5em; \}/);
  assert.match(decoration, /#article blockquote blockquote \{ font-size: inherit; \}/);
  const paragraph = scaleThemeCss('#article p { font-size: 17px; color: red; } #article blockquote { font-size: 16px; }', state);
  assert.match(paragraph, /#article blockquote p \{[^}]*font-size: 25\.5px/);
  assert.doesNotMatch(paragraph, /#article blockquote p \{[^}]*color/);
});

test("条件规则内的祖先字号不影响条件外的相对字号", () => {
  const out = scaleThemeCss('@media print { #article h1 { font-size: 20px; } } #article h1 .content { font-size: 1em; }', {global: 1, roles: {h1: 1.5}});
  assert.match(out, /#article h1 \.content \{ font-size: 1\.5em; \}/);
});

// ---------------------------------------------------------------- rem 折算

test("normalizeRemToPx 按 16px 基准折算", () => {
  assert.equal(normalizeRemToPx("#article h1 { font-size: 2.2rem; }"), "#article h1 { font-size: 35.2px; }");
  assert.equal(normalizeRemToPx("margin: 1.8rem 0 1rem;"), "margin: 28.8px 0 16px;");
  assert.equal(normalizeRemToPx("#article { font-size: 16px; }"), "#article { font-size: 16px; }");
});

test("normalizeRemToPx 不误伤含 rem 字样的标识符", () => {
  assert.equal(normalizeRemToPx(".remx { color: red }"), ".remx { color: red }");
  assert.equal(normalizeRemToPx(".a-rem { color: red }"), ".a-rem { color: red }");
});

// ---------------------------------------------------------------- 值缩放

test("px 吃全局倍率，em / % 只吃角色倍率", () => {
  assert.equal(scaleFontSizeValue("16px", 1.25, 1), "20px");
  assert.equal(scaleFontSizeValue("0.88em", 1.25, 1), "0.88em");
  assert.equal(scaleFontSizeValue("0.88em", 1.25, 1.5), "1.32em");
  assert.equal(scaleFontSizeValue("80%", 1.25, 1.5), "120%");
});

test("不可缩放的写法原样保留", () => {
  assert.equal(scaleFontSizeValue("inherit", 1.25, 1.5), null);
  assert.equal(scaleFontSizeValue("calc(1em + 2px)", 1.25, 1.5), null);
  assert.equal(scaleFontSizeValue("larger", 1.25, 1.5), null);
});

test("!important 被保留", () => {
  assert.equal(scaleFontSizeValue("14px !important", 1.25, 1), "17.5px !important");
  assert.equal(scaleFontSizeValue("0.9em!important", 1, 1.2), "1.08em !important");
});

// ---------------------------------------------------------------- 选择器分类

test("选择器归类", () => {
  const cases: Array<[string, string]> = [
    ["#article", ROOT_ROLE],
    ["#article::after", ROOT_ROLE],
    ["#article p", "p"],
    ["#article p code", "inlineCode"],
    ["#article li code", "inlineCode"],
    ["#article h2 .content", "h2"],
    ["#article h2 .content .prefix", "h2"],
    ["#article h6 .content", "h6"],
    ["#article blockquote", "blockquote"],
    ["#article blockquote blockquote", "blockquote"],
    ["#article li section", "li"],
    ["#article ol li::marker", "li"],
    ["#article ul", "li"],
    ["#article table", "table"],
    ["#article thead th", "table"],
    ["#article tbody td", "table"],
    ["#article .table-container", ROOT_ROLE],
    ["#article pre.custom", "code"],
    ["#article pre.custom code.hljs", "code"],
    ["#article pre.mermaid", ROOT_ROLE],
    ["#article figure figcaption", "figcaption"],
    ["#article .footnote-word", "footnotes"],
    ["#article .footnotes", "footnotes"],
    ["#article .table-of-contents", "toc"],
    ["#article .table-of-contents li", "toc"],
    ["#article mjx-container", ROOT_ROLE],
    // 旧前缀同样能识别
    ["#nice h3 .content", "h3"],
    ["#wechat-article table", "table"],
  ];
  for (const [selector, expected] of cases) {
    assert.equal(classifySelector(selector), expected, `分类错误：${selector}`);
  }
});

test("角色表里的 scope / target 选择器都能被正确分类", () => {
  for (const role of FONT_ROLES) {
    for (const selector of `${role.scope}, ${role.target}`.split(",")) {
      const trimmed = selector.trim();
      if (!trimmed) continue;
      assert.equal(classifySelector(`#article ${trimmed}`), role.key, `${role.key} 的 ${trimmed} 归类错位`);
    }
  }
});

// ---------------------------------------------------------------- 整体变换

test("全局倍率同时放大正文与标题", () => {
  const css = "#article { font-size: 16px; }\n#article p { font-size: 16px; }\n#article h1 .content { font-size: 31px; }";
  const out = scaleThemeCss(css, {global: 1.25, roles: {}});
  assert.match(out, /#article p \{ font-size: 20px; \}/);
  assert.match(out, /#article h1 \.content \{ font-size: 38\.75px; \}/);
});

test("角色倍率只影响该角色，且与全局倍率叠乘", () => {
  const css = "#article p { font-size: 16px; }\n#article h2 .content { font-size: 22px; }";
  const out = scaleThemeCss(css, {global: 1.25, roles: {h2: 1.5}});
  assert.match(out, /#article p \{ font-size: 20px; \}/);
  assert.match(out, /#article h2 \.content \{ font-size: 41\.25px; \}/);
});

test("em 不会被全局倍率重复放大", () => {
  const css = "#article p code { font-size: 0.88em; }";
  const out = scaleThemeCss(css, {global: 1.5, roles: {}});
  assert.match(out, /font-size: 0\.88em/);
  assert.doesNotMatch(out, /1\.32em/);
});

test("根元素上的 em 吃全局倍率（它之上没有已缩放的内容）", () => {
  const out = scaleThemeCss("#article { font-size: 1em; }", {global: 1.25, roles: {}});
  assert.match(out, /#article \{ font-size: 1\.25em; \}/);
});

test("非 font-size 的 px 不受影响", () => {
  const css = "#article blockquote { padding: 8px 24px; margin: 22px 0; font-size: 16px; }";
  const out = scaleThemeCss(css, {global: 1.25, roles: {}});
  assert.match(out, /padding: 8px 24px/);
  assert.match(out, /margin: 22px 0/);
  assert.match(out, /font-size: 20px/);
});

test("一条规则里的多个选择器按角色拆开", () => {
  const css = "#article h1 .content, #article p { font-size: 16px; }";
  const out = scaleThemeCss(css, {global: 1, roles: {h1: 2}});
  assert.match(out, /#article h1 \.content \{ font-size: 32px; \}/);
  assert.match(out, /#article p \{ font-size: 16px; \}/);
});

test("@media 内部的规则同样被缩放", () => {
  const css = "@media (max-width: 480px) { #article h1 .content { font-size: 24px; } }";
  const out = scaleThemeCss(css, {global: 1.25, roles: {}});
  assert.match(out, /@media \(max-width: 480px\)/);
  assert.match(out, /font-size: 30px/);
});

test("@font-face / @keyframes 整块透传", () => {
  const css = "@font-face { font-family: X; src: url(a.woff) }\n@keyframes k { from { opacity: 0 } }";
  const out = scaleThemeCss(css, {global: 1.25, roles: {}});
  assert.match(out, /@font-face \{ font-family: X; src: url\(a\.woff\) \}/);
  assert.match(out, /@keyframes k \{ from \{ opacity: 0 \} \}/);
});

test("主题没声明字号的角色用 em 兜底", () => {
  const out = scaleThemeCss("#article h1 .content { font-size: 20px; }", {global: 1, roles: {p: 1.2}});
  assert.match(out, /#article p \{ font-size: 1\.2em; \}/);
  // 已声明过的角色不补兜底，避免二次放大
  assert.doesNotMatch(out, /#article h1 \.content \{ font-size: 1\.2em/);
});

test("默认状态只做 rem 折算，不产生额外规则", () => {
  const css = "#article h1 { font-size: 2rem; }";
  const out = scaleThemeCss(css, DEFAULT_TYPOGRAPHY);
  assert.equal(out, "#article h1 { font-size: 32px; }");
});

// ---------------------------------------------------------------- 持久化收敛

test("sanitizeTypography 收敛越界值与未知角色", () => {
  assert.deepEqual(sanitizeTypography(undefined), DEFAULT_TYPOGRAPHY);
  assert.deepEqual(sanitizeTypography({global: 99, roles: {}}), {global: 1.5, roles: {}});
  assert.deepEqual(sanitizeTypography({global: 0.1, roles: {}}), {global: 0.8, roles: {}});
  assert.deepEqual(sanitizeTypography({global: "abc", roles: {}}), {global: 1, roles: {}});
  assert.deepEqual(sanitizeTypography({global: 1, roles: {h2: 1.5, 不存在的角色: 2}}), {
    global: 1,
    roles: {h2: 1.5},
  });
  // 等于 1 的角色倍率视为未设置，不落盘
  assert.deepEqual(sanitizeTypography({global: 1, roles: {h2: 1}}), {global: 1, roles: {}});
  assert.deepEqual(sanitizeTypography({global: 1, roles: {h2: 99}}), {global: 1, roles: {h2: 2}});
});

test("describeTypography 汇总当前状态", () => {
  assert.equal(describeTypography(DEFAULT_TYPOGRAPHY), "全局 100%");
  assert.equal(describeTypography({global: 1.2, roles: {h2: 1.5}}), "全局 120% · 二级标题 150%");
});

// ---------------------------------------------------------------- 步进

test("stepScale 按步长进退并夹在区间内", () => {
  assert.equal(stepScale(1, 1, 0.05, 0.6, 2), 1.05);
  assert.equal(stepScale(1, -1, 0.05, 0.6, 2), 0.95);
  assert.equal(stepScale(2, 1, 0.05, 0.6, 2), 2);
  assert.equal(stepScale(0.6, -1, 0.05, 0.6, 2), 0.6);
  // 浮点累加不应留下 1.0000000000000002 这类脏值
  assert.equal(stepScale(0.95, 1, 0.05, 0.6, 2), 1);
});

test("canStepScale 在区间边界上返回 false", () => {
  assert.equal(canStepScale(2, 1, 0.6, 2), false);
  assert.equal(canStepScale(1.95, 1, 0.6, 2), true);
  assert.equal(canStepScale(0.6, -1, 0.6, 2), false);
  assert.equal(canStepScale(0.65, -1, 0.6, 2), true);
});

test("formatScale 取整成百分比", () => {
  assert.equal(formatScale(1), "100%");
  assert.equal(formatScale(1.25), "125%");
  assert.equal(formatScale(0.875), "88%");
});

// ---------------------------------------------------------------- DOM 命中

test("roleForElement 把点击目标映射到角色", () => {
  const root = document.createElement("section");
  root.id = "article";
  root.innerHTML = [
    "<h2><span class=\"content\">标题</span></h2>",
    "<p>正文里有 <code>行内代码</code> 和 <strong>加粗</strong></p>",
    "<blockquote><p>引用里的段落</p></blockquote>",
    "<ul><li><section>列表项</section></li></ul>",
    "<section class=\"table-container\"><table><thead><tr><th>表头</th></tr></thead><tbody><tr><td>单元格</td></tr></tbody></table></section>",
    "<pre class=\"custom\"><code class=\"hljs\">const x = 1;</code></pre>",
    "<figure><img src=\"a.png\"><figcaption>图注</figcaption></figure>",
    "<section class=\"footnotes\"><span class=\"footnote-item\">脚注</span></section>",
    "<hr>",
  ].join("");

  const at = (selector: string) => {
    const el = root.querySelector(selector);
    assert.ok(el, `应有节点 ${selector}`);
    return roleForElement(el, root)!;
  };

  assert.equal(at("h2"), "h2");
  assert.equal(at("h2 .content"), "h2");
  assert.equal(at("p"), "p");
  assert.equal(at("p strong"), "p");
  assert.equal(at("p code"), "inlineCode");
  assert.equal(at("blockquote p"), "blockquote");
  assert.equal(at("li section"), "li");
  assert.equal(at("th"), "table");
  assert.equal(at("td"), "table");
  assert.equal(at("pre.custom code.hljs"), "code");
  assert.equal(at("figcaption"), "figcaption");
  assert.equal(at(".footnote-item"), "footnotes");
  // 命中不了具体角色的块级元素回落到「全文」，用户点空白也能拿到全局控制
  assert.equal(at("hr"), ROOT_ROLE);
  // 图片与媒体卡片不响应
  assert.equal(roleForElement(root.querySelector("img")!, root), null);
  // 文章之外的元素不响应
  assert.equal(roleForElement(document.body, root), null);
});

test("elementsForRole 返回该角色在预览里的全部元素", () => {
  const root = document.createElement("section");
  root.innerHTML = "<h2>一</h2><p>甲</p><h2>二</h2><p>乙</p>";
  assert.equal(elementsForRole(root, "h2").length, 2);
  assert.equal(elementsForRole(root, "p").length, 2);
  assert.deepEqual(elementsForRole(root, ROOT_ROLE), [root]);
});

// ---------------------------------------------------------------- 与真实主题联动

test("全部内置主题在任意倍率下仍产出合法 CSS（括号配对、无 rem 残留）", () => {
  const files = readdirSync(BUILTIN_DIR).filter((file) => file.endsWith(".css"));
  assert.ok(files.length >= 10, `内置主题数量异常：${files.length}`);

  for (const file of files) {
    const raw = scopeCssTo(readFileSync(join(BUILTIN_DIR, file), "utf8"), "#article");
    for (const state of [DEFAULT_TYPOGRAPHY, {global: 1.3, roles: {}} as TypographyState, {global: 1, roles: {h2: 1.5, p: 1.2}} as TypographyState]) {
      const out = scaleThemeCss(raw, state);
      const open = (out.match(/\{/g) ?? []).length;
      const close = (out.match(/\}/g) ?? []).length;
      assert.equal(open, close, `${file} 在 ${describeTypography(state)} 下括号不配对`);
      assert.doesNotMatch(out, /\drem\b/, `${file} 在 ${describeTypography(state)} 下仍有 rem 残留`);
      assert.match(out, /#article/, `${file} 作用域丢失`);
    }
  }
});

// 回归：这是「主题字号调不了」的核心缺陷。
// 「雾屿」全部标题用 rem，rem 相对的是应用根元素而不是文章容器，
// 所以改 #article 字号时它的标题纹丝不动。rem→px 折算后必须能跟随。
test("「雾屿」标题在全局缩放后必须跟随（rem 折算回归）", () => {
  const raw = scopeCssTo(readFileSync(join(BUILTIN_DIR, "morandi-garden.css"), "utf8"), "#article");
  const html = render("# 标题\n\n正文");

  const measure = (state: TypographyState) => {
    const style = document.createElement("style");
    style.textContent = scaleThemeCss(raw, state);
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.id = "article";
    root.innerHTML = html;
    document.body.appendChild(root);

    const h1 = root.querySelector("h1")!;
    const p = root.querySelector("p")!;
    const result = {
      h1: window.getComputedStyle(h1).fontSize,
      p: window.getComputedStyle(p).fontSize,
    };
    style.remove();
    root.remove();
    return result;
  };

  const base = measure(DEFAULT_TYPOGRAPHY);
  // 2.2rem 按 16px 基准折算 = 35.2px
  assert.equal(base.h1, "35.2px", "雾屿 h1 应被折算成字面 px");
  assert.equal(base.p, "16px");

  const big = measure({global: 1.25, roles: {}});
  assert.equal(big.h1, "44px", "雾屿 h1 应当跟随全局倍率");
  assert.equal(big.p, "20px");

  const roleOnly = measure({global: 1, roles: {h1: 0.5}});
  assert.equal(roleOnly.h1, "17.6px", "雾屿 h1 应当跟随角色倍率");
  assert.equal(roleOnly.p, "16px", "角色倍率不应外溢到正文");
});

test("各内置主题：全局缩放后标题与正文都按比例变化", () => {
  const files = readdirSync(BUILTIN_DIR).filter((file) => file.endsWith(".css"));
  let checked = 0;

  for (const file of files) {
    const raw = scopeCssTo(readFileSync(join(BUILTIN_DIR, file), "utf8"), "#article");
    const html = render("# 标题\n\n## 二级\n\n正文段落");

    const sizes = (state: TypographyState) => {
      const style = document.createElement("style");
      style.textContent = scaleThemeCss(raw, state);
      document.head.appendChild(style);
      const root = document.createElement("div");
      root.id = "article";
      root.innerHTML = html;
      document.body.appendChild(root);
      const pick = (selector: string) => Number.parseFloat(window.getComputedStyle(root.querySelector(selector)!).fontSize);
      const result = {h1: pick("h1 .content"), p: pick("p")};
      style.remove();
      root.remove();
      return result;
    };

    const base = sizes(DEFAULT_TYPOGRAPHY);
    const big = sizes({global: 1.25, roles: {}});

    assert.ok(Number.isFinite(base.h1) && base.h1 > 0, `${file}: h1 字号应可解析，实际 ${base.h1}`);
    assert.ok(
      Math.abs(big.h1 / base.h1 - 1.25) < 0.02,
      `${file}: h1 未按 1.25 倍缩放（${base.h1} → ${big.h1}）`,
    );
    assert.ok(
      Math.abs(big.p / base.p - 1.25) < 0.02,
      `${file}: 正文未按 1.25 倍缩放（${base.p} → ${big.p}）`,
    );
    checked++;
  }

  assert.ok(checked >= 10, `应覆盖全部内置主题，实际 ${checked}`);
});
