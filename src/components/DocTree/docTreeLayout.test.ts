import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  DEFAULT_DOC_TREE_WIDTH,
  MAX_DOC_TREE_WIDTH,
  MIN_DOC_TREE_WIDTH,
  resizeDocTreeWidth,
} from "./docTreeLayout.ts";

test("文件树宽度拖拽计算会按起点偏移并限制范围", () => {
  assert.equal(DEFAULT_DOC_TREE_WIDTH, 220);
  assert.equal(resizeDocTreeWidth(220, 100, 180), 300);
  assert.equal(resizeDocTreeWidth(220, 100, -1000), MIN_DOC_TREE_WIDTH);
  assert.equal(resizeDocTreeWidth(220, 100, 2000), MAX_DOC_TREE_WIDTH);
});

test("文件树节点 hover 时显示完整名称且操作区不常驻占位", async () => {
  const source = await readFile(new URL("./TreeNode.tsx", import.meta.url), "utf8");

  assert.match(source, /title=\{!editing \? node\.name : undefined\}/);
  assert.match(source, /aria-label=\{node\.name\}/);
  assert.match(source, /group-hover:pr-12/);
  assert.match(source, /absolute inset-y-0 right-0/);
  assert.match(source, /max-w-0/);
  assert.match(source, /group-hover:max-w-12/);
});

test("文件树节点提供打开文件位置的右键菜单", async () => {
  const source = await readFile(new URL("./TreeNode.tsx", import.meta.url), "utf8");

  assert.match(source, /onContextMenu=\{openContextMenu\}/);
  assert.match(source, /打开文件位置/);
  assert.match(source, /onOpenLocation\(node\.path\)/);
});

test("文件树拖拽手柄保持细窄的 4px 命中区域", async () => {
  const source = await readFile(new URL("./DocTree.tsx", import.meta.url), "utf8");

  assert.match(source, /aria-label="调整文件树宽度"/);
  assert.match(source, /w-1 cursor-col-resize/);
});
