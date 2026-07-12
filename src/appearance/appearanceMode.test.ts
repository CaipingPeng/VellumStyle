import assert from "node:assert/strict";
import {test} from "node:test";
import {
  DEFAULT_APPEARANCE_MODE,
  applyAppearanceMode,
  readPersistedAppearanceMode,
  sanitizeAppearanceMode,
} from "./appearanceMode.ts";

test("外观模式只接受 light 与 dark", () => {
  assert.equal(DEFAULT_APPEARANCE_MODE, "light");
  assert.equal(sanitizeAppearanceMode("dark"), "dark");
  assert.equal(sanitizeAppearanceMode("light"), "light");
  assert.equal(sanitizeAppearanceMode("system"), "light");
  assert.equal(sanitizeAppearanceMode(undefined), "light");
});

test("外观模式可从 Zustand 持久化数据安全预读", () => {
  const storage = {
    getItem: (key: string) => key === "vellumstyle"
      ? JSON.stringify({state: {appearanceMode: "dark"}, version: 0})
      : null,
  };
  assert.equal(readPersistedAppearanceMode(storage), "dark");
  assert.equal(readPersistedAppearanceMode({getItem: () => "broken"}), "light");
});

test("应用外观模式会同步根属性与原生配色", () => {
  const attributes = new Map<string, string>();
  const root = {
    style: {colorScheme: ""},
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  applyAppearanceMode("dark", root);
  assert.equal(attributes.get("data-appearance"), "dark");
  assert.equal(root.style.colorScheme, "dark");
});
