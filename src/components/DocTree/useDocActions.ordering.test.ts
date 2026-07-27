import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

test("文档路径变更在串行队列内最终保存，并在刷新目录树前切换编辑目标", async () => {
  const source = await readFile(new URL("./useDocActions.ts", import.meta.url), "utf8");

  for (const mutation of ["renameEntry", "deleteEntry", "moveEntry"]) {
    const mutationPosition = source.indexOf(`return ${mutation}(`);
    assert.ok(mutationPosition >= 0, `缺少 ${mutation} 文件操作`);
    const queueStart = source.lastIndexOf("runBackgroundDocumentMutation(", mutationPosition);
    const finalSave = source.lastIndexOf("await flushSave();", mutationPosition);
    assert.ok(queueStart >= 0 && finalSave > queueStart, `${mutation} 必须在后台写回队列内最终保存`);
  }

  const renamePathUpdate = source.indexOf("state.setCurrentDocPath(nextCurrentPath)");
  const renameTreeRefresh = source.indexOf("await loadTree();", renamePathUpdate);
  assert.ok(renamePathUpdate >= 0 && renameTreeRefresh > renamePathUpdate);

  const deletePathClear = source.indexOf("state.setCurrentDocPath(null)");
  const deleteTreeRefresh = source.indexOf("await loadTree();", deletePathClear);
  assert.ok(deletePathClear >= 0 && deleteTreeRefresh > deletePathClear);
});
