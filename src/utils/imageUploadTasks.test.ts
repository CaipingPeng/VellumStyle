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

test("completed article tasks expire from the in-memory log", () => {
  const taskId = imageUploadTasks.start("cover.png", "封面图片", {
    documentPath: "专题/文章.md",
    documentTitle: "文章.md",
  });
  imageUploadTasks.complete(taskId);

  const completed = imageUploadTasks.getSnapshot().find((task) => task.id === taskId);
  assert.equal(completed?.documentPath, "专题/文章.md");
  assert.equal(completed?.documentTitle, "文章.md");
  assert.equal(typeof completed?.expiresAt, "number");

  imageUploadTasks.pruneExpired((completed?.expiresAt || 0) + 1);
  assert.equal(imageUploadTasks.getSnapshot().some((task) => task.id === taskId), false);
});

test("multiple tasks remain visible until the last active task has settled", () => {
  imageUploadTasks.clearFinished();
  const first = imageUploadTasks.start("first.jpg", "正文图片");
  const second = imageUploadTasks.start("second.jpg", "正文图片");
  imageUploadTasks.complete(first);

  const firstCompleted = imageUploadTasks.getSnapshot().find((task) => task.id === first);
  imageUploadTasks.pruneExpired((firstCompleted?.expiresAt || 0) + 1);
  assert.equal(imageUploadTasks.getSnapshot().length, 2);

  imageUploadTasks.complete(second);
  const snapshot = imageUploadTasks.getSnapshot();
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot.every((task) => task.status === "success"), true);

  const latestExpiry = Math.max(...snapshot.map((task) => task.expiresAt || 0));
  imageUploadTasks.pruneExpired(latestExpiry + 1);
  assert.equal(imageUploadTasks.getSnapshot().length, 0);
});

test("active and finished task logs follow article and folder renames", () => {
  imageUploadTasks.clearFinished();
  const taskId = imageUploadTasks.start("photo.jpg", "正文图片", {
    documentPath: "drafts/topic/article.md",
    documentTitle: "article.md",
  });

  imageUploadTasks.remapDocumentPaths("drafts", "published");
  const remapped = imageUploadTasks.getSnapshot().find((task) => task.id === taskId);
  assert.equal(remapped?.documentPath, "published/topic/article.md");
  assert.equal(remapped?.documentTitle, "article.md");

  imageUploadTasks.complete(taskId);
  imageUploadTasks.clearFinished();
});
