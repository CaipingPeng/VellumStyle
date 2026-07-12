import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const editorSource = readFile(new URL("./MarkdownEditor.tsx", import.meta.url), "utf8");
const appSource = readFile(new URL("../../App.tsx", import.meta.url), "utf8");

test("CodeMirror 通过 Compartment 原位重配置亮暗主题", async () => {
  const source = await editorSource;
  assert.match(source, /appearanceMode: AppearanceMode/);
  assert.match(source, /const appearanceCompartment = new Compartment\(\)/);
  assert.match(source, /appearanceCompartment\.reconfigure\(createEditorAppearanceExtension\(appearanceMode\)\)/);
  assert.match(source, /\{dark: appearanceMode === "dark"\}/);
  assert.doesNotMatch(source, /cm-theme-light/);
});

test("App 把应用外观传给编辑器", async () => {
  assert.match(await appSource, /<MarkdownEditor[\s\S]*appearanceMode=\{appearanceMode\}/);
});
