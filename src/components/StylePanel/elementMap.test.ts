import {test} from "node:test";
import assert from "node:assert/strict";
import {getModelLabel, matchModelId, SELECTOR_PRIORITY} from "./elementMap.ts";

test("h1 命中 h1", () => {
  assert.equal(matchModelId((sel) => sel === "h1"), "h1");
});

test("p 在 blockquote 内优先归 blockquote", () => {
  assert.equal(matchModelId((sel) => sel === "p" || sel === "blockquote"), "blockquote");
});

test("th 归 tableHead", () => {
  assert.equal(matchModelId((sel) => sel === "th"), "tableHead");
});

test("无命中返回 null", () => {
  assert.equal(matchModelId(() => false), null);
});

test("优先级表覆盖所有可点击元素", () => {
  const ids = SELECTOR_PRIORITY.map((e) => e.modelId);
  for (const id of ["h1", "h2", "p", "blockquote", "ul", "ol", "a", "strong", "em", "blockCode", "inlineCode", "table", "tableHead", "tableBody", "image", "imageDescription"]) {
    assert.ok(ids.includes(id), `缺 ${id}`);
  }
});

test("model id 映射为中文对象名", () => {
  assert.equal(getModelLabel("h1"), "一级标题");
  assert.equal(getModelLabel("p"), "正文");
  assert.equal(getModelLabel("blockquote"), "引用");
  assert.equal(getModelLabel("blockCode"), "代码块");
  assert.equal(getModelLabel("unknown"), "unknown");
});
