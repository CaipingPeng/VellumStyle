import assert from "node:assert/strict";
import {test} from "node:test";
import {act} from "react";
import {createRoot} from "react-dom/client";
import ResizableSidePanel from "./ResizableSidePanel.tsx";
import {
  DEFAULT_SIDE_PANEL_WIDTH,
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
} from "./sidePanelLayout.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

function pointerEvent(type: string, clientX: number, pointerId = 7, button = 0): MouseEvent {
  const event = new window.MouseEvent(type, {bubbles: true, clientX, button});
  Object.defineProperty(event, "pointerId", {value: pointerId});
  Object.defineProperty(event, "isPrimary", {value: true});
  return event;
}

function renderPanel(label = "调整测试面板宽度") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ResizableSidePanel ariaLabel={label}>
        <aside data-test-panel>内容</aside>
      </ResizableSidePanel>,
    );
  });
  const container = host.querySelector<HTMLElement>(".workspace-side-panel-container");
  const separator = host.querySelector<HTMLElement>('[role="separator"]');
  assert.ok(container);
  assert.ok(separator);
  return {
    container,
    separator,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("侧栏分隔柄提供宽度范围、当前值和键盘语义", () => {
  const view = renderPanel();
  try {
    assert.equal(view.container.style.width, `${DEFAULT_SIDE_PANEL_WIDTH}px`);
    assert.equal(view.separator.getAttribute("aria-label"), "调整测试面板宽度");
    assert.equal(view.separator.getAttribute("aria-orientation"), "vertical");
    assert.equal(view.separator.getAttribute("aria-valuemin"), String(MIN_SIDE_PANEL_WIDTH));
    assert.equal(view.separator.getAttribute("aria-valuemax"), String(MAX_SIDE_PANEL_WIDTH));
    assert.equal(view.separator.getAttribute("aria-valuenow"), String(DEFAULT_SIDE_PANEL_WIDTH));

    const right = new window.KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true, cancelable: true});
    act(() => view.separator.dispatchEvent(right));
    assert.equal(right.defaultPrevented, true);
    assert.equal(view.container.style.width, "236px");
    assert.equal(view.separator.getAttribute("aria-valuenow"), "236");

    act(() => view.separator.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true})));
    assert.equal(view.container.style.width, `${DEFAULT_SIDE_PANEL_WIDTH}px`);
  } finally {
    view.cleanup();
  }
});

test("侧栏指针拖动即时调整宽度，并在结束与卸载时清理全局状态", () => {
  const view = renderPanel();
  const captures: number[] = [];
  const releases: number[] = [];
  view.separator.setPointerCapture = (id) => captures.push(id);
  view.separator.releasePointerCapture = (id) => releases.push(id);

  act(() => view.separator.dispatchEvent(pointerEvent("pointerdown", 100)));
  assert.deepEqual(captures, [7]);
  assert.equal(document.documentElement.classList.contains("workspace-is-resizing"), true);
  assert.equal(view.separator.classList.contains("is-resizing"), true);

  act(() => view.separator.dispatchEvent(pointerEvent("pointermove", 180)));
  assert.equal(view.container.style.width, "300px");

  act(() => view.separator.dispatchEvent(pointerEvent("pointerup", 180)));
  assert.deepEqual(releases, [7]);
  assert.equal(document.documentElement.classList.contains("workspace-is-resizing"), false);
  assert.equal(view.separator.classList.contains("is-resizing"), false);
  view.cleanup();

  const unmounted = renderPanel();
  act(() => unmounted.separator.dispatchEvent(pointerEvent("pointerdown", 100, 8)));
  unmounted.cleanup();
  assert.equal(document.documentElement.classList.contains("workspace-is-resizing"), false);
});
