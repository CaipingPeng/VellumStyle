import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";
import {DEFAULT_WORKSPACE_SPLIT_RATIO} from "../components/Workspace/workspaceSplitLayout.ts";

const storeSource = readFile(new URL("./index.ts", import.meta.url), "utf8");

test("工作区分栏比例有共享默认值并通过合法化 setter 更新", async () => {
  assert.equal(DEFAULT_WORKSPACE_SPLIT_RATIO, 0.5);
  const source = await storeSource;
  assert.match(source, /workspaceSplitRatio: number/);
  assert.match(source, /setWorkspaceSplitRatio: \(ratio: number\) => void/);
  assert.match(source, /workspaceSplitRatio: DEFAULT_WORKSPACE_SPLIT_RATIO/);
  assert.match(source, /setWorkspaceSplitRatio: \(workspaceSplitRatio\) =>/);
  assert.match(source, /sanitizeWorkspaceSplitRatio\(workspaceSplitRatio\)/);
});

test("只持久化分栏比例而不持久化两个抽屉开关", async () => {
  const source = await storeSource;
  const partialize = source.slice(source.indexOf("partialize:"));
  assert.match(partialize, /workspaceSplitRatio: s\.workspaceSplitRatio/);
  assert.match(partialize, /merge:/);
  assert.match(partialize, /sanitizeWorkspaceSplitRatio\(saved\?\.workspaceSplitRatio\)/);
  assert.doesNotMatch(partialize, /sidebarOpen:/);
  assert.doesNotMatch(partialize, /outlineOpen:/);
});
