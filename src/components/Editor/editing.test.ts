import {test} from "node:test";
import assert from "node:assert/strict";
import {wrapSelection, insertLink, prefixLines, insertCodeBlock} from "./editing.ts";

test("wrap 有选区：包裹并选中原文字", () => {
  const doc = "你好世界";
  const r = wrapSelection(doc, 2, 4, "**", "**", "加粗文本");
  assert.equal(r.insert, "**世界**");
  assert.equal(r.selFrom, 4);
  assert.equal(r.selTo, 6);
});

test("wrap 无选区：插入占位符并选中占位符", () => {
  const doc = "abc";
  const r = wrapSelection(doc, 3, 3, "**", "**", "加粗文本");
  assert.equal(r.insert, "**加粗文本**");
  assert.equal(r.selFrom, 5);
  assert.equal(r.selTo, 5 + "加粗文本".length);
});

test("link 有选区：选区当链接文字，选中 url 占位", () => {
  const doc = "看这里";
  const r = insertLink(doc, 0, 3);
  assert.equal(r.insert, "[看这里](链接地址)");
  const urlStart = "[看这里](".length;
  assert.equal(r.selFrom, urlStart);
  assert.equal(r.selTo, urlStart + "链接地址".length);
});

test("link 无选区：选中链接文字占位", () => {
  const doc = "";
  const r = insertLink(doc, 0, 0);
  assert.equal(r.insert, "[链接文字](链接地址)");
  assert.equal(r.selFrom, 1);
  assert.equal(r.selTo, 1 + "链接文字".length);
});

test("prefix 单行：行首加前缀，光标折叠到块末尾（不选中语法符号）", () => {
  const doc = "标题";
  const r = prefixLines(doc, 0, 0, "## ");
  assert.equal(r.replaceFrom, 0);
  assert.equal(r.replaceTo, 2);
  assert.equal(r.insert, "## 标题");
  // 光标落在块末尾，不选中——这样可继续打字而不覆盖语法符号
  const end = "## 标题".length;
  assert.equal(r.selFrom, end);
  assert.equal(r.selTo, end);
});

test("prefix 空行加前缀：光标落在前缀之后可直接输入", () => {
  const doc = "";
  const r = prefixLines(doc, 0, 0, "## ");
  assert.equal(r.insert, "## ");
  assert.equal(r.selFrom, "## ".length);
  assert.equal(r.selTo, "## ".length);
});

test("prefix 多行：每行逐行加前缀，光标折叠到块末尾", () => {
  const doc = "甲\n乙\n丙";
  const r = prefixLines(doc, 0, 3, "- ");
  assert.equal(r.replaceFrom, 0);
  assert.equal(r.replaceTo, 3);
  assert.equal(r.insert, "- 甲\n- 乙");
  const end = r.replaceFrom + r.insert.length;
  assert.equal(r.selFrom, end);
  assert.equal(r.selTo, end);
});

test("codeBlock 无选区：插入围栏，光标落在中间空行", () => {
  const doc = "abc";
  const r = insertCodeBlock(doc, 3, 3);
  assert.equal(r.insert, "\n```\n\n```\n");
  // 光标落在第二个换行之后（中间空行起点）：from + len("\n```\n")
  const mid = 3 + "\n```\n".length;
  assert.equal(r.selFrom, mid);
  assert.equal(r.selTo, mid);
});

test("codeBlock 有选区：选区文字进围栏，选中该文字", () => {
  const doc = "代码";
  const r = insertCodeBlock(doc, 0, 2);
  assert.equal(r.insert, "\n```\n代码\n```\n");
  const start = "\n```\n".length;
  assert.equal(r.selFrom, start);
  assert.equal(r.selTo, start + "代码".length);
});
