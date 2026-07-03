import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

async function readEditorSource() {
  return readFile(new URL("./MarkdownEditor.tsx", import.meta.url), "utf8");
}

function stripLineComments(source: string) {
  return source.replace(/\/\/.*$/gm, "");
}

function extractExtensionsBlock(source: string) {
  const start = source.indexOf("const extensions = useMemo");
  const end = source.indexOf("const {view, setContainer} = useCodeMirror", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("Markdown 编辑器默认不挂载搜索扩展，避免普通滚动时触发 CodeMirror 测量回弹", async () => {
  const source = stripLineComments(await readEditorSource());
  const extensionsBlock = extractExtensionsBlock(source);

  assert.match(extensionsBlock, /searchCompartment\.of\(\[\]\)/);
  assert.doesNotMatch(extensionsBlock, /\bsearch\(\{top: true\}\)/);
  assert.doesNotMatch(extensionsBlock, /EditorState\.phrases\.of\(/);
});

test("Markdown 编辑器通过 Ctrl+H 懒加载本地化搜索替换扩展", async () => {
  const source = await readFile(new URL("./MarkdownEditor.tsx", import.meta.url), "utf8");

  assert.match(source, /from "@codemirror\/search"/);
  assert.match(source, /const localizedSearchExtensions = \[/);
  assert.match(source, /search\(\{top: true\}\)/);
  assert.match(source, /searchCompartment\.reconfigure\(localizedSearchExtensions\)/);
  assert.match(source, /openLocalizedSearchPanel/);
  assert.match(source, /openSearchPanel\(view\)/);
  assert.match(source, /keymap\.of/);
  assert.match(source, /key: "Ctrl-h"/);
  assert.match(source, /run: openLocalizedSearchPanel/);
  assert.doesNotMatch(stripLineComments(source), /run:\s*openSearchPanel/);
  assert.match(source, /Prec\.highest/);
});

test("Markdown 编辑器把搜索替换面板文案本地化为中文", async () => {
  const source = await readEditorSource();

  assert.match(source, /EditorState\.phrases\.of/);
  assert.match(source, /Find:\s*"查找"/);
  assert.match(source, /Replace:\s*"替换为"/);
  assert.match(source, /"replace all":\s*"全部替换"/);
});

test("Markdown 编辑器关闭搜索面板后卸载搜索扩展，避免搜索使用后普通滚动继续回弹", async () => {
  const source = stripLineComments(await readEditorSource());

  assert.match(source, /searchPanelOpen/);
  assert.match(source, /unloadSearchWhenPanelCloses/);
  assert.match(source, /searchCompartment\.reconfigure\(\[\]\)/);
  assert.match(source, /searchLoadedEffect\.of\(false\)/);
});

test("Markdown 编辑器顶部行用 scroller 实时像素位置反推，避免视口滞后造成回弹", async () => {
  const source = await readEditorSource();

  assert.doesNotMatch(source, /view\.viewport\.from/);
  assert.match(source, /lineBlockAtHeight\(view\.scrollDOM\.scrollTop\)/);
  assert.doesNotMatch(source, /EditorView\.scrollIntoView/);
});
