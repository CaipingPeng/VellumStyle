import {test} from "node:test";
import assert from "node:assert/strict";
import {render} from "../../markdown/parser.ts";
import {scopeCss} from "./scopeCss.ts";
import {SAMPLE_MARKDOWN} from "./sampleContent.ts";

test("#nice 前缀替换为 scope class", () => {
  const out = scopeCss("#nice p { color: red; }", "tp-x");
  assert.equal(out.trim(), ".tp-x p { color: red; }");
});

test("#wechat-article 前缀替换为 scope class", () => {
  const out = scopeCss("#wechat-article p { color: red; }", "tp-x");
  assert.equal(out.trim(), ".tp-x p { color: red; }");
});

test("#article 前缀替换为 scope class", () => {
  const out = scopeCss("#article p { color: red; }", "tp-x");
  assert.equal(out.trim(), ".tp-x p { color: red; }");
});

test("裸选择器前面补 scope", () => {
  const out = scopeCss(".hljs { background: #f8f8f8; }", "tp-x");
  assert.equal(out.trim(), ".tp-x .hljs { background: #f8f8f8; }");
});

test("逗号多选择器逐个处理", () => {
  const out = scopeCss("#nice h1, #nice h2 { margin: 0; }", "tp-x");
  assert.equal(out.trim(), ".tp-x h1, .tp-x h2 { margin: 0; }");
});

test("#nice 单独选择器（整体根）替换为 .scope", () => {
  const out = scopeCss("#nice { font-size: 16px; }", "tp-x");
  assert.equal(out.trim(), ".tp-x { font-size: 16px; }");
});

test("混合 #nice 与裸选择器", () => {
  const out = scopeCss("#nice strong, .hljs-keyword { color: #333; }", "tp-x");
  assert.equal(out.trim(), ".tp-x strong, .tp-x .hljs-keyword { color: #333; }");
});

test("@media 等 at-rule 整块跳过（内部规则仍改写）", () => {
  const out = scopeCss("@media (max-width: 600px) { #nice p { font-size: 14px; } }", "tp-x");
  assert.ok(out.includes("@media (max-width: 600px)"));
  assert.ok(out.includes(".tp-x p"));
  assert.ok(!out.includes("#nice"));
});

test("空块/注释不报错", () => {
  const out = scopeCss("/* c */\n#nice p {}", "tp-x");
  assert.ok(out.includes(".tp-x p"));
});

test("@font-face 原样透传，body 不被清空", () => {
  const out = scopeCss('@font-face { font-family: "X"; src: url(x.woff); }', "tp-x");
  assert.ok(out.includes("font-family"));
  assert.ok(out.includes("src: url(x.woff)"));
  assert.ok(!out.includes(".tp-x font-family"));
});

test("@keyframes 原样透传，关键帧不被加 scope", () => {
  const out = scopeCss("@keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } }", "tp-x");
  assert.ok(out.includes("@keyframes spin"));
  assert.ok(!out.includes(".tp-x 0%"));
  assert.ok(!out.includes(".tp-x 100%"));
});

test("复杂主题选择器保持伪元素和表格伪类", () => {
  const out = scopeCss("#nice h2::after, #nice table tr th:first-child, .hljs-keyword { color: red; }", "tp-x");
  assert.equal(out.trim(), ".tp-x h2::after, .tp-x table tr th:first-child, .tp-x .hljs-keyword { color: red; }");
});

test("缩略图示例 Markdown 渲染出核心文章结构", () => {
  const html = render(SAMPLE_MARKDOWN);
  assert.match(html, /<h2[^>]*>/);
  assert.match(html, /<h3[^>]*>/);
  assert.match(html, /<blockquote\b/);
  assert.match(html, /<ul\b/);
  assert.match(html, /class="table-container"/);
  assert.match(html, /<pre class="custom"><code class="hljs">/);
  assert.match(html, /<strong>/);
  assert.match(html, /<em>/);
  assert.match(html, /<(s|del)>/);
});
