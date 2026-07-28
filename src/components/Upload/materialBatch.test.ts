import assert from "node:assert/strict";
import test from "node:test";
import {runMaterialOperations} from "./materialBatch.ts";

test("素材批处理限制并发并按原顺序保留部分失败结果", async () => {
  let active = 0;
  let maximumActive = 0;
  const progress: number[] = [];
  const results = await runMaterialOperations(
    [1, 2, 3, 4, 5],
    2,
    async (item) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      if (item === 3) throw new Error("failed");
    },
    (completed) => progress.push(completed),
  );

  assert.equal(maximumActive, 2);
  assert.deepEqual(results.map((result) => result.item), [1, 2, 3, 4, 5]);
  assert.equal(results[2].error instanceof Error, true);
  assert.deepEqual(progress, [1, 2, 3, 4, 5]);
});
