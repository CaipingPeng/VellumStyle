import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("正文图片入口使用插入图片菜单承载本地上传和素材库选择", async () => {
  const source = await readFile(new URL("./UploadButton.tsx", import.meta.url), "utf8");

  assert.match(source, /Menu/);
  assert.match(source, /title=\{picking \? "选择图片中…" : "插入图片"\}/);
  assert.match(source, /void onPickLocal\(selected\)/);
  assert.doesNotMatch(source, /await onPickLocal\(selected\)/);
  assert.match(source, /本地上传图片/);
  assert.match(source, /从素材库选择/);
  assert.match(source, /onOpenMaterialLibrary/);
});
