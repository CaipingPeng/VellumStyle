import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeMathJaxForWechat, stripPreviewEditClasses} from "./converter.ts";

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
  const html = stripPreviewEditClasses('<h1 class="title preview-edit-hover preview-edit-selected">标题</h1>');

  assert.equal(html, '<h1 class="title">标题</h1>');
});
