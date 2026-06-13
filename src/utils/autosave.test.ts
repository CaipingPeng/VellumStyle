import {test} from "node:test";
import assert from "node:assert/strict";
import {createDebouncedSaver} from "./autosave.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

test("停顿后才触发 flush", async () => {
  let saved = "";
  const saver = createDebouncedSaver((text) => {
    saved = text;
  }, 50);
  saver.schedule("a");
  saver.schedule("ab");
  assert.equal(saved, "", "debounce 期间不应保存");
  await wait(80);
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
  await wait(80);
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

test("保存成功时按顺序触发状态回调", async () => {
  const events: string[] = [];
  const saver = createDebouncedSaver(
    () => {
      events.push("save");
    },
    50,
    {
      onScheduled: () => events.push("scheduled"),
      onFlushStart: () => events.push("start"),
      onFlushSuccess: () => events.push("success"),
    },
  );

  saver.schedule("ok");
  await saver.flushNow();

  assert.deepEqual(events, ["scheduled", "start", "save", "success"]);
});

test("保存失败时触发错误回调并向 flushNow 抛出错误", async () => {
  const error = new Error("disk full");
  let observed: unknown = null;
  const saver = createDebouncedSaver(
    () => {
      throw error;
    },
    50,
    {
      onFlushError: (err) => {
        observed = err;
      },
    },
  );

  saver.schedule("bad");

  await assert.rejects(() => saver.flushNow(), /disk full/);
  assert.equal(observed, error);
});

test("保存耗时时继续输入不会开启并发保存，只在当前保存后写最后值", async () => {
  const firstSave = deferred();
  const calls: string[] = [];
  let activeSaves = 0;
  let maxActiveSaves = 0;

  const saver = createDebouncedSaver(async (text) => {
    calls.push(text);
    activeSaves++;
    maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
    try {
      if (text === "first") {
        await firstSave.promise;
      }
    } finally {
      activeSaves--;
    }
  }, 20);

  saver.schedule("first");
  await wait(40);
  saver.schedule("second");
  saver.schedule("third");
  await wait(40);

  assert.deepEqual(calls, ["first"], "当前保存完成前不应启动下一次写入");
  assert.equal(maxActiveSaves, 1, "保存必须串行执行");

  firstSave.resolve();
  await wait(40);

  assert.deepEqual(calls, ["first", "third"], "当前保存完成后应保存最新内容");
  assert.equal(maxActiveSaves, 1);
});

test("保存中继续输入时仍然等防抖停顿结束", async () => {
  const firstSave = deferred();
  const calls: string[] = [];

  const saver = createDebouncedSaver(async (text) => {
    calls.push(text);
    if (text === "a") {
      await firstSave.promise;
    }
  }, 50);

  saver.schedule("a");
  await wait(70);
  saver.schedule("ab");
  firstSave.resolve();
  await wait(20);

  assert.deepEqual(calls, ["a"], "当前保存结束时，新内容还没过防抖期就不应立刻保存");

  await wait(60);

  assert.deepEqual(calls, ["a", "ab"]);
});

test("flushNow 会等待进行中的保存完成，再保存最新 pending", async () => {
  const firstSave = deferred();
  const calls: string[] = [];
  let activeSaves = 0;
  let maxActiveSaves = 0;

  const saver = createDebouncedSaver(async (text) => {
    calls.push(text);
    activeSaves++;
    maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
    try {
      if (text === "a") {
        await firstSave.promise;
      }
    } finally {
      activeSaves--;
    }
  }, 50);

  saver.schedule("a");
  await wait(70);
  saver.schedule("ab");

  let flushed = false;
  const flush = saver.flushNow().then(() => {
    flushed = true;
  });
  await wait(20);

  assert.equal(flushed, false, "flushNow 不应在当前保存完成前结束");
  assert.deepEqual(calls, ["a"], "flushNow 不应并发写 pending 内容");

  firstSave.resolve();
  await flush;

  assert.equal(flushed, true);
  assert.deepEqual(calls, ["a", "ab"]);
  assert.equal(maxActiveSaves, 1, "flushNow 也必须串行保存");
});
