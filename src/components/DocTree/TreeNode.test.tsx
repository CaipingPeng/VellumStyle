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
    onStartRename: () => {},
    onDelete: () => {},
    onOpenLocation: () => {},
    onCopyAbsolutePath: () => {},
    onCreateIn: () => {},
    renameSession: null,
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

test("文件节点双击请求进入重命名", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const started: string[] = [];
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    onStartRename: (node) => started.push(node.path),
  });

  try {
    assert.equal(container.querySelector("input"), null);
    act(() => {
      container.querySelector('[aria-label="草稿.md"]')?.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true}));
    });

    assert.deepEqual(started, ["草稿.md"]);
  } finally {
    cleanup();
  }
});

test("文件夹节点双击同样进入重命名（Windows 习惯）", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const started: string[] = [];
  const {container, cleanup} = renderTreeNode({
    name: "素材",
    path: "素材",
    isDir: true,
    children: [],
  }, {
    onStartRename: (node) => started.push(node.path),
  });

  try {
    act(() => {
      container.querySelector('[aria-label="素材"]')?.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true}));
    });

    assert.deepEqual(started, ["素材"]);
  } finally {
    cleanup();
  }
});

test("改名中的行高亮自己，且不再渲染行内输入框（输入在弹层里）", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    renameSession: {path: "草稿.md", session: {path: "草稿.md", value: "新草稿.md", isDir: false, error: null, pending: false}},
  });

  try {
    const row = container.querySelector<HTMLElement>('[aria-label="草稿.md"]');
    assert.ok(row);
    assert.match(row.className, /bg-accent-subtle/);
    assert.match(row.style.outline, /dashed/);
    // 行内不再有输入框，改名输入由 RenameDialog 承担
    assert.equal(container.querySelectorAll("input").length, 0);
    // 改名中不可拖拽，避免与弹层操作打架
    assert.equal(row.getAttribute("draggable"), "false");
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

test("重命名会话目标不是本节点时保持只读展示", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    renameSession: {path: "其他.md", session: {path: "其他.md", value: "其他.md", isDir: false, error: null, pending: false}},
  });

  try {
    assert.equal(container.querySelectorAll("input").length, 0);
    assert.equal(container.querySelector('[aria-label="草稿.md"]')?.textContent, "草稿.md");
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

test("右键菜单第一项是重命名，点击后请求进入重命名会话", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const started: string[] = [];
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    onStartRename: (node) => started.push(node.path),
  });

  try {
    act(() => {
      container.querySelector('[aria-label="草稿.md"]')?.dispatchEvent(
        new window.MouseEvent("contextmenu", {bubbles: true, clientX: 20, clientY: 20}),
      );
    });

    const button = contextMenuButton(container, "重命名");
    assert.ok(button);
    act(() => button.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));

    assert.deepEqual(started, ["草稿.md"]);
  } finally {
    cleanup();
  }
});

test("改名中的行不响应再次双击，避免重复开会话", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const started: string[] = [];
  const {container, cleanup} = renderTreeNode({
    name: "草稿.md",
    path: "草稿.md",
    isDir: false,
    children: [],
  }, {
    renameSession: {path: "草稿.md", session: {path: "草稿.md", value: "草稿.md", isDir: false, error: null, pending: false}},
    onStartRename: (node) => started.push(node.path),
  });

  try {
    act(() => {
      container.querySelector('[aria-label="草稿.md"]')?.dispatchEvent(
        new window.MouseEvent("dblclick", {bubbles: true, cancelable: true}),
      );
    });
    assert.deepEqual(started, []);
  } finally {
    cleanup();
  }
});
