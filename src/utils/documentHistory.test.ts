import assert from "node:assert/strict";
import test from "node:test";
import {createLineDiff, listDocumentHistory, recordWebDocumentTransition} from "./documentHistory.ts";

test("行级差异保留行号并区分增删", () => {
  assert.deepEqual(createLineDiff("a\nb\nc", "a\nB\nc\nd"), [
    {type: "same", text: "a", oldLine: 1, newLine: 1},
    {type: "add", text: "B", oldLine: null, newLine: 2},
    {type: "remove", text: "b", oldLine: 2, newLine: null},
    {type: "same", text: "c", oldLine: 3, newLine: 3},
    {type: "add", text: "d", oldLine: null, newLine: 4},
  ]);
});

test("Web 回退记录写入前后版本并跳过重复内容", async () => {
  recordWebDocumentTransition("history-test.md", "旧正文", "新正文");
  recordWebDocumentTransition("history-test.md", "新正文", "新正文");
  const history = await listDocumentHistory("history-test.md");
  assert.deepEqual(history.map((snapshot) => snapshot.content), ["新正文", "旧正文"]);
});
