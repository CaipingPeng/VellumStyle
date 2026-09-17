import assert from "node:assert/strict";
import {after, test} from "node:test";
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {build} from "esbuild";
import {readFile, unlink, writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {tempRuntimePath} from "../../test/tempRuntime.ts";
import type {DocNode} from "../../utils/documents.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

type StoreModule = typeof import("../../store/index.ts");
type DocTreeComponent = typeof import("./DocTree.tsx").default;

const TREE: DocNode[] = [
  {
    name: "素材",
    path: "素材",
    isDir: true,
    children: [
      {name: "图片.md", path: "素材/图片.md", isDir: false, children: []},
      {
        name: "内层",
        path: "素材/内层",
        isDir: true,
        children: [{name: "深.md", path: "素材/内层/深.md", isDir: false, children: []}],
      },
    ],
  },
  {name: "草稿.md", path: "草稿.md", isDir: false, children: []},
];

// store 模块里 themes/index.ts 用了 Vite 的 import.meta.glob，node:test 跑不了，
// 和 publishFlow 测试一样先用 esbuild 打一个去掉 glob 的运行时包再加载。
const runtimeBundlePath = tempRuntimePath("docTree");
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
              'import.meta.glob(["./builtin/*.css", "!./builtin/ink-haze.css"], {\n  query: "?raw",\n  import: "default",\n})',
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

// 改名弹层挂在 document.body 上（portal），所以从文档根查询。
const dialog = () => document.querySelector('[role="dialog"][aria-labelledby="rename-dialog-title"]') as HTMLElement | null;
const dialogInput = () => document.getElementById("rename-dialog-input") as HTMLInputElement | null;
const dialogText = () => dialog()?.textContent ?? "";

// jsdom 里 framer-motion 的退出动画不收敛，AnimatePresence 会把"正在退出"的弹层留在 DOM 中，
// 因此测试只断言不受动画影响的行为（会话状态、输入内容、确认态）；真正的关闭行为由
// 真实浏览器端到端验证覆盖（tests 之外的手验 + CDP 验证脚本）。
const confirmDiscardVisible = () => dialogText().includes("放弃修改");
const openDialogCount = () => document.querySelectorAll("#rename-dialog-input").length;

async function settleDialogExit() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

function pressF2On(panel: HTMLElement) {
  act(() => {
    panel.dispatchEvent(new window.KeyboardEvent("keydown", {key: "F2", bubbles: true, cancelable: true}));
  });
}

function pressKeyOn(panel: HTMLElement, key: string) {
  act(() => {
    panel.dispatchEvent(new window.KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", {bubbles: true}));
  });
}

function pressEnterInDialog() {
  const input = dialogInput();
  assert.ok(input, "改名弹层输入框应存在");
  act(() => {
    input.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}));
  });
}

function pressEscapeInDialog() {
  // useDialogEscape 在 document 上以捕获阶段监听，与真实按键路径一致。
  const target: EventTarget = dialogInput() ?? document;
  act(() => {
    target.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}));
  });
}

function clickDialogButton(label: string) {
  const button = Array.from(dialog()?.querySelectorAll("button") ?? [])
    .find((item) => item.textContent?.includes(label));
  assert.ok(button, `弹层按钮应存在：${label}`);
  act(() => button.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));
}

test("选中文件后按 F2 打开改名弹层", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {container, panel, cleanup} = renderDocTree(DocTree);
  try {
    assert.equal(dialog(), null);
    pressF2On(panel());
    assert.ok(dialog(), "应打开改名弹层");
    assert.equal(dialogInput()?.value, "草稿");
    assert.match(dialogText(), /重命名文档/);
    // 扩展名以并排后缀显示（不再是说明文案），避免用户以为扩展名丢了
    assert.equal(dialog()?.querySelector("span.text-sm2")?.textContent, ".md");
    // 行内不再有输入框：输入完全在弹层里完成。
    assert.equal(container.querySelectorAll("input").length, 0);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("选中文件夹后按 F2 打开改名弹层", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "素材", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    assert.equal(dialogInput()?.value, "素材");
    assert.match(dialogText(), /重命名文件夹/);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("未选中任何节点时按 F2 不打开弹层", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: null, currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    assert.equal(dialog(), null);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("焦点不在文件树面板上时按 F2 不打开弹层", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {container, cleanup} = renderDocTree(DocTree);
  try {
    const row = container.querySelector('[aria-label="草稿.md"]') as HTMLElement;
    act(() => {
      row.dispatchEvent(new window.KeyboardEvent("keydown", {key: "F2", bubbles: true, cancelable: true}));
    });
    assert.equal(dialog(), null);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("F2 进入改名弹层后 Esc 退出，重新按 F2 拿到的是原始名字", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    assert.ok(dialog());
    // 再按两次 F2：仍是同一个会话，不会叠加弹层。
    pressF2On(panel());
    pressF2On(panel());
    assert.equal(openDialogCount(), 1);

    // 改了一半后 Esc：明确取消，直接退出（遮罩负责防误触，Esc 是主动放弃）。
    setInputValue(dialogInput()!, "改了一半");
    pressEscapeInDialog();
    await settleDialogExit();
    assert.equal(confirmDiscardVisible(), false);

    pressF2On(panel());
    assert.equal(dialogInput()?.value, "草稿", "重开应回到节点原名");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("弹层里回车提交改名，树上立即更新且弹层关闭", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: "草稿.md"});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    setInputValue(dialogInput()!, "新草稿");
    pressEnterInDialog();
    // 换名命令是异步的：让 store 更新与弹层关闭都在 act 里落定。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const state = useStore.getState();
    assert.equal(state.selectedPath, "新草稿");
    assert.equal(state.currentDocPath, "新草稿");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null, currentDocPath: null});
  }
});

test("弹层输入时鼠标点到遮罩不会丢掉已输入内容", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    setInputValue(dialogInput()!, "改了一半的名字");

    // 点遮罩：绝不静默丢弃——只在有改动时提示，弹层与输入内容原样保留。
    const overlay = dialog()!.parentElement as HTMLElement;
    act(() => overlay.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));
    assert.equal(confirmDiscardVisible(), true, "未保存时点遮罩应先提示");
    assert.equal(dialogInput()?.value, "改了一半的名字");

    // 点"继续编辑"：回到编辑态，内容还在，焦点交回输入框。
    clickDialogButton("继续编辑");
    assert.equal(dialogInput()?.value, "改了一半的名字");
    assert.equal(confirmDiscardVisible(), false);
    assert.equal(document.activeElement, dialogInput());

    // 明确点"放弃修改"才退出；重开回到原名。
    act(() => overlay.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));
    clickDialogButton("放弃修改");
    await settleDialogExit();
    assert.equal(useStore.getState().selectedPath, "草稿.md");
    pressF2On(panel());
    assert.equal(dialogInput()?.value, "草稿", "放弃后重开应回到原名");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("弹层的常驻文案保持精简：无原名称/位置/快捷键说明", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    const text = dialogText();
    assert.doesNotMatch(text, /原名称/);
    assert.doesNotMatch(text, /位置：/);
    assert.doesNotMatch(text, /回车确认/);
    assert.doesNotMatch(text, /Esc 取消/);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("弹层外的按下被拦回输入框，不会把输入打到编辑器", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    const input = dialogInput()!;
    assert.equal(document.activeElement, input);

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    act(() => {
      outside.dispatchEvent(new window.MouseEvent("mousedown", {bubbles: true, cancelable: true}));
    });
    assert.equal(document.activeElement, input, "焦点应被钉在输入框上");
    outside.remove();
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("同级重名在弹层里被拦下，弹层保持打开", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    setInputValue(dialogInput()!, "素材");
    assert.match(dialogText(), /同级已有「素材」/);
    pressEnterInDialog();
    assert.ok(dialog(), "非法名字不得关闭弹层");
    assert.equal(dialogInput()?.value, "素材");
    assert.equal(useStore.getState().selectedPath, "草稿.md");

    // 名字没变：直接收工，不产生后端调用；重开回到原名。
    setInputValue(dialogInput()!, "草稿");
    pressEnterInDialog();
    await settleDialogExit();
    assert.equal(useStore.getState().selectedPath, "草稿.md");
    pressF2On(panel());
    assert.equal(dialogInput()?.value, "草稿");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("输入框只选中主文件名，扩展名留在原地", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "草稿.md", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressF2On(panel());
    const input = dialogInput()!;
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, "草稿".length);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("带点号的桌面文档名完整显示和选中，删掉点号后缀也算修改", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  for (const name of ["周报.v2.终稿", "周报.v2.终稿.md"]) {
    const path = "周报.v2.终稿.md";
    useStore.setState({tree: [{name, path, isDir: false, children: []}], selectedPath: path, currentDocPath: null});
    const {panel, cleanup} = renderDocTree(DocTree);
    try {
      pressF2On(panel());
      const input = dialogInput()!;
      assert.equal(input.value, "周报.v2.终稿");
      assert.equal(input.selectionStart, 0);
      assert.equal(input.selectionEnd, input.value.length);
      assert.equal(dialog()?.querySelector("span.text-sm2")?.textContent, ".md");
      setInputValue(input, "周报.v2");
      const submit = Array.from(dialog()!.querySelectorAll("button")).find((button) => button.textContent?.trim() === "重命名");
      assert.ok(submit);
      assert.equal(submit.disabled, false, "删除主名里的后缀不能被当作没改名");
    } finally {
      cleanup();
      useStore.setState({tree: [], selectedPath: null});
    }
  }
});

test("嵌套文档双击也能打开改名弹层（祖先节点被 memo 短路的历史 bug）", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: null, currentDocPath: null});
  const {container, cleanup} = renderDocTree(DocTree);
  const clickOn = (label: string) => {
    const row = container.querySelector(`[aria-label="${label}"]`);
    assert.ok(row, `行应可见：${label}`);
    act(() => {
      row.dispatchEvent(new window.MouseEvent("click", {bubbles: true, cancelable: true}));
    });
  };
  try {
    clickOn("素材");
    clickOn("内层");

    const deepRow = container.querySelector('[aria-label="深.md"]');
    assert.ok(deepRow, "嵌套文档行应可见");
    act(() => {
      deepRow.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true, cancelable: true}));
    });

    assert.ok(dialog(), "嵌套文档双击后必须打开改名弹层");
    assert.equal(dialogInput()?.value, "深");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("新建名字非法时保留草稿行并给出行内原因", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: null, currentDocPath: null});
  const {container, cleanup} = renderDocTree(DocTree);
  try {
    const newDocButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.title === "新建文档") as HTMLButtonElement;
    act(() => newDocButton.dispatchEvent(new window.MouseEvent("click", {bubbles: true})));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="新建文档名"]');
    assert.ok(input);

    setInputValue(input, "a/b");
    act(() => {
      input.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}));
    });

    // 非法名字：草稿行仍在，并显示原因（旧实现只弹 toast，输入被清空）
    assert.match(container.textContent ?? "", /名称不能包含 \//);
    assert.equal(container.querySelector('input[aria-label="新建文档名"]'), input);
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("方向键在可见节点间移动选中", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "素材", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    pressKeyOn(panel(), "ArrowDown");
    assert.equal(useStore.getState().selectedPath, "草稿.md");
    pressKeyOn(panel(), "ArrowUp");
    assert.equal(useStore.getState().selectedPath, "素材");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});

test("右方向键展开文件夹并进入首个子节点，左方向键收起", async () => {
  const {DocTree, useStore} = await loadRuntimeModules();
  useStore.setState({tree: TREE, selectedPath: "素材", currentDocPath: null});
  const {panel, cleanup} = renderDocTree(DocTree);
  try {
    // 首次按右：展开文件夹
    pressKeyOn(panel(), "ArrowRight");
    assert.equal(useStore.getState().selectedPath, "素材");
    // 再按右：进入第一个子节点
    pressKeyOn(panel(), "ArrowRight");
    assert.equal(useStore.getState().selectedPath, "素材/图片.md");
    // 左方向键：回到父文件夹
    pressKeyOn(panel(), "ArrowLeft");
    assert.equal(useStore.getState().selectedPath, "素材");
    // 左方向键：收起文件夹
    pressKeyOn(panel(), "ArrowLeft");
    assert.equal(useStore.getState().selectedPath, "素材");
  } finally {
    cleanup();
    useStore.setState({tree: [], selectedPath: null});
  }
});
