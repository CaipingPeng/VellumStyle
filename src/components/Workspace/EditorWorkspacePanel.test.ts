import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act, createRef} from "react";
import {createRoot} from "react-dom/client";
import EditorWorkspacePanel from "./EditorWorkspacePanel.tsx";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

test("编辑器面板提供唯一的局部工具栏和独立内容区", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(
      EditorWorkspacePanel,
      {
        editorRef: createRef<MarkdownEditorHandle>(),
        onPickFile: async () => {},
        onPickLocal: async () => {},
        onOpenMaterialLibrary: () => {},
        children: React.createElement("div", {"data-test-editor": true}, "编辑正文"),
      },
    ));
  });

  try {
    assert.ok(container.querySelector('[data-workspace-panel="editor"]'));
    assert.equal(container.querySelectorAll("[data-editor-toolbar]").length, 1);
    assert.equal(container.querySelector("[data-editor-toolbar]")?.getAttribute("role"), "toolbar");
    assert.equal(container.querySelector("[data-editor-toolbar]")?.getAttribute("aria-label"), "编辑器工具栏");
    assert.equal(container.querySelectorAll("[data-editor-content]").length, 1);
    assert.ok(container.querySelector("[data-test-editor]"));
    assert.equal(container.textContent?.includes("预览"), false);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
