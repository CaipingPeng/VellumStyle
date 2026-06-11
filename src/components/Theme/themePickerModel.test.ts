import {test} from "node:test";
import assert from "node:assert/strict";
import {
  filterAndRankThemes,
  getPageJumpRange,
  getPageJumpTarget,
  shouldShowPageJumpInput,
} from "./themePickerModel.ts";

const themes = [
  {id: "default", name: "默认"},
  {id: "caoyuan", name: "草原绿"},
  {id: "github", name: "GitHub 风"},
  {id: "ink", name: "极简黑"},
];

test("主题搜索按名称和 id 匹配", () => {
  assert.deepEqual(filterAndRankThemes(themes, "草原", [], "default").map((t) => t.id), ["caoyuan"]);
  assert.deepEqual(filterAndRankThemes(themes, "git", [], "default").map((t) => t.id), ["github"]);
});

test("无搜索时当前主题和收藏主题优先", () => {
  assert.deepEqual(filterAndRankThemes(themes, "", ["ink"], "github").map((t) => t.id), ["github", "ink", "default", "caoyuan"]);
});

test("页码跳转按钮从当前页开始展示 6 页窗口", () => {
  assert.deepEqual(getPageJumpRange(0, 12, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(getPageJumpRange(1, 12, 6), [1, 2, 3, 4, 5, 6]);
});

test("页码跳转按钮在总页数不足或接近末尾时夹在有效范围内", () => {
  assert.deepEqual(getPageJumpRange(0, 4, 6), [0, 1, 2, 3]);
  assert.deepEqual(getPageJumpRange(10, 12, 6), [6, 7, 8, 9, 10, 11]);
});

test("页码输入跳转只在页数超过阈值时显示", () => {
  assert.equal(shouldShowPageJumpInput(10, 10), false);
  assert.equal(shouldShowPageJumpInput(11, 10), true);
});

test("页码输入跳转把用户输入转换并夹到有效页", () => {
  assert.equal(getPageJumpTarget("2", 12), 1);
  assert.equal(getPageJumpTarget("0", 12), 0);
  assert.equal(getPageJumpTarget("99", 12), 11);
  assert.equal(getPageJumpTarget(" 6 ", 12), 5);
  assert.equal(getPageJumpTarget("", 12), null);
  assert.equal(getPageJumpTarget("2.5", 12), null);
});
