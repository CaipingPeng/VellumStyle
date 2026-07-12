import assert from "node:assert/strict";
import {test} from "node:test";
import {defaultHighlightStyle} from "@codemirror/language";
import {oneDarkHighlightStyle} from "@uiw/react-codemirror";
import {EditorState} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import {
  createEditorAppearanceExtension,
  editorHighlightStyleFor,
} from "./editorAppearance.ts";

test("编辑器根据应用外观选择完整的官方语法高亮", () => {
  assert.equal(editorHighlightStyleFor("light"), defaultHighlightStyle);
  assert.equal(editorHighlightStyleFor("dark"), oneDarkHighlightStyle);
});

test("编辑器外观扩展向 CodeMirror 声明正确的亮暗模式", () => {
  const lightState = EditorState.create({
    extensions: [createEditorAppearanceExtension("light")],
  });
  const darkState = EditorState.create({
    extensions: [createEditorAppearanceExtension("dark")],
  });

  assert.equal(lightState.facet(EditorView.darkTheme), false);
  assert.equal(darkState.facet(EditorView.darkTheme), true);
});
