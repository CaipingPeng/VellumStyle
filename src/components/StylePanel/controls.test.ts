import {test} from "node:test";
import assert from "node:assert/strict";
import {colorValueToHex, parseNumericValue} from "./controls.tsx";

test("hex 和 rgba 颜色可转为 color input 需要的 hex", () => {
  assert.equal(colorValueToHex("#abc"), "#aabbcc");
  assert.equal(colorValueToHex("#112233"), "#112233");
  assert.equal(colorValueToHex("rgba(51, 51, 51, 1)"), "#333333");
});

test("无法识别的颜色回退为黑色", () => {
  assert.equal(colorValueToHex("currentColor"), "#000000");
});

test("解析数字和单位", () => {
  assert.deepEqual(parseNumericValue("16px"), {amount: "16", unit: "px"});
  assert.deepEqual(parseNumericValue("1.6em"), {amount: "1.6", unit: "em"});
  assert.deepEqual(parseNumericValue("120%"), {amount: "120", unit: "%"});
  assert.equal(parseNumericValue("bold"), null);
});
