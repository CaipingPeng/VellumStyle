import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import DeleteConfirmDialog from "./DeleteConfirmDialog.tsx";
import type {DocNode} from "../../utils/documents.ts";

function renderDeleteDialog(overrides: Partial<React.ComponentProps<typeof DeleteConfirmDialog>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const node: DocNode = {
    name: "素材",
    path: "素材",
    isDir: true,
    children: [{name: "封面", path: "素材/封面.md", isDir: false, children: []}],
  };
  const props: React.ComponentProps<typeof DeleteConfirmDialog> = {
    open: true,
    node,
    onCancel: () => {},
    onConfirm: () => {},
    ...overrides,
  };

  act(() => {
    root.render(React.createElement(DeleteConfirmDialog, props));
  });

  return {
    root,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("删除确认弹窗使用应用内对话框展示递归删除风险", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {cleanup} = renderDeleteDialog();

  try {
    assert.equal(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal"), "true");
    assert.match(document.body.textContent || "", /删除文件夹/);
    assert.match(document.body.textContent || "", /素材/);
    assert.match(document.body.textContent || "", /1 个子项/);
    assert.ok(Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "取消"));
    assert.ok(Array.from(document.querySelectorAll("button")).some((button) => button.textContent === "删除"));
  } finally {
    cleanup();
  }
});

test("删除确认弹窗取消和确认走显式回调", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  let cancelled = 0;
  let confirmed = 0;
  const {cleanup} = renderDeleteDialog({
    onCancel: () => {
      cancelled++;
    },
    onConfirm: () => {
      confirmed++;
    },
  });

  try {
    const buttons = Array.from(document.querySelectorAll("button"));
    act(() => buttons.find((button) => button.textContent === "取消")?.click());
    act(() => buttons.find((button) => button.textContent === "删除")?.click());

    assert.equal(cancelled, 1);
    assert.equal(confirmed, 1);
  } finally {
    cleanup();
  }
});

test("删除确认弹窗使用紧凑布局，不保留大空白警告框", async () => {
  const source = await readFile(new URL("./DeleteConfirmDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /w-\[420px\]/);
  assert.match(source, /rounded-md border border-border bg-bg-secondary/);
  assert.doesNotMatch(source, /w-\[480px\]/);
  assert.doesNotMatch(source, /text-\[20px\]/);
});
