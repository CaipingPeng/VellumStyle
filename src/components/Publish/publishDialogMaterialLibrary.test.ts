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

test("发布弹窗打开时只触发一次素材库初始化加载", async () => {
  const source = await readFile(new URL("./PublishDialog.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\}, \[open, defaultTitle, loadMaterialLibrary\]\);/);
});

test("发布弹窗素材库初始加载不渲染多个旋转占位图标", async () => {
  const source = await readFile(new URL("./PublishDialog.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /Array\.from\(\{length: 6\}\)[\s\S]*<Loader2 size=\{18\} className="animate-spin" \/>/);
  assert.match(source, /animate-pulse/);
});

test("发布弹窗素材库高度由左侧表单容器约束", async () => {
  const source = await readFile(new URL("./PublishDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /leftPanelRef/);
  assert.match(source, /materialPanelHeight/);
  assert.match(source, /leftPanelRef\.current\.getBoundingClientRect\(\)\.height/);
  assert.match(source, /style=\{\{height: materialPanelHeight/);
  assert.match(source, /setTimeout\(updateMaterialPanelHeight, 180\)/);
  assert.match(source, /box-border[\s\S]*style=\{\{height: materialPanelHeight/);
  assert.doesNotMatch(source, /coverBottom - panelTop/);
});

test("发布弹窗素材库图片网格使用稳定行高并重置按钮图片默认布局", async () => {
  const source = await readFile(new URL("./PublishDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /min-h-0 flex-1 overflow-y-auto overflow-x-hidden/);
  assert.match(source, /\[scrollbar-gutter:stable_both-edges\]/);
  assert.match(source, /grid auto-rows-max grid-cols-2 gap-2 content-start/);
  assert.match(source, /className=\{`group relative block aspect-\[2\.35\/1\] w-full/);
  assert.match(source, /appearance-none/);
  assert.match(source, / p-0 /);
  assert.match(source, /className="block h-full w-full object-cover/);
});
