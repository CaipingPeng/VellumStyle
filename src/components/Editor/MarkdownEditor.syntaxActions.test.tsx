import assert from "node:assert/strict";
import {test} from "node:test";
import {act, createRef} from "react";
import {createRoot} from "react-dom/client";
import MarkdownEditor, {type MarkdownEditorHandle} from "./MarkdownEditor.tsx";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

function installEditorDomPolyfills() {
  const win = window as typeof window & {
    requestAnimationFrame?: typeof requestAnimationFrame;
    cancelAnimationFrame?: typeof cancelAnimationFrame;
  };
  const requestFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0);
  const cancelFrame = (id: number) => window.clearTimeout(id);
  Object.assign(globalThis, {
    Window: window.Window,
    KeyboardEvent: window.KeyboardEvent,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: cancelFrame,
  });
  win.requestAnimationFrame = requestFrame;
  win.cancelAnimationFrame = cancelFrame;
  if (!window.Range.prototype.getClientRects) {
    window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
  if (!window.Range.prototype.getBoundingClientRect) {
    window.Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
}

installEditorDomPolyfills();

test("runSyntaxAction 通过统一命令修改文档", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const ref = createRef<MarkdownEditorHandle>();
  const changes: string[] = [];
  await act(async () => {
    root.render(<MarkdownEditor ref={ref} value="" appearanceMode="light" onChange={(value) => changes.push(value)} />);
  });
  try {
    assert.ok(ref.current);
    act(() => ref.current?.runSyntaxAction("bold"));
    assert.equal(changes[changes.length - 1], "**加粗文本**");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("图片占位符在继续编辑后仍能原位替换", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const ref = createRef<MarkdownEditorHandle>();
  const changes: string[] = [];
  await act(async () => {
    root.render(<MarkdownEditor ref={ref} value="" appearanceMode="light" onChange={(value) => changes.push(value)} />);
  });
  try {
    act(() => ref.current?.insertUploadPlaceholder("upload-1", "\n> 图片处理中\n"));
    act(() => ref.current?.insertAtCursor("继续编辑"));
    let replaced = false;
    act(() => {
      replaced = ref.current?.replaceUploadPlaceholder("upload-1", "\n![图片](https://example.com/image.jpg)\n", true) ?? false;
    });
    assert.equal(replaced, true);
    assert.equal(changes[changes.length - 1], "\n![图片](https://example.com/image.jpg)\n继续编辑");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("切换文章会清除旧文章的占位符范围", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const ref = createRef<MarkdownEditorHandle>();
  await act(async () => {
    root.render(<MarkdownEditor ref={ref} documentKey="a.md" value="文章 A" appearanceMode="light" onChange={() => {}} />);
  });
  try {
    act(() => ref.current?.insertUploadPlaceholder("upload-a", "\n> 图片处理中\n"));
    await act(async () => {
      root.render(<MarkdownEditor ref={ref} documentKey="b.md" value="文章 B" appearanceMode="light" onChange={() => {}} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    let replaced = true;
    act(() => {
      replaced = ref.current?.replaceUploadPlaceholder("upload-a", "不应写入", true) ?? true;
    });
    assert.equal(replaced, false);
    assert.equal(host.querySelector(".cm-content")?.textContent, "文章 B");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});


test("语法快捷键只在 CodeMirror 聚焦区域生效", async () => {
  const host = document.createElement("div");
  const outsideInput = document.createElement("input");
  document.body.append(host, outsideInput);
  const root = createRoot(host);
  const changes: string[] = [];
  await act(async () => {
    root.render(<MarkdownEditor value="" appearanceMode="light" onChange={(value) => changes.push(value)} />);
  });
  try {
    const content = host.querySelector<HTMLElement>(".cm-content");
    assert.ok(content);
    content.focus();
    const editorEvent = new window.KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => content.dispatchEvent(editorEvent));
    assert.equal(editorEvent.defaultPrevented, true);
    assert.equal(changes[changes.length - 1], "**加粗文本**");

    const changeCount = changes.length;
    const outsideEvent = new window.KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    outsideInput.focus();
    outsideInput.dispatchEvent(outsideEvent);
    assert.equal(outsideEvent.defaultPrevented, false);
    assert.equal(changes.length, changeCount);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    outsideInput.remove();
  }
});
