import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

test("工作区使用语义令牌并提供焦点、拖动和减少动态效果规则", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
  assert.match(css, /--workspace-frame:/);
  assert.match(css, /--workspace-panel:/);
  assert.match(css, /--workspace-panel-border:/);
  assert.match(css, /--workspace-panel-radius: 10px/);
  assert.match(css, /\.workspace-editor-panel:focus-within/);
  assert.match(css, /\.workspace-split-separator:focus-visible/);
  assert.match(css, /\.workspace-is-resizing/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("分隔柄保持 8px 命中区域和克制的细视觉线", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
  const separator = css.slice(css.indexOf(".workspace-split-separator {"));
  assert.match(separator, /width: 8px/);
  assert.match(separator, /\.workspace-split-separator::before/);
  assert.match(separator, /width: 1px/);
  assert.doesNotMatch(separator.slice(0, separator.indexOf("@media")), /box-shadow:\s*var\(--shadow-(md|lg)\)/);
});
