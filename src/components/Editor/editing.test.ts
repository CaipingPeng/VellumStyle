import {test} from "node:test";
import assert from "node:assert/strict";
import {wrapSelection} from "./editing.ts";

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
