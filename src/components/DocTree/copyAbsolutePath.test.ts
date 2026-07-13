import assert from "node:assert/strict";
import {test} from "node:test";
import {copyAbsolutePath} from "./copyAbsolutePath.ts";

test("获取绝对路径后将原文本写入剪贴板", async () => {
  const requested: string[] = [];
  const copied: string[] = [];

  await copyAbsolutePath(
    "资料/草稿.md",
    async (path) => {
      requested.push(path);
      return "C:\\文澜排版\\documents\\资料\\草稿.md";
    },
    async (text) => {
      copied.push(text);
      return true;
    },
  );

  assert.deepEqual(requested, ["资料/草稿.md"]);
  assert.deepEqual(copied, ["C:\\文澜排版\\documents\\资料\\草稿.md"]);
});

test("剪贴板拒绝写入时报告失败", async () => {
  await assert.rejects(
    copyAbsolutePath("草稿.md", async () => "C:\\草稿.md", async () => false),
    /复制绝对路径失败/,
  );
});

test("获取路径失败时保留原错误", async () => {
  await assert.rejects(
    copyAbsolutePath("草稿.md", async () => {
      throw new Error("条目不存在");
    }),
    /条目不存在/,
  );
});
