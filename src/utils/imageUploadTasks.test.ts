import assert from "node:assert/strict";
import {test} from "node:test";
import {imageUploadTasks} from "./imageUploadTasks.ts";

test("image upload tasks track compression sizes and completion", () => {
  imageUploadTasks.clearFinished();
  const taskId = imageUploadTasks.start("large.png", "正文图片");

  imageUploadTasks.progress({
    taskId,
    filename: "large.jpg",
    phase: "uploading",
    originalSize: 24 * 1024 * 1024,
    outputSize: 9 * 1024 * 1024,
  });

  const active = imageUploadTasks.getSnapshot().find((task) => task.id === taskId);
  assert.equal(active?.status, "active");
  assert.equal(active?.phase, "uploading");
  assert.equal(active?.filename, "large.jpg");
  assert.equal(active?.originalSize, 24 * 1024 * 1024);
  assert.equal(active?.outputSize, 9 * 1024 * 1024);

  imageUploadTasks.complete(taskId);
  assert.equal(imageUploadTasks.getSnapshot().find((task) => task.id === taskId)?.status, "success");
  imageUploadTasks.clearFinished();
  assert.equal(imageUploadTasks.getSnapshot().some((task) => task.id === taskId), false);
});

test("image upload tasks retain failures until cleared", () => {
  const taskId = imageUploadTasks.start("broken.png", "封面图片");
  imageUploadTasks.fail(taskId, new Error("压缩失败"));

  const failed = imageUploadTasks.getSnapshot().find((task) => task.id === taskId);
  assert.equal(failed?.status, "error");
  assert.equal(failed?.phase, "failed");
  assert.equal(failed?.error, "压缩失败");

  imageUploadTasks.clearFinished();
});
