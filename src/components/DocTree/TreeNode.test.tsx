import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import TreeNode from "./TreeNode.tsx";
import type {DocNode} from "../../utils/documents.ts";

function renderTreeNode(node: DocNode) {
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
    onDragStartNode: () => {},
    onDragOverNode: () => {},
    onDropNode: () => {},
    onDraftChange: () => {},
    onDraftCommit: () => {},
    onDraftCancel: () => {},
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
