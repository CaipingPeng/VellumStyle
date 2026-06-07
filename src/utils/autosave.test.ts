import {test} from "node:test";
import assert from "node:assert/strict";
import {createDebouncedSaver} from "./autosave.ts";

test("停顿后才触发 flush", async () => {
  let saved = "";
  const saver = createDebouncedSaver((text) => {
    saved = text;
  }, 50);
  saver.schedule("a");
  saver.schedule("ab");
  assert.equal(saved, "", "debounce 期间不应保存");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(saved, "ab", "停顿后保存最后值");
});

test("flushNow 立即保存并取消计时", async () => {
  let count = 0;
  let saved = "";
  const saver = createDebouncedSaver((text) => {
    count++;
    saved = text;
  }, 50);
  saver.schedule("x");
  await saver.flushNow();
  assert.equal(saved, "x");
  assert.equal(count, 1);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(count, 1, "flushNow 后原计时不应再触发");
});

test("无 pending 时 flushNow 不保存", async () => {
  let count = 0;
  const saver = createDebouncedSaver(() => {
    count++;
  }, 50);
  await saver.flushNow();
  assert.equal(count, 0);
});
