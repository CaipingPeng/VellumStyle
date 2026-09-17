import assert from "node:assert/strict";
import test from "node:test";
import {createDebouncedMaxWaitScheduler} from "./debouncedMaxWait.ts";

test("停顿后执行最新值", (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const values: string[] = [];
  const scheduler = createDebouncedMaxWaitScheduler((value: string) => values.push(value), 20, 80);
  scheduler.schedule("a");
  t.mock.timers.tick(8);
  scheduler.schedule("b");
  t.mock.timers.tick(19);
  assert.deepEqual(values, []);
  t.mock.timers.tick(1);
  assert.deepEqual(values, ["b"]);
});

test("持续调度时不会超过最大等待时间", (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const values: number[] = [];
  const scheduler = createDebouncedMaxWaitScheduler((value: number) => values.push(value), 200, 65);
  for (let value = 1; value <= 3; value++) {
    scheduler.schedule(value);
    t.mock.timers.tick(16);
  }
  t.mock.timers.tick(16);
  assert.deepEqual(values, []);
  t.mock.timers.tick(1);
  assert.deepEqual(values, [3]);
  t.mock.timers.tick(200);
  assert.deepEqual(values, [3], "最大等待触发后不能再执行残留的防抖定时器");
  scheduler.cancel();
});

test("flush 立即执行而 cancel 丢弃待执行值", (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const values: string[] = [];
  const scheduler = createDebouncedMaxWaitScheduler((value: string) => values.push(value), 20, 60);
  scheduler.schedule("flush");
  scheduler.flush();
  scheduler.schedule("cancel");
  scheduler.cancel();
  t.mock.timers.tick(70);
  assert.deepEqual(values, ["flush"]);
});
