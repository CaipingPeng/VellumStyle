import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import WorkspaceSplit from "./WorkspaceSplit.tsx";
import {DEFAULT_WORKSPACE_SPLIT_RATIO} from "./workspaceSplitLayout.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

let activeResizeObserver: ResizeObserverStub | null = null;

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {
    activeResizeObserver = this;
  }

  emit(width: number) {
    this.callback(
      [{contentRect: {width}} as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  observe() {
    this.emit(1008);
  }

  unobserve() {}

  disconnect() {
    if (activeResizeObserver === this) activeResizeObserver = null;
  }
}

function resizeWorkspace(width: number) {
  const observer = activeResizeObserver;
  assert.ok(observer);
  act(() => observer.emit(width));
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverStub,
  configurable: true,
});

const originalGetBoundingClientRect = window.Element.prototype.getBoundingClientRect;
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  if ((this as HTMLElement).dataset?.workspaceSplit !== undefined) {
    return {
      x: 100,
      y: 0,
      left: 100,
      top: 0,
      right: 1108,
      bottom: 600,
      width: 1008,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect;
  }
  return originalGetBoundingClientRect.call(this);
};

function pointerEvent(type: string, clientX: number, pointerId = 7, button = 0): MouseEvent {
  const event = new window.MouseEvent(type, {bubbles: true, clientX, button});
  Object.defineProperty(event, "pointerId", {value: pointerId});
  Object.defineProperty(event, "isPrimary", {value: true});
  return event;
}

function renderSplit(onRatioCommit: (ratio: number) => void, ratio = 0.5) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(WorkspaceSplit, {
      ratio,
      onRatioCommit,
      editor: React.createElement("div", null, "editor"),
      preview: React.createElement("div", null, "preview"),
    }));
  });
  const separator = container.querySelector<HTMLElement>('[role="separator"]');
  assert.ok(separator);
  return {
    container,
    separator,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function assertPaneFlex(
  container: HTMLElement,
  pane: "editor" | "preview",
  expectedGrow: string,
) {
  const element = container.querySelector<HTMLElement>(`[data-workspace-pane="${pane}"]`);
  assert.ok(element);
  assert.equal(element.style.flexGrow, expectedGrow);
  assert.equal(element.style.flexShrink, "1");
  assert.equal(element.style.flexBasis, "0px");
  assert.equal(element.style.width, "");
  assert.equal(element.classList.contains("flex-none"), false);
}

test("分栏使用同步比例布局并提供完整 separator 语义", () => {
  const view = renderSplit(() => {});
  try {
    assert.equal(view.separator.getAttribute("aria-orientation"), "vertical");
    assert.equal(view.separator.getAttribute("aria-label"), "调整编辑器和预览宽度");
    assert.equal(view.separator.tabIndex, 0);
    assert.equal(view.separator.getAttribute("aria-valuemin"), "28");
    assert.equal(view.separator.getAttribute("aria-valuemax"), "72");
    assert.equal(view.separator.getAttribute("aria-valuenow"), "50");
    assertPaneFlex(view.container, "editor", "0.5");
    assertPaneFlex(view.container, "preview", "0.5");
  } finally {
    view.cleanup();
  }
});

test("容器测量只约束比例和 ARIA，不向面板写固定像素宽度", () => {
  const view = renderSplit(() => {}, 0.6);
  try {
    assertPaneFlex(view.container, "editor", "0.6");
    assertPaneFlex(view.container, "preview", "0.4");
    assert.equal(view.separator.getAttribute("aria-valuenow"), "60");

    resizeWorkspace(508);

    assertPaneFlex(view.container, "editor", "0.5");
    assertPaneFlex(view.container, "preview", "0.5");
    assert.equal(view.separator.getAttribute("aria-valuemin"), "50");
    assert.equal(view.separator.getAttribute("aria-valuemax"), "50");
    assert.equal(view.separator.getAttribute("aria-valuenow"), "50");
  } finally {
    view.cleanup();
  }
});

test("键盘支持小步、大步和恢复默认比例", () => {
  const commits: number[] = [];
  const view = renderSplit((ratio) => commits.push(ratio));
  try {
    const right = new window.KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true});
    act(() => view.separator.dispatchEvent(right));
    assert.equal(right.defaultPrevented, true);
    assert.equal(commits[commits.length - 1], 0.52);

    act(() => view.separator.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "ArrowLeft",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })));
    assert.equal(commits[commits.length - 1], 0.42);

    act(() => view.separator.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true})));
    assert.equal(commits[commits.length - 1], DEFAULT_WORKSPACE_SPLIT_RATIO);
  } finally {
    view.cleanup();
  }
});

test("指针拖动即时更新，结束提交并可靠清理捕获状态", () => {
  const commits: number[] = [];
  const captures: number[] = [];
  const releases: number[] = [];
  const view = renderSplit((ratio) => commits.push(ratio));
  view.separator.setPointerCapture = (id) => captures.push(id);
  view.separator.releasePointerCapture = (id) => releases.push(id);

  try {
    act(() => view.separator.dispatchEvent(pointerEvent("pointerdown", 600)));
    assert.deepEqual(captures, [7]);
    assert.equal(document.documentElement.classList.contains("workspace-is-resizing"), true);

    act(() => view.separator.dispatchEvent(pointerEvent("pointermove", 700)));
    assertPaneFlex(view.container, "editor", "0.6");
    assertPaneFlex(view.container, "preview", "0.4");
    assert.deepEqual(commits, []);

    act(() => view.separator.dispatchEvent(pointerEvent("pointerup", 700)));
    assert.equal(commits[commits.length - 1], 0.6);
    assert.deepEqual(releases, [7]);
    assert.equal(document.documentElement.classList.contains("workspace-is-resizing"), false);
  } finally {
    view.cleanup();
  }
});

test("pointercancel 和拖动中卸载都不会遗留全局拖动状态", () => {
  const commits: number[] = [];
  const cancelled = renderSplit((ratio) => commits.push(ratio));
  act(() => cancelled.separator.dispatchEvent(pointerEvent("pointerdown", 600, 8)));
  act(() => cancelled.separator.dispatchEvent(pointerEvent("pointermove", 650, 8)));
  act(() => cancelled.separator.dispatchEvent(pointerEvent("pointercancel", 650, 8)));
  assert.equal(commits[commits.length - 1], 0.55);
  assert.equal(document.documentElement.classList.contains("workspace-is-resizing"), false);
  cancelled.cleanup();

  const unmounted = renderSplit((ratio) => commits.push(ratio));
  act(() => unmounted.separator.dispatchEvent(pointerEvent("pointerdown", 600, 9)));
  const beforeUnmount = commits.length;
  unmounted.cleanup();
  assert.equal(commits.length, beforeUnmount);
  assert.equal(document.documentElement.classList.contains("workspace-is-resizing"), false);
});
