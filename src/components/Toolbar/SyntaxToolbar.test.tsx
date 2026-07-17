import assert from "node:assert/strict";
import {test} from "node:test";
import {act} from "react";
import {createRoot} from "react-dom/client";
import SyntaxToolbar from "./SyntaxToolbar.tsx";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";
import type {SyntaxAction} from "../Editor/syntaxActions.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

function withNavigatorPlatform(platform: string, callback: () => void) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });

  try {
    callback();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(navigator, "platform", originalDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "platform");
    }
  }
}

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

function withRenderedToolbar(
  platform: string,
  calls: SyntaxAction[],
  callback: (host: HTMLDivElement) => void,
) {
  withNavigatorPlatform(platform, () => {
    const originalConsoleError = console.error;
    const host = document.createElement("div");
    let root: ReturnType<typeof createRoot> | undefined;

    console.error = (...args: unknown[]) => {
      const [format] = args;
      const isKnownFramerMotionWarning =
        typeof format === "string"
        && format.includes("`ref` is not a prop. Trying to access it will result in `undefined`");
      if (!isKnownFramerMotionWarning) originalConsoleError(...args);
    };

    try {
      document.body.appendChild(host);
      const createdRoot = createRoot(host);
      root = createdRoot;
      act(() => {
        createdRoot.render(
          <SyntaxToolbar
            editorRef={{current: createEditorHandle(calls)}}
            onPickFile={async () => {}}
            onPickLocal={async () => {}}
            onOpenMaterialLibrary={() => {}}
          />,
        );
      });
      callback(host);
    } finally {
      try {
        if (root) {
          const mountedRoot = root;
          act(() => mountedRoot.unmount());
        }
      } finally {
        try {
          host.remove();
        } finally {
          console.error = originalConsoleError;
        }
      }
    }
  });
}

test("Windows 语法按钮标题包含注册的快捷键并统一提交 SyntaxAction", () => {
  const calls: SyntaxAction[] = [];
  withRenderedToolbar("Win32", calls, (host) => {
    const expected = [
      ["加粗 (Ctrl+B)", "bold"],
      ["斜体 (Ctrl+I)", "italic"],
      ["删除线 (Shift+Alt+5)", "strikethrough"],
      ["行内代码 (Ctrl+Shift+`)", "inlineCode"],
      ["链接 (Ctrl+K)", "link"],
      ["无序列表 (Ctrl+Shift+])", "unorderedList"],
      ["有序列表 (Ctrl+Shift+[)", "orderedList"],
      ["引用 (Ctrl+Shift+Q)", "blockquote"],
      ["代码块 (Ctrl+Shift+K)", "codeBlock"],
      ["分割线 (Ctrl+Shift+H)", "horizontalRule"],
    ] as const;

    for (const [title, action] of expected) {
      const button = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
      assert.ok(button, title);
      act(() => button.click());
      assert.equal(calls[calls.length - 1], action);
    }

    for (let level = 1; level <= 4; level++) {
      const headingButton = host.querySelector<HTMLButtonElement>('button[title="标题 (Ctrl+1–4)"]');
      assert.ok(headingButton);
      act(() => headingButton.click());
      const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === `H${level}`);
      assert.ok(item, `H${level}`);
      act(() => item.click());
      assert.equal(calls[calls.length - 1], `heading${level}`);
    }
  });
});

test("macOS 语法按钮标题使用符号快捷键", () => {
  withRenderedToolbar("MacIntel", [], (host) => {
    assert.ok(host.querySelector<HTMLButtonElement>('button[title="加粗 (⌘B)"]'));
    assert.ok(host.querySelector<HTMLButtonElement>('button[title="删除线 (⌃⇧`)"]'));
    assert.ok(host.querySelector<HTMLButtonElement>('button[title="有序列表 (⌘⌥O)"]'));
    assert.ok(host.querySelector<HTMLButtonElement>('button[title="标题 (⌘1–4)"]'));
  });
});
