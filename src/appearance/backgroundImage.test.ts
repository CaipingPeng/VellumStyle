import assert from "node:assert/strict";
import {test} from "node:test";
import {
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_STATUS_BAR_OPACITY,
  MAX_BACKGROUND_BLUR,
  applyBackgroundImage,
  readPersistedBackgroundImage,
  sanitizeBackgroundBlur,
  sanitizeBackgroundImagePath,
  sanitizeStatusBarOpacity,
} from "./backgroundImage.ts";

test("背景图路径只接受非空字符串", () => {
  assert.equal(sanitizeBackgroundImagePath("C:\\a\\b.png"), "C:\\a\\b.png");
  assert.equal(sanitizeBackgroundImagePath("  "), null);
  assert.equal(sanitizeBackgroundImagePath(undefined), null);
  assert.equal(sanitizeBackgroundImagePath(123), null);
});

test("背景模糊值会被夹在 0 与上限之间", () => {
  assert.equal(sanitizeBackgroundBlur(0), 0);
  assert.equal(sanitizeBackgroundBlur(DEFAULT_BACKGROUND_BLUR), DEFAULT_BACKGROUND_BLUR);
  assert.equal(sanitizeBackgroundBlur(MAX_BACKGROUND_BLUR + 10), MAX_BACKGROUND_BLUR);
  assert.equal(sanitizeBackgroundBlur(-1), 0);
  assert.equal(sanitizeBackgroundBlur("10"), DEFAULT_BACKGROUND_BLUR);
  assert.equal(sanitizeBackgroundBlur(Number.NaN), DEFAULT_BACKGROUND_BLUR);
});

test("状态栏透明度会被夹在 0 与 1 之间", () => {
  assert.equal(sanitizeStatusBarOpacity(0), 0);
  assert.equal(sanitizeStatusBarOpacity(DEFAULT_STATUS_BAR_OPACITY), DEFAULT_STATUS_BAR_OPACITY);
  assert.equal(sanitizeStatusBarOpacity(2), 1);
  assert.equal(sanitizeStatusBarOpacity(-0.5), 0);
  assert.equal(sanitizeStatusBarOpacity("0.5"), DEFAULT_STATUS_BAR_OPACITY);
  assert.equal(sanitizeStatusBarOpacity(Number.NaN), DEFAULT_STATUS_BAR_OPACITY);
});

test("背景图可从 Zustand 持久化数据安全预读", () => {
  const storage = {
    getItem: (key: string) => key === "vellumstyle"
      ? JSON.stringify({state: {backgroundImagePath: "C:\\bg.png", backgroundBlur: 16}, version: 0})
      : null,
  };
  assert.deepEqual(readPersistedBackgroundImage(storage), {
    path: "C:\\bg.png",
    blur: 16,
  });
  assert.deepEqual(readPersistedBackgroundImage({getItem: () => "broken"}), {
    path: null,
    blur: DEFAULT_BACKGROUND_BLUR,
  });
  assert.deepEqual(readPersistedBackgroundImage({getItem: () => null}), {
    path: null,
    blur: DEFAULT_BACKGROUND_BLUR,
  });
});

test("应用背景图会写入 CSS 变量并切换 has-app-bg，无图时模糊置 0", () => {
  const properties = new Map<string, string>();
  const toggled: Array<[string, boolean | undefined]> = [];
  const root = {
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
    },
    classList: {
      toggle: (name: string, force?: boolean) => toggled.push([name, force]),
    },
  };
  // 非 Tauri 环境：路径不生效，但变量仍写入 none/0px，类不挂
  applyBackgroundImage("C:\\bg.png", 12, root);
  assert.equal(properties.get("--app-bg-image"), "none");
  assert.equal(properties.get("--app-bg-blur"), "0px");
  assert.deepEqual(toggled, [["has-app-bg", false]]);

  properties.clear();
  toggled.length = 0;
  applyBackgroundImage(null, 12, root);
  assert.equal(properties.get("--app-bg-image"), "none");
  assert.equal(properties.get("--app-bg-blur"), "0px");
  assert.deepEqual(toggled, [["has-app-bg", false]]);
});
