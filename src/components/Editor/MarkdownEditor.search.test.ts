import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

test("Markdown 编辑器启用 CodeMirror 搜索替换扩展", async () => {
  const source = await readFile(new URL("./MarkdownEditor.tsx", import.meta.url), "utf8");

  assert.match(source, /from "@codemirror\/search"/);
  assert.match(source, /search\(\{top: true\}\)/);
  assert.match(source, /openSearchPanel/);
});

test("Markdown 编辑器绑定 Ctrl+H 打开搜索替换面板", async () => {
  const source = await readFile(new URL("./MarkdownEditor.tsx", import.meta.url), "utf8");

  assert.match(source, /keymap\.of/);
  assert.match(source, /key: "Ctrl-h"/);
  assert.match(source, /run: openSearchPanel/);
  assert.match(source, /Prec\.highest/);
});

test("Markdown 编辑器把搜索替换面板文案本地化为中文", async () => {
  const source = await readFile(new URL("./MarkdownEditor.tsx", import.meta.url), "utf8");

  assert.match(source, /EditorState\.phrases\.of/);
  assert.match(source, /Find:\s*"查找"/);
  assert.match(source, /Replace:\s*"替换为"/);
  assert.match(source, /"replace all":\s*"全部替换"/);
});
