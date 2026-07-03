import assert from "node:assert/strict";
import {afterEach, beforeEach, test} from "node:test";
import {createScrollSync} from "./syncScroll.ts";

type RafCallback = FrameRequestCallback;

let originalRaf: typeof requestAnimationFrame | undefined;
let originalCancelRaf: typeof cancelAnimationFrame | undefined;
let rafCallbacks: RafCallback[] = [];

beforeEach(() => {
  originalRaf = globalThis.requestAnimationFrame;
  originalCancelRaf = globalThis.cancelAnimationFrame;
  rafCallbacks = [];
  globalThis.requestAnimationFrame = ((callback: RafCallback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    if (id > 0) {
      rafCallbacks[id - 1] = () => {};
    }
  }) as typeof cancelAnimationFrame;
});

afterEach(() => {
  if (originalRaf) {
    globalThis.requestAnimationFrame = originalRaf;
  } else {
    delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame;
  }
  if (originalCancelRaf) {
    globalThis.cancelAnimationFrame = originalCancelRaf;
  } else {
    delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame;
  }
});

function flushRaf() {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  callbacks.forEach((callback) => callback(0));
}

function scroller() {
  const element = document.createElement("div");
  Object.defineProperties(element, {
    scrollTop: {value: 0, writable: true, configurable: true},
    clientHeight: {value: 500, configurable: true},
    scrollHeight: {value: 5000, configurable: true},
  });
  return element;
}

function appendAnchor(parent: HTMLElement, line: number, top: number) {
  const anchor = document.createElement("div");
  anchor.setAttribute("data-line", String(line));
  Object.defineProperty(anchor, "offsetTop", {value: top, configurable: true});
  parent.appendChild(anchor);
}

function dispatchWheel(element: HTMLElement, deltaY: number) {
  const event = new window.Event("wheel");
  Object.defineProperty(event, "deltaX", {value: 0});
  Object.defineProperty(event, "deltaY", {value: deltaY});
  element.dispatchEvent(event);
}

function dispatchScroll(element: HTMLElement) {
  element.dispatchEvent(new window.Event("scroll"));
}

test("向下滚动编辑器后，CodeMirror 的反向测量修正不应把预览拉回旧位置", () => {
  const editor = scroller();
  const preview = scroller();
  appendAnchor(preview, 0, 0);
  appendAnchor(preview, 10, 1000);
  appendAnchor(preview, 20, 2000);
  let editorTopLine = 0;

  const sync = createScrollSync({
    editorScroller: editor,
    previewScroller: preview,
    getEditorTopLine: () => editorTopLine,
    scrollEditorToLine: () => {},
  });

  dispatchWheel(editor, 520);
  editor.scrollTop = 520;
  editorTopLine = 12;
  dispatchScroll(editor);
  flushRaf();
  assert.equal(preview.scrollTop, 1200);

  editor.scrollTop = 180;
  editorTopLine = 3;
  dispatchScroll(editor);
  flushRaf();
  assert.equal(preview.scrollTop, 1200);

  dispatchWheel(editor, 520);
  editor.scrollTop = 700;
  editorTopLine = 5;
  dispatchScroll(editor);
  flushRaf();
  assert.equal(preview.scrollTop, 1200);

  sync.destroy();
});
