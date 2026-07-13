import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import TreeNode from "./TreeNode.tsx";
import type {DocNode} from "../../utils/documents.ts";

function renderTreeNode(
  node: DocNode,
  overrides: Partial<React.ComponentProps<typeof TreeNode>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: React.ComponentProps<typeof TreeNode> = {
    node,
    depth: 0,
    selectedPath: null,
    sidebarFocused: true,
    expanded: new Set<string>(),
    dragOverPath: null,
    creating: null,
    onToggle: () => {},
    onSelectDoc: () => {},
    onSelectFolder: () => {},
    onRename: () => {},
    onDelete: () => {},
    onOpenLocation: () => {},
    onCopyAbsolutePath: () => {},
    onDragStartNode: () => {},
    onDragOverNode: () => {},
    onDropNode: () => {},
    onDraftChange: () => {},
    onDraftCommit: () => {},
    onDraftCancel: () => {},
    ...overrides,
  };

  act(() => {
    root.render(React.createElement(TreeNode, props));
  });

  return {
    container,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("文件节点双击进入重命名输入", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  });

  try {
    assert.equal(container.querySelector("input"), null);
    act(() => {
      container.querySelector('[aria-label="草稿.md"]')?.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true}));
    });

    assert.equal(container.querySelector<HTMLInputElement>("input")?.value, "草稿.md");
  } finally {
    cleanup();
  }
});

test("文件夹节点双击不进入重命名，避免和展开折叠冲突", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "素材",
    path: "素材",
    isDir: true,
    children: [],
  });

  try {
    act(() => {
      container.querySelector('[aria-label="素材"]')?.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true}));
    });

    assert.equal(container.querySelector("input"), null);
  } finally {
    cleanup();
  }
});

function contextMenuButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes(label));
}

test("文件节点右键菜单可复制绝对路径", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const copied: string[] = [];
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    onCopyAbsolutePath: (path) => copied.push(path),
  });

  try {
    act(() => {
      container.querySelector('[aria-label="草稿.md"]')?.dispatchEvent(
        new window.MouseEvent("contextmenu", {bubbles: true, clientX: 20, clientY: 20}),
      );
    });

    const button = contextMenuButton(container, "复制绝对路径");
    assert.ok(button);
    act(() => button.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));

    assert.deepEqual(copied, ["草稿.md"]);
    assert.equal(contextMenuButton(container, "复制绝对路径"), undefined);
  } finally {
    cleanup();
  }
});

test("文件夹节点右键菜单可复制绝对路径", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const copied: string[] = [];
  const {container, cleanup} = renderTreeNode({
    name: "资料",
    path: "资料",
    isDir: true,
    children: [],
  }, {
    onCopyAbsolutePath: (path) => copied.push(path),
  });

  try {
    act(() => {
      container.querySelector('[aria-label="资料"]')?.dispatchEvent(
        new window.MouseEvent("contextmenu", {bubbles: true, clientX: 20, clientY: 20}),
      );
    });

    const button = contextMenuButton(container, "复制绝对路径");
    assert.ok(button);
    act(() => button.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));

    assert.deepEqual(copied, ["资料"]);
  } finally {
    cleanup();
  }
});
