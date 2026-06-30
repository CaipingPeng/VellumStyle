import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("正文素材库选择弹窗读取永久图片素材并插入所选素材 URL", async () => {
  const source = await readFile(new URL("./ImageMaterialPickerDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /listImageMaterials/);
  assert.match(source, /MATERIAL_PAGE_SIZE/);
  assert.match(source, /onPick\(item\.url\)/);
  assert.match(source, /toProxyImageUrl\(item\.url\)/);
  assert.match(source, /加载更多/);
  assert.match(source, /onNeedSettings/);
});
