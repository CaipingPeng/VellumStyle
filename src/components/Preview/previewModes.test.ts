import {test} from "node:test";
import assert from "node:assert/strict";
import {getPreviewMode, PREVIEW_MODES} from "./previewModes.ts";

test("预览宽度模式包含放开展示、微信桌面端渲染、手机端渲染", () => {
  assert.deepEqual(PREVIEW_MODES.map((m) => m.id), ["fluid", "wechat", "mobile"]);
});

test("预览宽度模式给出稳定宽度", () => {
  assert.equal(getPreviewMode("fluid").width, null);
  assert.equal(getPreviewMode("wechat").width, 677);
  assert.equal(getPreviewMode("mobile").width, 390);
});
