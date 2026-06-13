import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("发布弹窗提供从永久素材库选择封面的入口", async () => {
  const source = await readFile(new URL("./PublishDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /listImageMaterials/);
  assert.match(source, /素材库/);
  assert.match(source, /pickMaterialThumb/);
  assert.match(source, /selectedMaterialId/);
});
