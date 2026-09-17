import assert from "node:assert/strict";
import {test} from "node:test";
import {
  entryBasename,
  entryExtension,
  entryStem,
  findSiblingConflict,
  findSiblingNameConflict,
  findTreeNode,
  replaceTreePaths,
  siblingPathsFor,
  treePathAncestors,
  validateEntryName,
  type DocNode,
} from "../../utils/documents.ts";
import {remapExpandedPaths} from "./pathRemap.ts";
import {isUnchangedRename, renameInitialValue} from "./renameSession.ts";

test("重命名根据路径拆分一次扩展名，文件夹的点号不参与拆分", () => {
  const doc = {path: "资料/周报.v2.md", isDir: false};
  assert.equal(renameInitialValue(doc), "周报.v2");
  assert.equal(isUnchangedRename(doc, "周报"), false);
  assert.equal(isUnchangedRename(doc, "周报.v2"), true);
  assert.equal(isUnchangedRename(doc, "周报.v2.md"), true);
  const folder = {path: "资料.v2", isDir: true};
  assert.equal(renameInitialValue(folder), "资料.v2");
  assert.equal(isUnchangedRename(folder, "资料"), false);
});

const TREE: DocNode[] = [
  {
    name: "素材",
    path: "素材",
    isDir: true,
    children: [
      {name: "图片.md", path: "素材/图片.md", isDir: false, children: []},
      {
        name: "内层",
        path: "素材/内层",
        isDir: true,
        children: [{name: "深.md", path: "素材/内层/深.md", isDir: false, children: []}],
      },
    ],
  },
  {name: "草稿.md", path: "草稿.md", isDir: false, children: []},
];

test("文件名拆分：主名与扩展名", () => {
  assert.equal(entryStem("草稿.md"), "草稿");
  assert.equal(entryExtension("草稿.md"), ".md");
  assert.equal(entryStem("周报.v2.md"), "周报.v2");
  assert.equal(entryExtension("周报.v2.md"), ".md");
  // 隐藏式命名整段都是主名，不会把 .md 当扩展名切出去
  assert.equal(entryStem(".md"), ".md");
  assert.equal(entryExtension(".md"), "");
  assert.equal(entryStem("素材"), "素材");
  assert.equal(entryExtension("素材"), "");
});

test("名称校验覆盖非法字符、结尾点空格与系统保留名", () => {
  assert.equal(validateEntryName("草稿.md"), null);
  assert.equal(validateEntryName("2026-周报_v1.md"), null);
  // 结尾空格/点号会被系统静默吞掉，直接给出原因而不是悄悄改名
  assert.equal(validateEntryName("周报."), "名称不能以点号结尾");
  assert.equal(validateEntryName("周报 "), "名称不能以空格结尾");
  // 首尾空格：明确提示落盘时会去掉，而不是静默 trim
  assert.equal(validateEntryName(" 周报.md"), "保存时会去掉首尾空格：周报.md");
  assert.equal(validateEntryName("a/b.md"), "名称不能包含 /");
  assert.equal(validateEntryName("a\\b.md"), "名称不能包含 \\");
  assert.equal(validateEntryName("a:b.md"), "名称不能包含 :");
  assert.equal(validateEntryName("  "), "名称不能以空格结尾");
  assert.equal(validateEntryName(""), "名称不能为空");
  assert.equal(validateEntryName("CON.md"), "CON 是系统保留名");
  assert.equal(validateEntryName("lpt9"), "lpt9 是系统保留名");
  assert.equal(validateEntryName("CONSOLE.md"), null);
  assert.equal(validateEntryName("COM10.md"), null);
  assert.equal(validateEntryName("v1.0 周报.md"), null);
  // 保持原名不算冲突（纯大小写改名也要放行）
  assert.equal(validateEntryName("草稿.md", "草稿.md"), null);
});

test("同级重名检测忽略自身、按大小写不敏感比较", () => {
  const siblings = siblingPathsFor(TREE, "素材");
  assert.deepEqual(siblings, ["素材/图片.md", "素材/内层"]);
  assert.equal(findSiblingNameConflict(siblings, "图片.md", "素材/图片.md"), null);
  assert.equal(findSiblingNameConflict(siblings, "内层", "素材/图片.md"), "内层");
  assert.equal(findSiblingNameConflict(siblings, "DRAFT.md", "素材/图片.md"), null);
  // 根级：同级就是树的顶层
  assert.equal(findSiblingNameConflict(siblingPathsFor(TREE, ""), "草稿.md", "素材"), "草稿.md");
});

test("文件节点同时按“输入名”和“落盘名”查冲突", () => {
  const root = siblingPathsFor(TREE, "");
  // 输入“草稿”会落盘成 草稿.md，但被改名项自身要豁免，不能自己撞自己
  assert.equal(findSiblingConflict(root, ["草稿", "草稿.md"], "草稿.md"), null);
  // 输入“素材”时，同级文件夹“素材”命中的是输入名本身（树里完全同名）
  assert.equal(findSiblingConflict(root, ["素材", "素材.md"], "草稿.md"), "素材");
  // 输入“图片”时，同级文档“图片.md”命中的是落盘名
  assert.equal(findSiblingConflict(["图片.md", "素材"], ["图片", "图片.md"], "草稿.md"), "图片.md");
  assert.equal(findSiblingConflict(["图片.md", "素材"], ["周报", "周报.md"], "草稿.md"), null);
});

test("路径工具：祖先目录与末段名", () => {
  assert.deepEqual(treePathAncestors("素材/内层/深.md"), ["素材", "素材/内层"]);
  assert.deepEqual(treePathAncestors("草稿.md"), []);
  assert.equal(entryBasename("素材/内层/深.md"), "深.md");
  assert.equal(entryBasename("草稿.md"), "草稿.md");
  assert.equal(findTreeNode(TREE, "素材/内层/深.md")?.name, "深.md");
  assert.equal(findTreeNode(TREE, "不存在.md"), null);
});

test("乐观替换把整棵子树重映射到新路径", () => {
  const renamed = replaceTreePaths(TREE, "素材", "素材库");
  const dir = findTreeNode(renamed, "素材库");
  assert.ok(dir?.isDir);
  assert.equal(dir.name, "素材库");
  assert.deepEqual(dir.children.map((child) => child.path), ["素材库/图片.md", "素材库/内层"]);
  assert.equal(findTreeNode(renamed, "素材库/内层/深.md")?.name, "深.md");
  assert.equal(findTreeNode(renamed, "素材"), null);
  // 文件改名只动自身
  const fileRenamed = replaceTreePaths(TREE, "草稿.md", "新草稿.md");
  assert.equal(findTreeNode(fileRenamed, "新草稿.md")?.name, "新草稿.md");
  assert.equal(findTreeNode(fileRenamed, "草稿.md"), null);
});

test("展开态跟随文件夹改名迁移，并保留原名未命中的键", () => {
  const expanded = new Set(["素材", "素材/内层", "其他"]);
  const next = remapExpandedPaths(expanded, "素材", "素材库", treePathAncestors("素材库/内层"));
  assert.deepEqual([...next].sort(), ["其他", "素材库", "素材库/内层"].sort());
});
