import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import Dialog from "./Dialog.tsx";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | null = null;
afterEach(() => cleanup?.());

function renderDialog(closeDisabled?: boolean) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let closes = 0;
  act(() => {
    root.render(
      <Dialog open title="测试" onClose={() => { closes++; }} closeDisabled={closeDisabled}>
        正文
      </Dialog>,
    );
  });
  const overlay = document.querySelector<HTMLElement>(".fixed.inset-0");
  const close = document.querySelector<HTMLButtonElement>('button[title="关闭"]');
  assert.ok(overlay);
  assert.ok(close);
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
    cleanup = null;
  };
  return {overlay, close, closes: () => closes};
}

test("Dialog 默认仍允许标题按钮和遮罩关闭", () => {
  const view = renderDialog();
  act(() => view.close.click());
  act(() => view.overlay.click());
  assert.equal(view.closes(), 2);
  assert.equal(view.close.disabled, false);
});

test("Dialog closeDisabled 语义化禁用标题关闭并阻止遮罩关闭", () => {
  const view = renderDialog(true);
  assert.equal(view.close.disabled, true);
  assert.match(view.close.className, /disabled:/);
  act(() => view.close.click());
  act(() => view.overlay.click());
  assert.equal(view.closes(), 0);
});
