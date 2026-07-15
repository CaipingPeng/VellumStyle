import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const source = readFileSync(new URL("./StylePanel.tsx", import.meta.url), "utf-8");
const controlsSource = readFileSync(new URL("./controls.tsx", import.meta.url), "utf-8");
const labelsSource = readFileSync(new URL("./styleLabels.ts", import.meta.url), "utf-8");

test("属性面板把文字参数组织为平衡网格", () => {
  assert.match(source, /TYPOGRAPHY_STYLE_IDS/);
  assert.match(source, /TYPOGRAPHY_ORDER/);
  assert.match(source, /"fontSize", "lineHeight", "letterSpacing"/);
  assert.match(source, />文字</);
  assert.match(source, /grid-cols-6/);
  assert.match(source, /col-span-2/);
  assert.match(source, /col-span-3/);
});

test("四向外边距和内边距使用上右下左四列布局", () => {
  assert.match(source, /DIRECTION_ORDER/);
  assert.match(source, /"marginTop", "marginRight", "marginBottom", "marginLeft"/);
  assert.match(source, /"paddingTop", "paddingRight", "paddingBottom", "paddingLeft"/);
  assert.match(source, /grid-cols-4/);
  assert.match(source, /renderDirectionalRow\("外边距"/);
  assert.match(source, /renderDirectionalRow\("内边距"/);
});

test("简写 margin 和 padding 仍归入间距分组", () => {
  assert.match(source, /SPACING_STYLE_IDS/);
  assert.match(source, /"margin", "padding"/);
  assert.match(labelsSource, /margin: "外边距"/);
  assert.match(labelsSource, /padding: "内边距"/);
});

test("宽字段和未知字段有安全的整行回退", () => {
  assert.match(source, /col-span-6/);
  assert.match(source, />其他属性</);
  assert.match(source, /handleStyleChange\(path, value\)/);
  assert.doesNotMatch(source, /styleLayout\.ts/);
});

test("紧凑数值控件为窄网格减少横向占用", () => {
  assert.match(controlsSource, /compact\?: boolean/);
  assert.match(controlsSource, /compact \? "px-1\.5" : "px-2"/);
  assert.match(controlsSource, /compact \? "min-w-7 px-1" : "min-w-9 px-2"/);
});

test("属性面板默认采用更紧凑的密度", () => {
  assert.match(source, /w-\[clamp\(420px,31vw,480px\)\]/);
  assert.match(source, /border-b border-border px-3 py-2\.5/);
  assert.match(source, /mb-2 text-xs font-semibold text-text/);
  assert.match(source, /grid grid-cols-6 gap-x-2 gap-y-2/);
  assert.match(source, /space-y-2\.5/);
  assert.match(controlsSource, /h-\[26px\]/);
});
