import assert from "node:assert/strict";
import {test} from "node:test";
import {act} from "react";
import {createRoot} from "react-dom/client";
import SyntaxToolbar from "./SyntaxToolbar.tsx";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";
import type {SyntaxAction} from "../Editor/syntaxActions.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

function createEditorHandle(calls: SyntaxAction[]): MarkdownEditorHandle {
  return {
    insertAtCursor: () => {},
    runSyntaxAction: (action) => calls.push(action),
    undo: () => {},
    redo: () => {},
    getScroller: () => null,
    getTopLine: () => 0,
    getScrollTop: () => 0,
    getLineTop: () => 0,
    getMaxScrollTop: () => 0,
    scrollToLine: () => {},
    scrollToTop: () => {},
  };
}

test("语法按钮和标题菜单统一提交 SyntaxAction", () => {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const [format] = args;
    const isKnownFramerMotionWarning =
      typeof format === "string"
      && format.includes("`ref` is not a prop. Trying to access it will result in `undefined`");
    if (!isKnownFramerMotionWarning) originalConsoleError(...args);
  };

  const calls: SyntaxAction[] = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <SyntaxToolbar
        editorRef={{current: createEditorHandle(calls)}}
        onPickFile={async () => {}}
        onPickLocal={async () => {}}
        onOpenMaterialLibrary={() => {}}
      />,
    );
  });

  try {
    const expected = [
      ["加粗", "bold"],
      ["斜体", "italic"],
      ["删除线", "strikethrough"],
      ["行内代码", "inlineCode"],
      ["链接", "link"],
      ["无序列表", "unorderedList"],
      ["有序列表", "orderedList"],
      ["引用", "blockquote"],
      ["代码块", "codeBlock"],
      ["分割线", "horizontalRule"],
    ] as const;

    for (const [title, action] of expected) {
      const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      assert.ok(button, title);
      act(() => button.click());
      assert.equal(calls[calls.length - 1], action);
    }

    for (let level = 1; level <= 4; level++) {
      const headingButton = host.querySelector<HTMLButtonElement>('button[title="标题"]');
      assert.ok(headingButton);
      act(() => headingButton.click());
      const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === `H${level}`);
      assert.ok(item, `H${level}`);
      act(() => item.click());
      assert.equal(calls[calls.length - 1], `heading${level}`);
    }
  } finally {
    act(() => root.unmount());
    host.remove();
    console.error = originalConsoleError;
  }
});
