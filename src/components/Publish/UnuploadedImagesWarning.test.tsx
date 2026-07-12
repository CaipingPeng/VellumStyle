import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act, createRef} from "react";
import {createRoot} from "react-dom/client";
import type {UnuploadedImage, UnuploadedImageReason} from "../../utils/publish.ts";
import UnuploadedImagesWarning from "./UnuploadedImagesWarning.tsx";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const item = (line: number, reason: UnuploadedImageReason, url: string): UnuploadedImage =>
  ({line, reason, url, column: 1, sourceType: "remote", syntax: "markdown-image"});

function render(overrides: Partial<React.ComponentProps<typeof UnuploadedImagesWarning>> = {}) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); const backButtonRef = createRef<HTMLButtonElement>();
  let backs = 0, continues = 0;
  const props = {items: [item(1, "local", "file:///a.png")], busy: false,
    onBack: () => backs++, onContinue: () => continues++, backButtonRef, ...overrides};
  act(() => root.render(<UnuploadedImagesWarning {...props}/>));
  return {container, backButtonRef, counts: () => ({backs, continues}), cleanup: () => {act(() => root.unmount()); container.remove();}};
}

const buttons = (container: HTMLElement) => Array.from(container.querySelectorAll("button"));

test("renders associated warning text and every diagnostic category", () => {
  const items = [item(2,"local","file:///very/long/path/image.png"), item(5,"external","https://example.com/a.png"), item(8,"temporary","blob:abc"), item(13,"unsupported","")];
  const view = render({items});
  try {
    const warning = view.container.querySelector('[role="region"]') as HTMLElement;
    assert.ok(warning); assert.equal(warning.getAttribute("aria-labelledby"), warning.querySelector("h2")?.id);
    assert.equal(warning.getAttribute("aria-describedby"), warning.querySelector("p")?.id);
    assert.match(warning.textContent || "", /可能无法在微信文章中正常显示/);
    for (const text of ["第 2 行 · 本地图片", "第 5 行 · 外部图片", "第 8 行 · 临时图片", "第 13 行 · 不支持的图片地址", "（空地址）"]) assert.match(warning.textContent || "", new RegExp(text));
    const url = Array.from(warning.querySelectorAll("code")).find(x => x.textContent?.includes("very/long"));
    assert.equal(url?.getAttribute("title"), "file:///very/long/path/image.png"); assert.match(url?.className || "", /break-all/);
  } finally { view.cleanup(); }
});

test("buttons invoke callbacks, expose focus ref, and continue is dangerous", () => {
  const view = render();
  try { const [back, cont] = buttons(view.container); act(() => back.click()); act(() => cont.click());
    assert.deepEqual(view.counts(), {backs:1, continues:1}); assert.equal(view.backButtonRef.current, back);
    act(() => back.focus()); assert.equal(document.activeElement, back); assert.match(cont.className, /danger/);
  } finally { view.cleanup(); }
});

test("busy disables both buttons and Escape does nothing", () => {
  const view = render({busy:true});
  try { assert.ok(buttons(view.container).every(x => x.disabled)); act(() => window.dispatchEvent(new window.KeyboardEvent("keydown", {key:"Escape"}))); assert.deepEqual(view.counts(), {backs:0, continues:0}); }
  finally { view.cleanup(); }
});

test("Escape backs once per event, never continues, and listener is cleaned up", () => {
  const view = render();
  try {
    act(() => window.dispatchEvent(new window.KeyboardEvent("keydown", {key:"Escape"})));
    assert.deepEqual(view.counts(), {backs:1, continues:0});
  } finally {
    view.cleanup();
  }
  act(() => window.dispatchEvent(new window.KeyboardEvent("keydown", {key:"Escape"})));
  assert.deepEqual(view.counts(), {backs:1, continues:0});
});
