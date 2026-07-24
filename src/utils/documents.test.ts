import {test} from "node:test";
import assert from "node:assert/strict";
import {
  ancestorDirsForPath,
  createDocument,
  createFolder,
  deleteEntry,
  listDocuments,
  openEntryLocation,
  readDocumentThemeMap,
  readDocument,
  writeDocumentThemeMap,
  writeDocument,
} from "./documents.ts";

test("非 Tauri 环境下返回可调试的示例文档树和内容", async () => {
  const tree = await listDocuments();

  assert.ok(tree.length >= 1);
  assert.equal(tree[0].isDir, false);
  assert.match(tree[0].name, /\.md$/);

  const content = await readDocument(tree[0].path);
  assert.match(content, /文澜排版/);
});

test("非 Tauri 环境下文档 fallback 支持创建和写入", async () => {
  const path = await createDocument("", "Web 调试草稿");

  await writeDocument(path, "# Web 调试草稿\n\n正文");

  assert.equal(await readDocument(path), "# Web 调试草稿\n\n正文");
  assert.ok((await listDocuments()).some((node) => node.path === path));
});

test("非 Tauri 环境下主题元数据单独保存且不出现在文档树", async () => {
  await writeDocumentThemeMap({"主题元数据测试.md": "ink"});

  const metadata = await readDocumentThemeMap();
  assert.deepEqual(metadata, {exists: true, map: {"主题元数据测试.md": "ink"}});
  assert.ok(!(await listDocuments()).some((node) => node.path === ".vellumstyle-theme-map.json"));
});

test("ancestorDirsForPath 返回文档路径中需要展开的父级目录", () => {
  assert.deepEqual(ancestorDirsForPath("项目/子目录/文章.md"), ["项目", "项目/子目录"]);
  assert.deepEqual(ancestorDirsForPath("根目录文章.md"), []);
  assert.deepEqual(ancestorDirsForPath(null), []);
});

test("非 Tauri 环境下打开文件位置给出明确错误", async () => {
  await assert.rejects(openEntryLocation("示例.md"), /Web 调试模式无法打开本地文件位置/);
});

test("非 Tauri 环境下非空文件夹必须显式递归删除", async () => {
  const folder = await createFolder("", "删除确认测试");
  await createDocument(folder, "子文档");

  await assert.rejects(deleteEntry(folder), /文件夹非空/);

  await deleteEntry(folder, {recursive: true});

  assert.ok(!(await listDocuments()).some((node) => node.path === folder));
});
