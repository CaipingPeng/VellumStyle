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

  // 行内不再进入编辑态：名字始终直接展示，改名输入在 RenameDialog 里。
  assert.match(source, /title=\{node\.name\}/);
  assert.match(source, /aria-label=\{node\.name\}/);
  assert.match(source, /group-hover:pr-12/);
  assert.match(source, /absolute inset-y-0 right-0/);
  assert.match(source, /max-w-0/);
  assert.match(source, /group-hover:max-w-12/);
});

test("文件夹行 hover 显示新建文档/新建文件夹按钮，文件行不显示", async () => {
  const nodeSource = await readFile(new URL("./TreeNode.tsx", import.meta.url), "utf8");
  const docTreeSource = await readFile(new URL("./DocTree.tsx", import.meta.url), "utf8");

  assert.match(nodeSource, /title="新建文档"/);
  assert.match(nodeSource, /title="新建文件夹"/);
  assert.match(nodeSource, /onCreateIn\(node\.path, "doc"\)/);
  assert.match(nodeSource, /onCreateIn\(node\.path, "folder"\)/);
  assert.match(docTreeSource, /onCreateIn=\{startCreateIn\}/);
});

test("文件树选中文件或文件夹后按 F2 进入重命名会话", async () => {
  const docTreeSource = await readFile(new URL("./DocTree.tsx", import.meta.url), "utf8");
  const nodeSource = await readFile(new URL("./TreeNode.tsx", import.meta.url), "utf8");
  const dialogSource = await readFile(new URL("./RenameDialog.tsx", import.meta.url), "utf8");

  assert.match(docTreeSource, /event\.key === "F2"/);
  assert.match(docTreeSource, /startRenaming\(node\)/);
  // 会话对象下发给所有节点：由节点自行按 path 判断是否高亮。
  // 若只在命中节点上挂 rename，祖先会被 memo 浅比较短路，嵌套节点改名会完全无反应。
  assert.match(docTreeSource, /renameSession=\{renameForNodes\}/);
  assert.match(nodeSource, /renameSession\.path === node\.path/);
  assert.match(nodeSource, /renameSession=\{renameSession\}/);
  // 改名输入在遮罩弹层里：portal 到 body、aria-modal、带"放弃修改"保护。
  assert.match(dialogSource, /createPortal/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /放弃修改/);
  assert.match(dialogSource, /id="rename-dialog-input"/);
  // TreeNode 内不得再出现行内输入框或按 token 复位的信号。
  assert.doesNotMatch(nodeSource, /renameSignal/);
  assert.doesNotMatch(docTreeSource, /renameSignal/);
  assert.doesNotMatch(nodeSource, /<input/);
});

test("重命名失败与非法名字保留输入态而非静默丢弃", async () => {
  const docTreeSource = await readFile(new URL("./DocTree.tsx", import.meta.url), "utf8");

  // 校验不过 → 会话保留 + 行内 error；后端失败 → pending 复位 + error，会话仍保留。
  assert.match(docTreeSource, /error: invalid, pending: false/);
  assert.match(docTreeSource, /outcome\.error \?\? "重命名失败", pending: false/);
  // 文件夹改名后展开态跟随迁移（否则整棵子树莫名收起）。
  assert.match(docTreeSource, /remapExpandedPaths\(prev, outcome\.oldPath, outcome\.newPath/);
});

test("文件树节点提供打开文件位置的右键菜单", async () => {
  const source = await readFile(new URL("./TreeNode.tsx", import.meta.url), "utf8");

  assert.match(source, /onContextMenu=\{openContextMenu\}/);
  assert.match(source, /打开文件位置/);
  assert.match(source, /onOpenLocation\(node\.path\)/);
});

test("文件树接入卡片外侧的通用侧栏拖拽手柄", async () => {
  const source = await readFile(new URL("./DocTree.tsx", import.meta.url), "utf8");

  assert.match(source, /<ResizableSidePanel ariaLabel="调整文件树宽度">/);
  assert.doesNotMatch(source, /absolute right-0/);
});

test("文件树删除使用应用内确认弹窗，避免系统确认框和提示音", async () => {
  const source = await readFile(new URL("./DocTree.tsx", import.meta.url), "utf8");
  const confirmSource = await readFile(new URL("./deleteConfirmation.ts", import.meta.url), "utf8");

  assert.match(source, /DeleteConfirmDialog/);
  assert.doesNotMatch(source, /requestDeleteConfirmation/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.doesNotMatch(confirmSource, /plugin-dialog/);
});
