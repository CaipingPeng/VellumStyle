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

test("发布弹窗封面预览和候选图按公众号默认横图比例展示", async () => {
  const source = await readFile(new URL("./PublishDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /aspect-\[2\.35\/1\]/);
  assert.match(source, /WebkitLineClamp: 2/);
  assert.match(source, /title\.trim\(\) \|\| "未命名标题"/);
});

test("发布弹窗评论开关的打开和关闭使用不同图标", async () => {
  const source = await readFile(new URL("./PublishDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /MessageCircleOff/);
  assert.match(source, /<MessageCircleOff size=\{15\} \/>[\s\S]*关闭/);
  assert.match(source, /<MessageCircle size=\{15\} \/>[\s\S]*打开/);
});
