import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const storeSource = readFile(new URL("./index.ts", import.meta.url), "utf8");

test("自动云同步等待三分钟静默期", async () => {
  const source = await storeSource;
  assert.match(source, /export const CLOUD_SYNC_DELAY_MS = 3 \* 60 \* 1000/);
  assert.match(source, /scheduleCloudSync\(delayMs = CLOUD_SYNC_DELAY_MS\)/);
  assert.match(source, /state\.syncStatus === "synced" \|\| state\.syncStatus === "disabled"/);
  assert.match(source, /syncStatus: "idle", syncMessage: ""/);
});

test("主动同步先完成本地保存再刷新云端", async () => {
  const source = await storeSource;
  assert.match(source, /runSyncNow: async \(\) => \{\s*\/\/[^\n]*\n\s*await flushSave\(\);\s*await flushCloudSync\(\);/);
});
