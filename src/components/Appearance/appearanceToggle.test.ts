import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const toggleSource = readFile(new URL("./AppearanceToggle.tsx", import.meta.url), "utf8");
const appSource = readFile(new URL("../../App.tsx", import.meta.url), "utf8");
const mainSource = readFile(new URL("../../main.tsx", import.meta.url), "utf8");

test("入口在 React 挂载前预应用持久化外观", async () => {
  const source = await mainSource;
  assert.match(source, /readPersistedAppearanceMode\(window\.localStorage\)/);
  assert.match(source, /applyAppearanceMode\([^,]+, document\.documentElement\)/);
  assert.ok(source.indexOf("applyAppearanceMode(") < source.indexOf("createRoot("));
});

test("状态栏外观按钮使用当前模式图标与动作提示", async () => {
  const source = await toggleSource;
  assert.match(source, /appearanceMode === "light" \? Sun : Moon/);
  assert.match(source, /切换到暗色模式/);
  assert.match(source, /切换到亮色模式/);
  assert.match(source, /aria-pressed=\{appearanceMode === "dark"\}/);
  assert.match(source, /onClick=\{toggleAppearanceMode\}/);
});

test("App 同步根外观并把按钮放在状态栏最右侧", async () => {
  const source = await appSource;
  assert.match(source, /applyAppearanceMode\(appearanceMode, document\.documentElement\)/);
  const footer = source.slice(source.indexOf("{/* Footer */}"), source.indexOf("<SettingsDialog"));
  assert.match(footer, /<PreviewModeToggle variant="status" \/>[\s\S]*<StatusDivider \/>[\s\S]*<AppearanceToggle \/>/);
  assert.ok(footer.lastIndexOf("<AppearanceToggle />") > footer.lastIndexOf("<PreviewModeToggle"));
});
