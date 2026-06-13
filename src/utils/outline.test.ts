import {test} from "node:test";
import assert from "node:assert/strict";
import {getActiveOutlineLine, parseMarkdownOutline} from "./outline.ts";

test("解析当前文档中的多级 ATX 标题", () => {
  const outline = parseMarkdownOutline(`# 标题一

正文

## 标题二
### 标题三 ###
###### 标题六
####### 不是标题
`);

  assert.deepEqual(outline, [
    {id: "heading-0", level: 1, text: "标题一", line: 0},
    {id: "heading-1", level: 2, text: "标题二", line: 4},
    {id: "heading-2", level: 3, text: "标题三", line: 5},
    {id: "heading-3", level: 6, text: "标题六", line: 6},
  ]);
});

test("忽略围栏代码块里的井号行", () => {
  const outline = parseMarkdownOutline(`# 正文标题

\`\`\`md
# 代码里的标题
## 代码里的二级标题
\`\`\`

## 继续
`);

  assert.deepEqual(outline.map((item) => item.text), ["正文标题", "继续"]);
  assert.deepEqual(outline.map((item) => item.line), [0, 7]);
});

test("清理常见行内标记后显示标题文本", () => {
  const outline = parseMarkdownOutline(`
## **加粗** 和 [链接](https://example.com) \`code\`
### ![图](image.png) *斜体*
`);

  assert.equal(outline[0].text, "加粗 和 链接 code");
  assert.equal(outline[1].text, "图 斜体");
});

test("空标题不会进入大纲", () => {
  assert.deepEqual(parseMarkdownOutline("#\n##    \n正文"), []);
});

test("根据当前源码行定位最近的大纲标题", () => {
  const outline = [
    {id: "heading-0", level: 1, text: "一", line: 0},
    {id: "heading-1", level: 2, text: "二", line: 5},
    {id: "heading-2", level: 3, text: "三", line: 12},
  ];

  assert.equal(getActiveOutlineLine(outline, -1), null);
  assert.equal(getActiveOutlineLine(outline, 0), 0);
  assert.equal(getActiveOutlineLine(outline, 8), 5);
  assert.equal(getActiveOutlineLine(outline, 99), 12);
});
