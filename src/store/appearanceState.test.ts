import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const storeSource = readFile(new URL("./index.ts", import.meta.url), "utf8");

test("store 提供可切换的亮暗外观状态", async () => {
  const source = await storeSource;
  assert.match(source, /appearanceMode: AppearanceMode/);
  assert.match(source, /toggleAppearanceMode: \(\) => void/);
  assert.match(source, /appearanceMode: DEFAULT_APPEARANCE_MODE/);
  assert.match(source, /toggleAppearanceMode: \(\) =>/);
  assert.match(source, /appearanceMode: s\.appearanceMode === "light" \? "dark" : "light"/);
});

test("store 提供可切换的配色方案状态", async () => {
  const source = await storeSource;
  assert.match(source, /colorScheme: ColorSchemeId/);
  assert.match(source, /setColorScheme: \(scheme: ColorSchemeId\) => void/);
  assert.match(source, /colorScheme: DEFAULT_COLOR_SCHEME/);
  assert.match(source, /colorScheme: sanitizeColorScheme\(colorScheme\)/);
});

test("store 提供可持久化的背景图状态", async () => {
  const source = await storeSource;
  assert.match(source, /backgroundImagePath: string \| null/);
  assert.match(source, /backgroundBlur: number/);
  assert.match(source, /statusBarOpacity: number/);
  assert.match(source, /setBackgroundImagePath: \(path: string \| null\) => void/);
  assert.match(source, /setBackgroundBlur: \(blur: number\) => void/);
  assert.match(source, /setStatusBarOpacity: \(opacity: number\) => void/);
  assert.match(source, /backgroundImagePath: null/);
  assert.match(source, /backgroundBlur: DEFAULT_BACKGROUND_BLUR/);
  assert.match(source, /statusBarOpacity: DEFAULT_STATUS_BAR_OPACITY/);
});

test("store 持久化并合法化外观状态", async () => {
  const source = await storeSource;
  const persistence = source.slice(source.indexOf("partialize:"));
  assert.match(persistence, /appearanceMode: s\.appearanceMode/);
  assert.match(persistence, /appearanceMode: sanitizeAppearanceMode\(saved\?\.appearanceMode\)/);
  assert.match(persistence, /colorScheme: s\.colorScheme/);
  assert.match(persistence, /colorScheme: sanitizeColorScheme\(saved\?\.colorScheme\)/);
  assert.match(persistence, /backgroundImagePath: s\.backgroundImagePath/);
  assert.match(persistence, /backgroundBlur: s\.backgroundBlur/);
  assert.match(persistence, /statusBarOpacity: s\.statusBarOpacity/);
  assert.match(persistence, /backgroundImagePath: sanitizeBackgroundImagePath\(saved\?\.backgroundImagePath\)/);
  assert.match(persistence, /backgroundBlur: sanitizeBackgroundBlur\(saved\?\.backgroundBlur\)/);
  assert.match(persistence, /statusBarOpacity: sanitizeStatusBarOpacity\(saved\?\.statusBarOpacity\)/);
});
