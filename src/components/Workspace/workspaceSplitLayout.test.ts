import assert from "node:assert/strict";
import {test} from "node:test";
import {
  DEFAULT_WORKSPACE_SPLIT_RATIO,
  clampWorkspaceSplitRatio,
  getWorkspacePaneWidths,
  getWorkspaceRatioBounds,
  ratioFromPointer,
  sanitizeWorkspaceSplitRatio,
  stepWorkspaceSplitRatio,
} from "./workspaceSplitLayout.ts";

test("工作区分栏比例为归一化值且非法持久化值回退默认值", () => {
  assert.equal(DEFAULT_WORKSPACE_SPLIT_RATIO, 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(Number.NaN), 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(Number.POSITIVE_INFINITY), 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(-1), 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(3), 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(0.2), 0.2);
  assert.equal(sanitizeWorkspaceSplitRatio(0.8), 0.8);
});

test("宽工作区按面板最小宽度给出动态比例边界", () => {
  assert.deepEqual(getWorkspaceRatioBounds(1008), {min: 0.28, max: 0.72});
});

test("比例和像素换算忽略 8px 分隔柄并受实时宽度约束", () => {
  assert.deepEqual(getWorkspacePaneWidths(0.6, 1008), {
    editor: 600,
    preview: 400,
  });
  assert.equal(ratioFromPointer(700, 100, 1008), 0.6);
  assert.equal(ratioFromPointer(-1000, 100, 1008), 0.28);
});

test("不足双侧最小宽度时均分而不关闭抽屉", () => {
  assert.deepEqual(getWorkspaceRatioBounds(508), {min: 0.5, max: 0.5});
  assert.equal(clampWorkspaceSplitRatio(0.8, 508), 0.5);
  assert.deepEqual(getWorkspacePaneWidths(0.8, 508), {
    editor: 250,
    preview: 250,
  });
});

test("键盘支持小步、大步和 Home 恢复默认比例", () => {
  assert.equal(stepWorkspaceSplitRatio(0.5, "ArrowRight", 1008, false), 0.52);
  assert.equal(stepWorkspaceSplitRatio(0.5, "ArrowLeft", 1008, true), 0.4);
  assert.equal(stepWorkspaceSplitRatio(0.7, "Home", 1008, false), 0.5);
  assert.equal(stepWorkspaceSplitRatio(0.5, "Enter", 1008, false), null);
});
