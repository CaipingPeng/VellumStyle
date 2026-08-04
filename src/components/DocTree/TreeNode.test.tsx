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
    onCreateIn: () => {},
    renameSignal: null,
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

test("文件夹节点 hover 显示新建文档/新建文件夹并回调对应目录", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const created: Array<[string, "doc" | "folder"]> = [];
  const {container, cleanup} = renderTreeNode({
    name: "素材",
    path: "素材",
    isDir: true,
    children: [],
  }, {
    onCreateIn: (dir, mode) => created.push([dir, mode]),
  });

  try {
    const newDoc = container.querySelector<SVGElement>('[title="新建文档"]');
    const newFolder = container.querySelector<SVGElement>('[title="新建文件夹"]');
    assert.ok(newDoc);
    assert.ok(newFolder);

    act(() => newDoc.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));
    act(() => newFolder.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));

    assert.deepEqual(created, [["素材", "doc"], ["素材", "folder"]]);
  } finally {
    cleanup();
  }
});

test("文件节点 hover 不显示新建按钮", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  });

  try {
    assert.equal(container.querySelector('[title="新建文档"]'), null);
    assert.equal(container.querySelector('[title="新建文件夹"]'), null);
  } finally {
    cleanup();
  }
});

test("收到 F2 重命名信号后文件节点进入编辑", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    renameSignal: {path: "草稿.md", token: 1},
  });

  try {
    assert.equal(container.querySelector<HTMLInputElement>("input")?.value, "草稿.md");
  } finally {
    cleanup();
  }
});

test("收到 F2 重命名信号后文件夹节点进入编辑", () => {
  (globalThis as typeof globalThis &{IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "素材",
    path: "素材",
    isDir: true,
    children: [],
  }, {
    renameSignal: {path: "素材", token: 1},
  });

  try {
    assert.equal(container.querySelector<HTMLInputElement>("input")?.value, "素材");
  } finally {
    cleanup();
  }
});

test("F2 重命名信号只命中对应路径的节点", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    renameSignal: {path: "其他.md", token: 1},
  });

  try {
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
