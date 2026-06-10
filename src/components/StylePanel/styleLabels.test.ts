import {test} from "node:test";
import assert from "node:assert/strict";
import {getStyleLabel} from "./styleLabels.ts";

test("常用 style id 映射为中文标签", () => {
  assert.equal(getStyleLabel("fontSize"), "字号");
  assert.equal(getStyleLabel("fontColor"), "文字颜色");
  assert.equal(getStyleLabel("lineHeight"), "行高");
  assert.equal(getStyleLabel("marginTop"), "上边距");
  assert.equal(getStyleLabel("paddingBottom"), "下内边距");
  assert.equal(getStyleLabel("textAlign"), "对齐");
});

test("未知 style id 保留原始字段名", () => {
  assert.equal(getStyleLabel("customToken"), "customToken");
});
