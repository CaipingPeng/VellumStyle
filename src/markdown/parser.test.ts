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

test("原始 HTML 中的脚本和事件属性不会进入渲染结果", () => {
  const html = render('<img src="https://example.com/a.png" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">链接</a>');

  assert.match(html, /<img src="https:\/\/example\.com\/a\.png"/);
  assert.match(html, />链接<\/a>/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /onclick/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test("image-flow 图片语法中的 alt 不会注入额外属性", () => {
  const html = render('<![封面" onerror="alert(1)](https://example.com/a.png)>');

  assert.match(html, /class="imageflow-img"/);
  assert.match(html, /alt="封面&quot; onerror=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /\sonerror=(["'])/i);
});

test("mermaid 围栏代码块渲染为图表容器而不是普通代码块", () => {
  const html = render("```mermaid\ngraph TD\n  A[开始] --> B[结束]\n```");

  assert.match(html, /<pre\b[^>]*class="mermaid"[^>]*>/);
  assert.match(html, /<pre\b[^>]*data-mermaid-source="true"[^>]*>/);
  assert.match(html, /<pre\b[^>]*data-line="0"[^>]*>/);
  assert.match(html, /graph TD\n  A\[开始\] --&gt; B\[结束\]/);
  assert.doesNotMatch(html, /class="custom"/);
  assert.doesNotMatch(html, /<code/);
});
