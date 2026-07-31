import assert from "node:assert/strict";
import {test} from "node:test";
import {
  COLOR_SCHEMES,
  DEFAULT_COLOR_SCHEME,
  applyColorScheme,
  readPersistedColorScheme,
  sanitizeColorScheme,
} from "./colorScheme.ts";

test("配色方案只接受内置 id，其余回退默认", () => {
  assert.equal(DEFAULT_COLOR_SCHEME, "violet");
  assert.equal(sanitizeColorScheme("coral"), "coral");
  assert.equal(sanitizeColorScheme("mint"), "mint");
  assert.equal(sanitizeColorScheme("ocean"), "ocean");
  assert.equal(sanitizeColorScheme("violet"), "violet");
  assert.equal(sanitizeColorScheme("pink"), "violet");
  assert.equal(sanitizeColorScheme(undefined), "violet");
});

test("内置方案齐全且每条都有预览渐变", () => {
  assert.deepEqual(
    COLOR_SCHEMES.map((scheme) => scheme.id),
    ["violet", "coral", "mint", "ocean"],
  );
  for (const scheme of COLOR_SCHEMES) {
    assert.ok(scheme.label.length > 0, `${scheme.id} 应有名称`);
    assert.match(scheme.background, /^#[0-9a-fA-F]{6}$/);
    assert.match(scheme.gradient, /^linear-gradient\(/);
  }
});

test("配色方案可从 Zustand 持久化数据安全预读", () => {
  const storage = {
    getItem: (key: string) => key === "vellumstyle"
      ? JSON.stringify({state: {colorScheme: "mint"}, version: 0})
      : null,
  };
  assert.equal(readPersistedColorScheme(storage), "mint");
  assert.equal(readPersistedColorScheme({getItem: () => "broken"}), "violet");
  assert.equal(readPersistedColorScheme({getItem: () => null}), "violet");
});

test("应用配色方案会写入根元素 data-scheme 属性", () => {
  const attributes = new Map<string, string>();
  const root = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  applyColorScheme("ocean", root);
  assert.equal(attributes.get("data-scheme"), "ocean");
  applyColorScheme("unknown" as never, root);
  assert.equal(attributes.get("data-scheme"), "violet");
});
