import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("主编辑和预览滚动条默认隐藏，hover 后显现", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

  assert.match(css, /\.cm-scroller/);
  assert.match(css, /\.editor-preview-scrollbar/);
  assert.match(css, /scrollbar-color:\s*transparent transparent/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /::-webkit-scrollbar-thumb/);
  assert.match(css, /::-webkit-scrollbar-thumb:active/);
});

test("预览滚动容器提供滚动条样式挂点", async () => {
  const source = await readFile(new URL("../components/Preview/Preview.tsx", import.meta.url), "utf8");

  assert.match(source, /className="editor-preview-scrollbar"/);
});
