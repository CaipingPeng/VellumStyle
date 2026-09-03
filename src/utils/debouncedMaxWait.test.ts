import assert from "node:assert/strict";
import test from "node:test";
import {createDebouncedMaxWaitScheduler} from "./debouncedMaxWait.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("停顿后执行最新值", async () => {
  const values: string[] = [];
  const scheduler = createDebouncedMaxWaitScheduler((value: string) => values.push(value), 20, 80);
  scheduler.schedule("a");
  await wait(8);
  scheduler.schedule("b");
  await wait(30);
  assert.deepEqual(values, ["b"]);
});

test("持续调度时不会超过最大等待时间", async () => {
  const values: number[] = [];
  const scheduler = createDebouncedMaxWaitScheduler((value: number) => values.push(value), 200, 65);
  for (let value = 1; value <= 3; value++) {
    scheduler.schedule(value);
    await wait(16);
  }
  await wait(35);
  assert.equal(values.length, 1);
  assert.ok(values[0] >= 1 && values[0] <= 3);
  scheduler.cancel();
});

test("flush 立即执行而 cancel 丢弃待执行值", async () => {
  const values: string[] = [];
  const scheduler = createDebouncedMaxWaitScheduler((value: string) => values.push(value), 20, 60);
  scheduler.schedule("flush");
  scheduler.flush();
  scheduler.schedule("cancel");
  scheduler.cancel();
  await wait(70);
  assert.deepEqual(values, ["flush"]);
});
