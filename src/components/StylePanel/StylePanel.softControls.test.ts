import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const controlsSource = readFileSync(new URL("./controls.tsx", import.meta.url), "utf-8");
const panelSource = readFileSync(new URL("./StylePanel.tsx", import.meta.url), "utf-8");

test("属性面板表单控件使用无边框填充面而不是内嵌硬边", () => {
  assert.match(controlsSource, /appearance-none[^\n]*border-0[^\n]*bg-bg-tertiary[^\n]*shadow-none/);
  assert.match(controlsSource, /focus-visible:bg-bg[^\n]*focus-visible:ring-2/);
  assert.match(controlsSource, /focus-within:bg-bg[^\n]*focus-within:ring-2/);
  assert.doesNotMatch(controlsSource, /focus-visible:border-accent|focus-within:border-accent/);
  assert.doesNotMatch(controlsSource, /border-l border-border/);
});

test("颜色、切换和多行控件不再带原生凹陷边框或阴影", () => {
  assert.match(controlsSource, /type="color"[\s\S]*?appearance-none[^\n]*border-0/);
  assert.match(controlsSource, /webkit-color-swatch[^\n]*border-0/);
  assert.match(controlsSource, /cursor-pointer appearance-none rounded-sm border-0[^\n]*shadow-none/);
  assert.match(controlsSource, /w-full appearance-none resize-y rounded-sm border-0/);
  assert.doesNotMatch(controlsSource, /shadow-sm/);
});

test("模式切换和主操作按钮也移除凸起边框", () => {
  assert.match(panelSource, /modeButtonClass[\s\S]*?appearance-none[^\n]*border-0[^\n]*shadow-none/);
  assert.match(panelSource, /应用临时修改[\s\S]*?保存到主题文件/);
  assert.match(panelSource, /inline-flex h-7[^\n]*appearance-none[^\n]*border-0[^\n]*shadow-none/);
  assert.doesNotMatch(panelSource, /bg-bg text-text shadow-sm cursor-default/);
  assert.doesNotMatch(panelSource, /border border-accent bg-accent/);
});
