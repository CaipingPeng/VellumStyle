import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("正文图片入口只负责本地上传，素材库使用独立的全局入口", async () => {
  const source = await readFile(new URL("./UploadButton.tsx", import.meta.url), "utf8");

  assert.match(source, /title=\{picking \? "选择图片中…" : "上传图片"\}/);
  assert.match(source, /void onPickLocal\(selected\)/);
  assert.doesNotMatch(source, /await onPickLocal\(selected\)/);
  assert.doesNotMatch(source, /从素材库选择/);
  assert.doesNotMatch(source, /onOpenMaterialLibrary/);
});
