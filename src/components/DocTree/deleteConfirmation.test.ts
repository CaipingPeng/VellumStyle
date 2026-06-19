import {test} from "node:test";
import assert from "node:assert/strict";
import {getDeleteConfirmationMessage} from "./deleteConfirmation.ts";
import type {DocNode} from "../../utils/documents.ts";

function doc(path: string): DocNode {
  return {name: path, path, isDir: false, children: []};
}

test("非空文件夹删除提示会明确提醒递归删除风险", () => {
  const node: DocNode = {
    name: "素材",
    path: "素材",
    isDir: true,
    children: [doc("素材/封面.md")],
  };

  assert.match(getDeleteConfirmationMessage(node), /将同时删除其中的 1 个子项/);
  assert.match(getDeleteConfirmationMessage(node), /此操作不可撤销/);
});

test("普通文件沿用简洁删除提示", () => {
  assert.equal(getDeleteConfirmationMessage(doc("文章.md")), "确定删除“文章.md”？");
});
