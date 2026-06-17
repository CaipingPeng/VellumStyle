import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("主编辑和预览滚动条默认隐藏，hover 后显现", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

  assert.match(css, /\.cm-scroller/);
  assert.match(css, /\.cm-editor\s*\{/);
  assert.match(css, /\.cm-editor\.cm-focused\s*\{/);
  assert.match(css, /\.editor-preview-scrollbar/);
  assert.match(css, /height:\s*100%/);
  assert.match(css, /overflow:\s*auto/);
  assert.match(css, /outline:\s*none/);
  assert.match(css, /scrollbar-color:\s*transparent transparent/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /::-webkit-scrollbar-thumb/);
  assert.match(css, /::-webkit-scrollbar-thumb:active/);
});

test("CodeMirror 接收 Tauri CSP nonce，避免打包版动态样式被拦截", async () => {
  const source = await readFile(new URL("../components/Editor/MarkdownEditor.tsx", import.meta.url), "utf8");

  assert.match(source, /EditorView\.cspNonce\.of/);
  assert.match(source, /getCodeMirrorCspNonce/);
});

test("预览滚动容器提供滚动条样式挂点", async () => {
  const source = await readFile(new URL("../components/Preview/Preview.tsx", import.meta.url), "utf8");

  assert.match(source, /className="editor-preview-scrollbar"/);
});

test("MathJax 行间公式有静态居中样式兜底", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

  assert.match(css, /#article\s+mjx-container\[jax="SVG"\]\[display="true"\]/);
  assert.match(css, /text-align:\s*center/);
  assert.match(css, /margin:\s*1em 0/);
});
