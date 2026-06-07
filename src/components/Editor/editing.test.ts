import {test} from "node:test";
import assert from "node:assert/strict";
import {wrapSelection, insertLink} from "./editing.ts";

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
