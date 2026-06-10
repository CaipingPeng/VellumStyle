import {test} from "node:test";
import assert from "node:assert/strict";
import {filterAndRankThemes} from "./themePickerModel.ts";

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
