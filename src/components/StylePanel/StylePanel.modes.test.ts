import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const source = readFileSync(new URL("./StylePanel.tsx", import.meta.url), "utf-8");
const loaderSource = readFileSync(new URL("../../themes/loader.ts", import.meta.url), "utf-8");

test("样式面板提供临时修改和永久修改两种模式", () => {
  assert.match(source, /type StyleEditMode = "temporary" \| "permanent"/);
  assert.match(source, /临时修改/);
  assert.match(source, /永久修改/);
  assert.match(source, /应用临时修改/);
  assert.match(source, /保存到主题文件/);
});

test("永久修改保存时写回当前主题文件", () => {
  assert.match(loaderSource, /export async function saveUserTheme/);
  assert.match(loaderSource, /invoke\("save_user_theme"/);
  assert.match(source, /saveUserTheme/);
  assert.match(source, /JSON\.stringify\(theme\.model\)/);
});

test("用户主题同 id 时覆盖内置主题以支持永久修改回读", () => {
  assert.match(loaderSource, /const userById = new Map/);
  assert.match(loaderSource, /userById\.get\(theme\.id\) \?\? theme/);
  assert.match(loaderSource, /user\.filter\(\(theme\) => !builtinIds\.has\(theme\.id\)\)/);
  assert.doesNotMatch(loaderSource, /\.filter\(\(u\) => !builtinIds\.has\(u\.id\)/);
});

test("样式面板使用视口固定右侧抽屉，避免被父级 flex 裁切", () => {
  assert.match(source, /className=\{`fixed right-2 top-\[60px\] bottom-9 z-\[70\]/);
  assert.match(source, /w-\[min\(392px,calc\(100vw-12px\)\)\]/);
  assert.match(source, /max-w-\[calc\(100vw-12px\)\]/);
  assert.doesNotMatch(source, /animate=\{\{width: isOpen \? 280 : 0\}\}/);
});
