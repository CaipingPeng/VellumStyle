import assert from "node:assert/strict";
import {test} from "node:test";
import {getEntryAbsolutePath} from "./documents.ts";

test("Web 模式拒绝伪造本地绝对路径", async () => {
  await assert.rejects(
    getEntryAbsolutePath("草稿.md"),
    /Web 调试模式无法复制本地绝对路径/,
  );
});
