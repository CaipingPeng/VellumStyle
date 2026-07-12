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

test("store 持久化并合法化外观状态", async () => {
  const source = await storeSource;
  const persistence = source.slice(source.indexOf("partialize:"));
  assert.match(persistence, /appearanceMode: s\.appearanceMode/);
  assert.match(persistence, /appearanceMode: sanitizeAppearanceMode\(saved\?\.appearanceMode\)/);
});
