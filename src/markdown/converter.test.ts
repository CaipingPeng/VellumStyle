import {test} from "node:test";
import assert from "node:assert/strict";
import {ARTICLE_BOX_ID} from "../articleRoot.ts";
import {STYLE_IDS} from "../utils/style.ts";
import {
  normalizeDraftLists,
  normalizeLinksForWechat,
  normalizeMathJaxForWechat,
  solveHtml,
  stripPreviewEditClasses,
} from "./converter.ts";

test("行间 MathJax 导出为居中的 section", () => {
  const html = normalizeMathJaxForWechat('<mjx-container class="MathJax" jax="SVG" display="true"><svg></svg></mjx-container>');

  assert.match(html, /^<section\b/);
  assert.match(html, /class="MathJax block-equation"/);
  assert.match(html, /display:block/);
  assert.match(html, /text-align:center/);
  assert.match(html, /overflow-x:auto/);
  assert.doesNotMatch(html, /mjx-container/);
});

test("行内 MathJax 导出为 span 且不添加块级居中样式", () => {
  const html = normalizeMathJaxForWechat('<p>a <mjx-container class="MathJax" jax="SVG"><svg></svg></mjx-container> b</p>');

  assert.match(html, /<span class="MathJax" jax="SVG"><svg><\/svg><\/span>/);
  assert.doesNotMatch(html, /block-equation/);
  assert.doesNotMatch(html, /text-align:center/);
  assert.doesNotMatch(html, /<section\b/);
});

test("行间公式保留已有 style 并追加居中样式", () => {
  const html = normalizeMathJaxForWechat(
    '<mjx-container class="MathJax" jax="SVG" display="true" style="position: relative;"><svg></svg></mjx-container>',
  );

  assert.match(html, /style="position: relative;display:block;text-align:center/);
});

test("移除 MathJax assistive MML", () => {
  const html = normalizeMathJaxForWechat(
    '<mjx-container class="MathJax" jax="SVG"><svg></svg><mjx-assistive-mml><math></math></mjx-assistive-mml></mjx-container>',
  );

  assert.doesNotMatch(html, /mjx-assistive-mml/);
  assert.doesNotMatch(html, /<math>/);
});

test("保留 mjx-solid 兼容替换", () => {
  const html = normalizeMathJaxForWechat('<path class="mjx-solid"></path>');

  assert.equal(html, '<path fill="none" stroke-width="70"></path>');
});

test("导出前剥离预览编辑辅助 class 但保留业务 class", () => {
  const html = stripPreviewEditClasses('<h1 class="title preview-edit-hover preview-edit-selected">标题</h1><img src="a.png" data-vs-image-index="0"><div class="vs-image-resize-overlay"><button></button></div>');

  assert.equal(html, '<h1 class="title">标题</h1><img src="a.png">');
});

test("导出链接 leaf 外壳继承链接文字样式，避免转换后原位置格式漂移", () => {
  const html = normalizeLinksForWechat(
    '<p><a href="https://example.com" style="font-size: 16px; line-height: 1.8; color: red; border-bottom: 1px solid red;">Example</a></p>',
  );

  assert.match(html, /<span leaf="" style="font-size: 16px; line-height: 1.8; color: red"><a\b/);
  assert.doesNotMatch(html, /<span leaf=""[^>]*border-bottom/);
});

test("发布到草稿箱保留列表项 section 包裹，避免微信把冒号后的正文拆到下一行", () => {
  const html = normalizeDraftLists('<ul><li><section><strong>good</strong>：describing something nice</section></li></ul>');

  assert.match(html, /<li><section><strong>good<\/strong>：describing something nice<\/section><\/li>/);
  assert.doesNotMatch(html, /<li><strong>good<\/strong><section>/);
});

test("发布到草稿箱清理列表内空白节点，避免微信生成首个空项目", () => {
  const html = normalizeDraftLists(
    '<ul>\n<li><section><strong>good</strong>：describing something nice</section></li>\n<li><section><strong>bad</strong>：describing something unexpected</section></li>\n</ul>',
  );

  assert.equal(
    html,
    '<ul><li><section><strong>good</strong>：describing something nice</section></li><li><section><strong>bad</strong>：describing something unexpected</section></li></ul>',
  );
});

test("发布到草稿箱移除微信回写形态里的空列表项", () => {
  const html = normalizeDraftLists(
    '<ul><li><section><span leaf=""><br class="ProseMirror-trailingBreak"></span></section></li><li><section>good</section></li></ul>',
  );

  assert.equal(html, '<ul><li><section>good</section></li></ul>');
});

test("发布到草稿箱保留列表项内链接的 href", () => {
  const html = normalizeDraftLists('<ul><li><section><a href="https://example.com">Example</a></section></li></ul>');

  assert.match(html, /<a href="https:\/\/example\.com">Example<\/a>/);
});

test("导出链接带上微信编辑器识别的文本链接属性", () => {
  const html = normalizeLinksForWechat('<p><a href="https://example.com">Example</a></p>');

  assert.match(html, /<a\b[^>]*href="https:\/\/example\.com"/);
  assert.match(html, /data-linktype="2"/);
  assert.match(html, /linktype="text"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /tab="outerlink"/);
  assert.match(html, /textvalue="Example"/);
});

test("导出微信公众号文章链接带上文章链接识别属性", () => {
  const html = normalizeLinksForWechat('<p><a href="https://mp.weixin.qq.com/s?__biz=abc&amp;mid=1">微信文章</a></p>');

  assert.match(html, /class="[^"]*\bnormal_text_link\b[^"]*\bmp_article_text_link\b[^"]*"/);
  assert.match(html, /hasload="1"/);
  assert.doesNotMatch(html, /tab="outerlink"/);
});

test("导出链接包在微信编辑器可识别的 leaf 节点里", () => {
  const html = normalizeLinksForWechat('<p>项目地址：<a href="https://github.com/CaipingPeng/VellumStyle">CaipingPeng/VellumStyle</a>。</p>');

  assert.match(html, /<span leaf=""><a\b[^>]*href="https:\/\/github\.com\/CaipingPeng\/VellumStyle"/);
  assert.match(html, /class="normal_text_link"/);
  assert.match(html, /textvalue="CaipingPeng\/VellumStyle"/);
});

test("solveHtml 导出 Mermaid SVG 时内联关键样式且移除 SVG style", () => {
  const style = document.createElement("style");
  style.id = STYLE_IDS.markdown;
  style.innerText = "";
  document.body.appendChild(style);

  const box = document.createElement("div");
  box.id = ARTICLE_BOX_ID;
  box.innerHTML = [
    "<section>",
    '<pre class="mermaid" data-line="1">',
    '<svg viewBox="0 0 100 40">',
    "<style>.node{fill:#fff}</style>",
    '<rect width="80" height="32"></rect>',
    '<text x="8" y="22">标题</text>',
    '<path d="M80 16L96 16"></path>',
    "</svg>",
    "</pre>",
    "</section>",
  ].join("");
  document.body.appendChild(box);

  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = ((element: Element) => {
    const tag = element.tagName.toLowerCase();
    if (!document.body.contains(element)) {
      return {} as CSSStyleDeclaration;
    }
    const values: Partial<CSSStyleDeclaration> =
      tag === "rect"
        ? {fill: "#ffffff", stroke: "#333333", strokeWidth: "2px"}
        : tag === "text"
          ? {fill: "#111111", color: "#111111", fontFamily: "Arial", fontSize: "16px", fontWeight: "400"}
          : tag === "path"
            ? {fill: "none", stroke: "#333333", strokeWidth: "2px"}
            : {};
    return values as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle;

  try {
    const html = solveHtml();
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<style>/);
    assert.match(html, /<rect[^>]*fill="#ffffff"[^>]*stroke="#333333"[^>]*stroke-width="2px"/);
    assert.match(html, /<text[^>]*fill="#111111"[^>]*font-family="Arial"[^>]*font-size="16px"/);
    assert.match(html, /<path[^>]*fill="none"[^>]*stroke="#333333"/);
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
    box.remove();
    style.remove();
  }
});

test("solveHtml 导出 Mermaid SVG 时移除 foreignObject，保留可复制的 SVG text", () => {
  const style = document.createElement("style");
  style.id = STYLE_IDS.markdown;
  style.innerText = "";
  document.body.appendChild(style);

  const box = document.createElement("div");
  box.id = ARTICLE_BOX_ID;
  box.innerHTML = [
    "<section>",
    '<pre class="mermaid" data-line="1">',
    '<svg viewBox="0 0 120 80">',
    '<g class="node" transform="translate(60, 40)">',
    '<rect class="label-container" x="-50" y="-24" width="100" height="48"></rect>',
    '<g class="label" transform="translate(-40, -16)">',
    '<foreignObject width="80" height="32"><div><span>第一行</span><br><span>第二行</span></div></foreignObject>',
    "</g>",
    "</g>",
    "</svg>",
    "</pre>",
    "</section>",
  ].join("");
  document.body.appendChild(box);

  try {
    const html = solveHtml();
    assert.doesNotMatch(html, /foreignObject/i);
    assert.doesNotMatch(html, /<p\b/i);
    assert.match(html, /<text[^>]*text-anchor="middle"[^>]*>/);
    assert.match(html, /<tspan[^>]*>第一行<\/tspan>/);
    assert.match(html, /<tspan[^>]*dy="1.2em"[^>]*>第二行<\/tspan>/);
  } finally {
    box.remove();
    style.remove();
  }
});
