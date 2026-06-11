import {test} from "node:test";
import assert from "node:assert/strict";
import {render} from "./parser.ts";

test("链接脚注编号和内容保持同一行内结构", () => {
  const html = render('这是一个带脚注的[术语](这里是脚注的解释内容 "术语")。');

  assert.match(html, /<span id="fn1" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">\[1\] <\/span>术语: <em>这里是脚注的解释内容<\/em><\/span>/);
  assert.doesNotMatch(html, /<span id="fn1" class="footnote-item"[^>]*>[\s\S]*<p>/);
});

test("标准 Markdown 脚注定义渲染到脚注区", () => {
  const html = render("正文内容[^注1]\n\n[^注1]: 这是脚注内容");

  assert.match(html, /正文内容<sup class="footnote-ref">\[1\]<\/sup>/);
  assert.match(html, /<span id="fn1" class="footnote-item" style="display:block;"><span class="footnote-num" style="display:inline;width:auto;">\[1\] <\/span>这是脚注内容<\/span>/);
  assert.doesNotMatch(html, /\^注1/);
  assert.doesNotMatch(html, /\[\^注1\]:/);
});

test("双等号高亮语法渲染为 mark", () => {
  const html = render("这是一段==高亮==文本。");

  assert.match(html, /<p data-line="0">这是一段<mark>高亮<\/mark>文本。<\/p>/);
  assert.doesNotMatch(html, /==高亮==/);
});
