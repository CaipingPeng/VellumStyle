import assert from "node:assert/strict";
import {after, test} from "node:test";
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {build} from "esbuild";
import {readFile, unlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import type {DocNode} from "../../utils/documents.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

type StoreModule = typeof import("../../store/index.ts");
type DocTreeComponent = typeof import("./DocTree.tsx").default;

const TREE: DocNode[] = [
  {
    name: "素材",
    path: "素材",
    isDir: true,
    children: [{name: "图片.md", path: "素材/图片.md", isDir: false, children: []}],
  },
  {name: "草稿.md", path: "草稿.md", isDir: false, children: []},
];

// store 模块里 themes/index.ts 用了 Vite 的 import.meta.glob，node:test 跑不了，
// 和 publishFlow 测试一样先用 esbuild 打一个去掉 glob 的运行时包再加载。
const runtimeBundlePath = join(process.cwd(), "src", "components", "DocTree", `.docTree.runtime-${process.pid}.mjs`);
let runtime: {DocTree: DocTreeComponent; useStore: StoreModule["useStore"]} | null = null;

async function loadRuntimeModules() {
  if (!runtime) {
    const result = await build({
      stdin: {
        contents: [
          'export {default as DocTree} from "./src/components/DocTree/DocTree.tsx";',
          'export {useStore} from "./src/store/index.ts";',
        ].join("\n"),
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      packages: "external",
      plugins: [{
        name: "doc-tree-test-import-meta-glob",
        setup(pluginBuild) {
          pluginBuild.onLoad({filter: /src[\\/]themes[\\/]index\.ts$/}, async (args) => ({
            contents: (await readFile(args.path, "utf8")).replace(
              'import.meta.glob("./builtin/*.css", {query: "?raw", import: "default"})',
              "({})",
            ),
            loader: "ts",
          }));
          pluginBuild.onResolve({filter: /\.css\?raw$/}, (args) => ({
            path: args.path,
            namespace: "css-raw-stub",
          }));
          pluginBuild.onLoad({filter: /.*/, namespace: "css-raw-stub"}, () => ({
            contents: "export default '';",
            loader: "js",
          }));
        },
      }],
    });
    await writeFile(runtimeBundlePath, result.outputFiles[0].contents);
    const loaded = await import(`${pathToFileURL(runtimeBundlePath).href}?test=${Date.now()}`) as {
      DocTree: DocTreeComponent;
      useStore: StoreModule["useStore"];
    };
    runtime = {DocTree: loaded.DocTree, useStore: loaded.useStore};
  }
  return runtime;
}

after(async () => {
  await unlink(runtimeBundlePath).catch(() => undefined);
});

function renderDocTree(DocTreeComponent: DocTreeComponent) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<DocTreeComponent />);
  });
  return {
    container,
    panel: () => container.querySelector(".workspace-documents-panel") as HTMLElement,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function pressF2On(panel: HTMLElement) {
  act(() => {
    panel.dispatchEvent(new window.KeyboardEvent("keydown", {key: "F2", bubbles: true, cancelable: true}));
  });
}

test("选中文件后按 F2 进入重命名", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {container, panel, cleanup} = renderDocTree(DocTree);
  try {
    assert.equal(container.querySelector("input"), null);
    pressF2On(panel());
    assert.equal(container.querySelector<HTMLInputElement>("input")?.value, "草稿.md");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("选中文件夹后按 F2 进入重命名", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "素材", currentDocPath: null});
  const {container, panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    assert.equal(container.querySelector<HTMLInputElement>("input")?.value, "素材");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("未选中任何节点时按 F2 不进入重命名", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: null, currentDocPath: null});
  const {container, panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    assert.equal(container.querySelector("input"), null);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("焦点不在文件树面板上时按 F2 不触发重命名", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {container, cleanup} = renderDocTree(DocTree);
  try {
    const row = container.querySelector('[aria-label="草稿.md"]') as HTMLElement;
    act(() => {
      row.dispatchEvent(new window.KeyboardEvent("keydown", {key: "F2", bubbles: true, cancelable: true}));
    });
    assert.equal(container.querySelector("input"), null);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});
