import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {act, StrictMode} from "react";
import {createRoot, type Root} from "react-dom/client";
import CommandPalette from "./CommandPalette.tsx";
import type {AppCommand} from "../../commands/registry.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event("input", {bubbles: true}));
}

test("搜索命令，并用键盘选择执行", () => {
  const calls: string[] = [];
  let closes = 0;
  const commands: AppCommand[] = [
    {id: "settings", label: "打开设置", group: "应用", keywords: ["配置"], run: () => { calls.push("settings"); }},
    {id: "emoji", label: "插入表情", group: "插入", keywords: ["微信", "emoji"], run: () => { calls.push("emoji"); }},
    {id: "music", label: "插入音乐", group: "插入", keywords: ["qq"], run: () => { calls.push("music"); }},
  ];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(<CommandPalette commands={commands} onClose={() => { closes++; }} />));

  const input = document.querySelector<HTMLInputElement>('input[role="combobox"]');
  assert.ok(input);
  act(() => setInputValue(input, "插入"));
  const options = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  assert.deepEqual(options.map((option) => option.textContent?.replace(/\s+/g, "")), ["插入表情插入", "插入音乐插入"]);

  act(() => input.dispatchEvent(new window.KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true})));
  act(() => input.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Enter", bubbles: true})));
  assert.deepEqual(calls, ["music"]);
  assert.equal(closes, 1);
});

test("WebView 的 scrollIntoView 返回 Promise 时，StrictMode 不会把它当作副作用清理函数", () => {
  const prototype = window.HTMLElement.prototype as typeof window.HTMLElement.prototype & {
    scrollIntoView: (options?: ScrollIntoViewOptions) => unknown;
  };
  const original = prototype.scrollIntoView;
  prototype.scrollIntoView = () => Promise.resolve();
  const commands: AppCommand[] = [
    {id: "settings", label: "打开设置", group: "应用", keywords: [], run: () => undefined},
  ];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  try {
    assert.doesNotThrow(() => {
      act(() => root?.render(<StrictMode><CommandPalette commands={commands} onClose={() => undefined} /></StrictMode>));
    });
  } finally {
    prototype.scrollIntoView = original;
  }
});
