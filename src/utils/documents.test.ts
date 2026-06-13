import {test} from "node:test";
import assert from "node:assert/strict";
import {ancestorDirsForPath, createDocument, listDocuments, readDocument, writeDocument} from "./documents.ts";

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

test("ancestorDirsForPath 返回文档路径中需要展开的父级目录", () => {
  assert.deepEqual(ancestorDirsForPath("项目/子目录/文章.md"), ["项目", "项目/子目录"]);
  assert.deepEqual(ancestorDirsForPath("根目录文章.md"), []);
  assert.deepEqual(ancestorDirsForPath(null), []);
});
