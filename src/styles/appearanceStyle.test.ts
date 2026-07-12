import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const cssSource = readFile(new URL("./globals.css", import.meta.url), "utf8");
const importDialogSource = readFile(new URL("../components/Import/ImportMarkdownDialog.tsx", import.meta.url), "utf8");
const publishDialogSource = readFile(new URL("../components/Publish/PublishDialog.tsx", import.meta.url), "utf8");
const materialDialogSource = readFile(new URL("../components/Upload/ImageMaterialPickerDialog.tsx", import.meta.url), "utf8");

test("暗色外观覆盖完整的应用语义 token", async () => {
  const css = await cssSource;
  const dark = css.slice(css.indexOf(':root[data-appearance="dark"]'));
  assert.match(dark, /--bg: #[0-9a-f]{6}/i);
  assert.match(dark, /--workspace-frame: #[0-9a-f]{6}/i);
  assert.match(dark, /--workspace-panel: #[0-9a-f]{6}/i);
  assert.match(dark, /--text: #[0-9a-f]{6}/i);
  assert.match(dark, /--editor-active-line:/);
  assert.match(dark, /\.cm-editor \.cm-panel\.cm-search/);
});

test("重点对话框不再依赖硬编码浅色表面", async () => {
  assert.doesNotMatch(await importDialogSource, /bg-\[#f|focus-within:bg-white|\bbg-white\b/i);
  assert.doesNotMatch(await publishDialogSource, /border-black\/\[|\bbg-white\b/);
  assert.doesNotMatch(await materialDialogSource, /border-black\/\[/);
});
