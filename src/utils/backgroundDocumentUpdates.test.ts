import assert from "node:assert/strict";
import {test} from "node:test";
import {
  cancelBackgroundDocumentTargets,
  createBackgroundDocumentTarget,
  releaseBackgroundDocumentTarget,
  registerBackgroundDocumentUpdater,
  remapBackgroundDocumentTargets,
  runBackgroundDocumentMutation,
  updateDocumentInBackground,
} from "./backgroundDocumentUpdates.ts";

test("independent background tasks serialize updates to the same latest document content", async () => {
  let content = "start";
  let active = 0;
  let maxActive = 0;
  const unregister = registerBackgroundDocumentUpdater(async (_path, transform) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const snapshot = content;
    await new Promise((resolve) => setTimeout(resolve, 0));
    content = transform(snapshot);
    active -= 1;
    return true;
  });
  const first = createBackgroundDocumentTarget("article.md");
  const second = createBackgroundDocumentTarget("article.md");

  try {
    await Promise.all([
      updateDocumentInBackground(first, (value) => `${value}-first`),
      updateDocumentInBackground(second, (value) => `${value}-second`),
    ]);
    assert.equal(maxActive, 1);
    assert.equal(content, "start-first-second");
  } finally {
    releaseBackgroundDocumentTarget(first);
    releaseBackgroundDocumentTarget(second);
    unregister();
  }
});

test("renames remap active targets atomically and deletes cancel future writes", async () => {
  const updatedPaths: string[] = [];
  const unregister = registerBackgroundDocumentUpdater(async (path) => {
    updatedPaths.push(path);
    return true;
  });
  const renamed = createBackgroundDocumentTarget("drafts/old.md");
  const deleted = createBackgroundDocumentTarget("trash/deleted.md");

  try {
    await runBackgroundDocumentMutation(
      async () => "published/new.md",
      (nextPath) => remapBackgroundDocumentTargets("drafts/old.md", nextPath),
    );
    await updateDocumentInBackground(renamed, (value) => value);
    cancelBackgroundDocumentTargets("trash");
    const deletedResult = await updateDocumentInBackground(deleted, (value) => `${value}!`);

    assert.deepEqual(updatedPaths, ["published/new.md"]);
    assert.equal(deletedResult, false);
  } finally {
    releaseBackgroundDocumentTarget(renamed);
    releaseBackgroundDocumentTarget(deleted);
    unregister();
  }
});
