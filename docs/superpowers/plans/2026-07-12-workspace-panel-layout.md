# 工作区板块化布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 VellumStyle 的核心工作区改造成边界清晰的文档抽屉、大纲抽屉、编辑器面板与预览面板，并提供可访问、可持久化的编辑器/预览分栏调整。

**Architecture:** 保留 `App.tsx` 作为页面编排层，把分栏数学、分栏交互和编辑器面板外壳拆成三个聚焦模块。文档管理与大纲继续由现有两个独立布尔状态控制并以推挤式列参与布局；分栏比例单独写入 Zustand 持久化状态，预览模式与浮动 `StylePanel` 不参与外层宽度计算。

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS, Node test runner, JSDOM.

---

## 实施约束与文件地图

实施前阅读：

- 设计依据：`docs/superpowers/specs/2026-07-12-workspace-panel-layout-design.md`
- 当前页面编排：`src/App.tsx:448-525`
- 当前持久化状态：`src/store/index.ts:14-255`
- 文档抽屉尺寸范式：`src/components/DocTree/docTreeLayout.ts`
- 参考项目仅用于视觉和交互启发：`D:/Backup/Downloads/r-markdown-main/src/views/editor/EditorPage.vue:1498-1798`

最终文件职责：

- Create `src/components/Workspace/workspaceSplitLayout.ts`：默认比例、合法化、动态边界、像素换算和键盘步进纯函数；不依赖 React 或 store。
- Create `src/components/Workspace/workspaceSplitLayout.test.ts`：覆盖宽窗口、窄窗口、非法持久化值和键盘调整。
- Modify `src/store/index.ts`：增加持久化的 `workspaceSplitRatio` 和 setter；不持久化两个抽屉状态。
- Create `src/store/workspaceSplitState.test.ts`：验证初值、setter 和 partialize 白名单。
- Create `src/components/Workspace/WorkspaceSplit.tsx`：测量核心区域并实现指针、键盘、双击和 separator 可访问性。
- Create `src/components/Workspace/WorkspaceSplit.test.ts`：用 JSDOM 驱动组件交互。测试文件保持 `.test.ts`，因为当前 `npm test` 不匹配 `.test.tsx`。
- Create `src/components/Workspace/EditorWorkspacePanel.tsx`：编辑器专用圆角面板与局部工具栏，组合现有 `SyntaxToolbar` 和 `MarkdownEditor`。
- Create `src/components/Workspace/EditorWorkspacePanel.test.ts`：验证编辑器标题栏语义和工具栏归属。
- Modify `src/App.tsx`：维持 `DocTree → OutlineNav → Editor → Preview` 顺序，用 Framer Motion 为两个抽屉提供互不排斥的克制过渡，并接入工作区框架和分栏组件。
- Create `src/App.workspaceLayout.test.ts`：用源码结构回归保护全局顶栏、编辑器标题栏、预览和状态栏的归属关系。
- Modify `src/styles/globals.css`：增加工作区语义令牌、面板焦点样式、拖动状态和 reduced-motion 降级。

不新增万能 `Panel` 组件，不改变 `PreviewModeToggle`、同步滚动、文档树自身调宽、`OutlineNav` 跳转或 `StylePanel` 浮动定位逻辑。

## 测试命令说明

当前脚本是：

```json
"test": "node --import tsx --import ./src/test/setupDom.ts --test \"src/**/*.test.ts\""
```

因此所有新增测试必须以 `.test.ts` 结尾。需要测试 TSX 组件时使用 `React.createElement(...)`，不要把文件命名为 `.test.tsx`。单文件测试统一使用：

```powershell
node --import tsx --import ./src/test/setupDom.ts --test <exact-test-path>
```

---

### Task 1: 建立纯分栏布局模型

**Files:**
- Create: `src/components/Workspace/workspaceSplitLayout.ts`
- Create: `src/components/Workspace/workspaceSplitLayout.test.ts`

- [ ] **Step 1: 写默认值、非法值和宽窗口约束的失败测试**

```ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {
  DEFAULT_WORKSPACE_SPLIT_RATIO,
  getWorkspaceRatioBounds,
  sanitizeWorkspaceSplitRatio,
} from "./workspaceSplitLayout.ts";

test("工作区分栏比例为归一化值且非法持久化值回退默认值", () => {
  assert.equal(DEFAULT_WORKSPACE_SPLIT_RATIO, 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(Number.NaN), 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(Number.POSITIVE_INFINITY), 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(-1), 0.5);
  assert.equal(sanitizeWorkspaceSplitRatio(3), 0.5);
});

test("宽工作区按面板最小宽度给出动态比例边界", () => {
  assert.deepEqual(getWorkspaceRatioBounds(1008), {min: 0.28, max: 0.72});
});
```

这里 `1008` 包括 `8px` 分隔柄，可分配面板宽度为 `1000px`；每侧最小 `280px`，所以边界是 `0.28..0.72`。

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/components/Workspace/workspaceSplitLayout.test.ts
```

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND` 或缺少导出。

- [ ] **Step 3: 实现常量、合法化和动态边界的最小版本**

```ts
export const DEFAULT_WORKSPACE_SPLIT_RATIO = 0.5;
export const MIN_PERSISTED_WORKSPACE_SPLIT_RATIO = 0.2;
export const MAX_PERSISTED_WORKSPACE_SPLIT_RATIO = 0.8;
export const MIN_WORKSPACE_PANE_WIDTH = 280;
export const WORKSPACE_SEPARATOR_WIDTH = 8;
export const WORKSPACE_KEYBOARD_STEP = 0.02;
export const WORKSPACE_KEYBOARD_LARGE_STEP = 0.1;

export interface WorkspaceRatioBounds {
  min: number;
  max: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeWorkspaceSplitRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WORKSPACE_SPLIT_RATIO;
  }
  if (
    value < MIN_PERSISTED_WORKSPACE_SPLIT_RATIO ||
    value > MAX_PERSISTED_WORKSPACE_SPLIT_RATIO
  ) {
    return DEFAULT_WORKSPACE_SPLIT_RATIO;
  }
  return value;
}

export function getWorkspaceRatioBounds(containerWidth: number): WorkspaceRatioBounds {
  const paneWidth = Math.max(containerWidth - WORKSPACE_SEPARATOR_WIDTH, 0);
  if (paneWidth <= 0 || paneWidth < MIN_WORKSPACE_PANE_WIDTH * 2) {
    return {min: 0.5, max: 0.5};
  }
  const min = MIN_WORKSPACE_PANE_WIDTH / paneWidth;
  return {
    min: Math.max(MIN_PERSISTED_WORKSPACE_SPLIT_RATIO, min),
    max: Math.min(MAX_PERSISTED_WORKSPACE_SPLIT_RATIO, 1 - min),
  };
}
```

窄窗口无法同时满足两个 `280px` 最小宽度时退化为均分剩余空间；绝不通过自动关闭抽屉来腾空间。

- [ ] **Step 4: 增加换算、窄窗口和键盘行为的失败测试**

```ts
import {
  clampWorkspaceSplitRatio,
  getWorkspacePaneWidths,
  ratioFromPointer,
  stepWorkspaceSplitRatio,
} from "./workspaceSplitLayout.ts";

test("比例和像素换算忽略 8px 分隔柄并受实时宽度约束", () => {
  assert.deepEqual(getWorkspacePaneWidths(0.6, 1008), {
    editor: 600,
    preview: 400,
  });
  assert.equal(ratioFromPointer(700, 100, 1008), 0.6);
  assert.equal(ratioFromPointer(-1000, 100, 1008), 0.28);
});

test("不足双侧最小宽度时均分而不关闭抽屉", () => {
  assert.deepEqual(getWorkspaceRatioBounds(508), {min: 0.5, max: 0.5});
  assert.equal(clampWorkspaceSplitRatio(0.8, 508), 0.5);
  assert.deepEqual(getWorkspacePaneWidths(0.8, 508), {
    editor: 250,
    preview: 250,
  });
});

test("键盘支持小步、大步和 Home 恢复默认比例", () => {
  assert.equal(stepWorkspaceSplitRatio(0.5, "ArrowRight", 1008, false), 0.52);
  assert.equal(stepWorkspaceSplitRatio(0.5, "ArrowLeft", 1008, true), 0.4);
  assert.equal(stepWorkspaceSplitRatio(0.7, "Home", 1008, false), 0.5);
  assert.equal(stepWorkspaceSplitRatio(0.5, "Enter", 1008, false), null);
});
```

- [ ] **Step 5: 实现换算和键盘步进**

实现以下精确 API：

```ts
export function clampWorkspaceSplitRatio(ratio: unknown, containerWidth: number): number;
export function getWorkspacePaneWidths(
  ratio: unknown,
  containerWidth: number,
): {editor: number; preview: number};
export function ratioFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
): number;
export function stepWorkspaceSplitRatio(
  ratio: number,
  key: string,
  containerWidth: number,
  largeStep: boolean,
): number | null;
```

算法要求：

```ts
export function clampWorkspaceSplitRatio(ratio: unknown, containerWidth: number): number {
  const safeRatio = sanitizeWorkspaceSplitRatio(ratio);
  const bounds = getWorkspaceRatioBounds(containerWidth);
  return clamp(safeRatio, bounds.min, bounds.max);
}

export function getWorkspacePaneWidths(ratio: unknown, containerWidth: number) {
  const distributable = Math.max(containerWidth - WORKSPACE_SEPARATOR_WIDTH, 0);
  const safeRatio = clampWorkspaceSplitRatio(ratio, containerWidth);
  const editor = Math.round(distributable * safeRatio);
  return {editor, preview: distributable - editor};
}

export function ratioFromPointer(clientX: number, containerLeft: number, containerWidth: number) {
  const distributable = Math.max(containerWidth - WORKSPACE_SEPARATOR_WIDTH, 1);
  const bounds = getWorkspaceRatioBounds(containerWidth);
  return clamp((clientX - containerLeft) / distributable, bounds.min, bounds.max);
}
```

`stepWorkspaceSplitRatio` 只处理 `ArrowLeft`、`ArrowRight` 和 `Home`；箭头使用 `0.02`，`Shift` 或 `Alt` 修饰时由调用者传入 `largeStep=true` 使用 `0.1`，最终调用动态 clamp。其他按键返回 `null`。

- [ ] **Step 6: 运行纯函数测试**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/components/Workspace/workspaceSplitLayout.test.ts
```

Expected: PASS，3 个测试组全部通过且无未处理异常。

- [ ] **Step 7: 提交纯布局模型**

```powershell
git add src/components/Workspace/workspaceSplitLayout.ts src/components/Workspace/workspaceSplitLayout.test.ts
git commit -m "feat: add workspace split layout model"
```

---

### Task 2: 将分栏比例加入 Zustand 持久化状态

**Files:**
- Modify: `src/store/index.ts:1-35,176-215,248-255`
- Create: `src/store/workspaceSplitState.test.ts`

- [ ] **Step 1: 写 store 状态和持久化白名单的失败测试**

```ts
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";
import {DEFAULT_WORKSPACE_SPLIT_RATIO} from "../components/Workspace/workspaceSplitLayout.ts";
import {useStore} from "./index.ts";

test("工作区分栏比例有默认值并可通过动作更新", () => {
  useStore.setState({workspaceSplitRatio: DEFAULT_WORKSPACE_SPLIT_RATIO});
  useStore.getState().setWorkspaceSplitRatio(0.62);
  assert.equal(useStore.getState().workspaceSplitRatio, 0.62);
});

test("只持久化分栏比例而不持久化两个抽屉开关", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  const partialize = source.slice(source.indexOf("partialize:"));
  assert.match(partialize, /workspaceSplitRatio: s\.workspaceSplitRatio/);
  assert.match(partialize, /merge:/);
  assert.match(partialize, /sanitizeWorkspaceSplitRatio\(saved\?\.workspaceSplitRatio\)/);
  assert.doesNotMatch(partialize, /sidebarOpen:/);
  assert.doesNotMatch(partialize, /outlineOpen:/);
});
```

- [ ] **Step 2: 运行测试并确认类型/动作缺失导致失败**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/store/workspaceSplitState.test.ts
```

Expected: FAIL，提示 `setWorkspaceSplitRatio is not a function` 或相应类型错误。

- [ ] **Step 3: 修改 store**

在 `src/store/index.ts` 引入：

```ts
import {
  DEFAULT_WORKSPACE_SPLIT_RATIO,
  sanitizeWorkspaceSplitRatio,
} from "../components/Workspace/workspaceSplitLayout.ts";
```

在 `EditorState` 中加入：

```ts
workspaceSplitRatio: number; // 编辑器/预览外层分栏比例，persist
setWorkspaceSplitRatio: (ratio: number) => void;
```

在初始化对象中加入：

```ts
workspaceSplitRatio: DEFAULT_WORKSPACE_SPLIT_RATIO,
setWorkspaceSplitRatio: (workspaceSplitRatio) =>
  set({workspaceSplitRatio: sanitizeWorkspaceSplitRatio(workspaceSplitRatio)}),
```

在 `partialize` 返回对象中加入：

```ts
workspaceSplitRatio: s.workspaceSplitRatio,
```

并在 persist options 加入恢复期合法化，避免损坏的 localStorage 值进入运行态：

```ts
merge: (persisted, current) => {
  const saved = persisted as Partial<EditorState> | undefined;
  return {
    ...current,
    ...saved,
    workspaceSplitRatio: sanitizeWorkspaceSplitRatio(saved?.workspaceSplitRatio),
  };
},
```

测试中的源码断言还应匹配 `merge:` 与 `sanitizeWorkspaceSplitRatio(saved?.workspaceSplitRatio)`。不要把 `sidebarOpen` 或 `outlineOpen` 加入 `partialize`；因为 `partialize` 不保存它们，`...saved` 不会覆盖两个抽屉的运行期默认值。UI 纯函数仍保留二次防御。

- [ ] **Step 4: 运行 store 与纯布局测试**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/store/workspaceSplitState.test.ts src/components/Workspace/workspaceSplitLayout.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交 store 变更**

```powershell
git add src/store/index.ts src/store/workspaceSplitState.test.ts
git commit -m "feat: persist workspace split ratio"
```

---

### Task 3: 实现可访问的核心分栏组件

**Files:**
- Create: `src/components/Workspace/WorkspaceSplit.tsx`
- Create: `src/components/Workspace/WorkspaceSplit.test.ts`

- [ ] **Step 1: 写基础渲染和 separator 语义的失败测试**

测试用 `React.createElement`，并在文件内定义最小 `ResizeObserver` stub。渲染前把容器的 `getBoundingClientRect()` 固定为 `{left: 100, width: 1008}`，触发 observer callback。

```ts
assert.equal(separator.getAttribute("role"), "separator");
assert.equal(separator.getAttribute("aria-orientation"), "vertical");
assert.equal(separator.getAttribute("aria-label"), "调整编辑器和预览宽度");
assert.equal(separator.tabIndex, 0);
assert.equal(separator.getAttribute("aria-valuenow"), "50");
assert.equal(container.querySelector('[data-workspace-pane="editor"]')?.getAttribute("style"), "width: 500px;");
assert.equal(container.querySelector('[data-workspace-pane="preview"]')?.getAttribute("style"), "width: 500px;");
```

Props 固定为：

```ts
interface WorkspaceSplitProps {
  ratio: number;
  onRatioCommit: (ratio: number) => void;
  editor: ReactNode;
  preview: ReactNode;
}
```

- [ ] **Step 2: 运行测试并确认组件不存在**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/components/Workspace/WorkspaceSplit.test.ts
```

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现测量、面板宽度和 separator 语义**

组件结构保持：

```tsx
<div ref={containerRef} className="flex min-h-0 min-w-0 flex-1" data-workspace-split>
  <div className="min-h-0 min-w-0 flex-none" data-workspace-pane="editor" style={{width: editor}}>
    {editor}
  </div>
  <div
    role="separator"
    aria-label="调整编辑器和预览宽度"
    aria-orientation="vertical"
    aria-valuemin={Math.round(bounds.min * 100)}
    aria-valuemax={Math.round(bounds.max * 100)}
    aria-valuenow={Math.round(displayRatio * 100)}
    tabIndex={0}
    className="workspace-split-separator flex-none"
  />
  <div className="min-h-0 min-w-0 flex-none" data-workspace-pane="preview" style={{width: preview}}>
    {preview}
  </div>
</div>
```

用 `ResizeObserver` 更新 `containerWidth`；首次渲染宽度为 0 时让两个 pane 使用 `flex: 1 1 0`，测量后才写像素宽度，避免首帧都变成 0。显示比例使用局部 `draftRatio`，当没有拖动时同步外部 `ratio`。

- [ ] **Step 4: 写键盘和双击恢复测试**

```ts
act(() => separator.dispatchEvent(new window.KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true})));
assert.equal(commits.at(-1), 0.52);

act(() => separator.dispatchEvent(new window.KeyboardEvent("keydown", {key: "ArrowLeft", shiftKey: true, bubbles: true})));
assert.equal(commits.at(-1), 0.42);

act(() => separator.dispatchEvent(new window.MouseEvent("dblclick", {bubbles: true})));
assert.equal(commits.at(-1), DEFAULT_WORKSPACE_SPLIT_RATIO);
```

还要断言受处理键调用 `preventDefault`，`Enter` 不提交。

- [ ] **Step 5: 实现键盘与双击交互**

- `ArrowLeft`/`ArrowRight` 调用 `stepWorkspaceSplitRatio`。
- `event.shiftKey || event.altKey` 选择大步进。
- `Home` 和双击都恢复 `DEFAULT_WORKSPACE_SPLIT_RATIO`，再根据当前宽度约束。
- 键盘和双击立即同时更新 draft 并调用 `onRatioCommit`。
- 提供 `title="拖动或用方向键调整；双击恢复默认"`。

- [ ] **Step 6: 写指针拖动、取消和卸载清理测试**

在 separator 上 stub：

```ts
separator.setPointerCapture = (pointerId) => captures.push(pointerId);
separator.releasePointerCapture = (pointerId) => releases.push(pointerId);
```

依次派发带 `pointerId` 和 `clientX` 的 `pointerdown`、`pointermove`、`pointerup`，验证：

- move 时 pane 宽度即时变化，但 `onRatioCommit` 尚未调用；
- up 时仅提交一次最后比例；
- `document.documentElement` 在拖动时带 `workspace-is-resizing`，结束后移除；
- `pointercancel` 清理并提交最后合法比例；
- 拖动中 unmount 也移除 class，且不会在卸载后提交。

- [ ] **Step 7: 实现可靠的 Pointer Events 生命周期**

实现要求：

- `pointerdown` 只接受主按钮，记录 pointer id，调用 `setPointerCapture`。
- 事件绑定在 separator 自身：`onPointerMove`、`onPointerUp`、`onPointerCancel`。
- move 用容器实时 rect 调用 `ratioFromPointer`，只更新 draft。
- up/cancel 调用一个幂等 `finishDrag(commit: boolean)`；up/cancel 提交最后值，unmount 只清理不提交。
- 释放 pointer capture 包在 `try/catch` 中。
- 拖动期间给 `document.documentElement` 加 `workspace-is-resizing`，CSS 负责 `user-select: none; cursor: col-resize`。
- 分隔柄视觉线可为 `1px`，实际命中宽度必须是常量对应的 `8px`。

- [ ] **Step 8: 运行组件与纯函数测试**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/components/Workspace/WorkspaceSplit.test.ts src/components/Workspace/workspaceSplitLayout.test.ts
```

Expected: PASS；测试结束后 `document.documentElement.classList.contains("workspace-is-resizing")` 为 false。

- [ ] **Step 9: 提交分栏组件**

```powershell
git add src/components/Workspace/WorkspaceSplit.tsx src/components/Workspace/WorkspaceSplit.test.ts
git commit -m "feat: add accessible workspace splitter"
```

---

### Task 4: 创建编辑器专用面板与局部工具栏

**Files:**
- Create: `src/components/Workspace/EditorWorkspacePanel.tsx`
- Create: `src/components/Workspace/EditorWorkspacePanel.test.ts`

- [ ] **Step 1: 写编辑器局部标题栏结构的失败测试**

渲染组件时传入最小 props 和 `createRef<MarkdownEditorHandle>()`。为避免在这个单元中挂载 CodeMirror，组件 API 应允许注入 `editor` 节点，同时由 App 传入真实 `MarkdownEditor`：

```ts
interface EditorWorkspacePanelProps {
  editorRef: RefObject<MarkdownEditorHandle>;
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  onOpenMaterialLibrary: () => void;
  children: ReactNode;
}
```

断言：

```ts
assert.ok(container.querySelector('[data-workspace-panel="editor"]'));
assert.equal(container.querySelectorAll('[data-editor-toolbar]').length, 1);
assert.equal(container.querySelector('[data-editor-toolbar]')?.getAttribute("aria-label"), "编辑器工具栏");
assert.equal(container.querySelectorAll('[data-editor-content]').length, 1);
assert.equal(container.textContent?.includes("预览"), false);
```

- [ ] **Step 2: 运行测试并确认组件不存在**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/components/Workspace/EditorWorkspacePanel.test.ts
```

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现编辑器面板壳**

组件结构：

```tsx
<section
  aria-label="Markdown 编辑器"
  data-workspace-panel="editor"
  className="workspace-panel workspace-editor-panel flex h-full min-h-0 flex-col overflow-hidden"
>
  <div
    role="toolbar"
    aria-label="编辑器工具栏"
    data-editor-toolbar
    className="flex min-h-10 flex-none items-center overflow-x-auto border-b border-border px-2"
  >
    <SyntaxToolbar
      editorRef={editorRef}
      onPickFile={onPickFile}
      onPickLocal={onPickLocal}
      onOpenMaterialLibrary={onOpenMaterialLibrary}
    />
  </div>
  <div data-editor-content className="min-h-0 min-w-0 flex-1 overflow-hidden">
    {children}
  </div>
</section>
```

不要为预览新增标题栏，不要改 `SyntaxToolbar` 的命令实现。

- [ ] **Step 4: 运行测试**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/components/Workspace/EditorWorkspacePanel.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交编辑器面板壳**

```powershell
git add src/components/Workspace/EditorWorkspacePanel.tsx src/components/Workspace/EditorWorkspacePanel.test.ts
git commit -m "feat: add editor workspace panel"
```

---

### Task 5: 接入 App 并保护抽屉、工具栏和预览归属

**Files:**
- Modify: `src/App.tsx:1-20,448-525`
- Create: `src/App.workspaceLayout.test.ts`

- [ ] **Step 1: 写页面结构源码回归测试**

读取 `App.tsx`，提取 `return (` 后的页面 JSX，验证：

```ts
const docTree = source.indexOf("{sidebarOpen && <DocTree />}");
const outline = source.indexOf("{outlineOpen && (");
const split = source.indexOf("<WorkspaceSplit");
assert.ok(docTree >= 0 && outline > docTree && split > outline);

const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
assert.doesNotMatch(header, /<SyntaxToolbar/);
assert.match(header, /aria-pressed=\{sidebarOpen\}/);
assert.match(header, /aria-pressed=\{outlineOpen\}/);

const footer = source.slice(source.indexOf("<footer"), source.indexOf("</footer>"));
assert.match(footer, /<PreviewModeToggle variant="status"/);

assert.match(source, /data-workspace-panel="preview"/);
assert.doesNotMatch(source, /data-preview-toolbar/);
assert.ok(source.indexOf("<StylePanel />") > source.indexOf("<Preview"));
assert.match(source, /<AnimatePresence initial=\{false\}>/);
assert.match(source, /key="documents"/);
assert.match(source, /key="outline"/);
```

此测试保护用户明确决定的组件归属；不要用它锁死每个 Tailwind class。

- [ ] **Step 2: 运行测试并确认当前结构不符合要求**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/App.workspaceLayout.test.ts
```

Expected: FAIL，至少因为 `SyntaxToolbar` 仍在 header 且 `WorkspaceSplit` 不存在。

- [ ] **Step 3: 在 App 读取新 store 状态并更换 imports**

增加：

```ts
import WorkspaceSplit from "./components/Workspace/WorkspaceSplit.tsx";
import EditorWorkspacePanel from "./components/Workspace/EditorWorkspacePanel.tsx";
import {AnimatePresence, motion, useReducedMotion} from "framer-motion";
```

删除 App 对 `SyntaxToolbar` 的直接 import。在 App 组件中调用 `const reduceMotion = useReducedMotion()`，并定义短促 drawer transition：正常时约 `140ms`，减少动态效果时 `duration: 0`。沿用 App 当前的 Zustand selector 风格，读出：

```ts
const workspaceSplitRatio = useStore((s) => s.workspaceSplitRatio);
const setWorkspaceSplitRatio = useStore((s) => s.setWorkspaceSplitRatio);
```

- [ ] **Step 4: 重组主工作区 JSX**

全局 header 内仅保留文档/大纲开关和 `MainToolbar`，删除其中的 `SyntaxToolbar`。

主区域保持精确层级：

```tsx
<main className="workspace-frame relative flex min-h-0 flex-1 gap-2 p-2.5">
  <AnimatePresence initial={false}>
    {sidebarOpen && (
      <motion.div
        key="documents"
        className="flex min-h-0 flex-none overflow-hidden"
        initial={{width: 0, x: -8, opacity: 0}}
        animate={{width: "auto", x: 0, opacity: 1}}
        exit={{width: 0, x: -8, opacity: 0}}
        transition={drawerTransition}
      >
        <DocTree />
      </motion.div>
    )}
  </AnimatePresence>
  <AnimatePresence initial={false}>
    {outlineOpen && (
      <motion.div
        key="outline"
        className="flex min-h-0 flex-none overflow-hidden"
        initial={{width: 0, x: -8, opacity: 0}}
        animate={{width: "auto", x: 0, opacity: 1}}
        exit={{width: 0, x: -8, opacity: 0}}
        transition={drawerTransition}
      >
        <OutlineNav
          items={outlineItems}
          activeLine={activeOutlineLine}
          onJump={handleOutlineJump}
        />
      </motion.div>
    )}
  </AnimatePresence>
  <WorkspaceSplit
    ratio={workspaceSplitRatio}
    onRatioCommit={setWorkspaceSplitRatio}
    editor={
      <EditorWorkspacePanel
        editorRef={editorRef}
        onPickFile={handleUploadFile}
        onPickLocal={handleUploadLocal}
        onOpenMaterialLibrary={handleOpenImageMaterialPicker}
      >
        <MarkdownEditor
          ref={editorRef}
          value={content}
          documentKey={currentDocPath}
          onChange={setContent}
          onPasteImage={handleUploadFile}
        />
      </EditorWorkspacePanel>
    }
    preview={
      <div className="relative flex h-full min-h-0 min-w-0">
        <section
          aria-label="文章预览"
          data-workspace-panel="preview"
          className="workspace-panel flex min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          <div className="min-w-0 flex-1">
            <Preview
              ref={previewRef}
              content={content}
              markdownThemeId={markdownThemeId}
              onResizeImage={handleResizePreviewImage}
            />
          </div>
        </section>
        <StylePanel />
      </div>
    }
  />
</main>
```

`StylePanel` 特意放在预览 section 的同级而不是圆角 `overflow-hidden` surface 内，避免浮动 Inspector 被裁剪或变成常规列。两个抽屉必须使用两个独立的 `AnimatePresence`/条件分支，不写 `else`；关闭动画完成后才退出横向布局，不因宽度变化调用 `toggleSidebar`/`toggleOutline`。

- [ ] **Step 5: 运行 App 结构回归和相关现有测试**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/App.workspaceLayout.test.ts src/components/DocTree/docTreeLayout.test.ts src/components/Preview/previewModes.test.ts src/utils/outline.test.ts src/utils/syncScroll.test.ts
```

Expected: PASS；抽屉、内部预览模式、大纲和同步滚动回归均通过。

- [ ] **Step 6: 提交 App 接线**

```powershell
git add src/App.tsx src/App.workspaceLayout.test.ts
git commit -m "feat: wire paneled workspace layout"
```

---

### Task 6: 增加语义视觉令牌、焦点态和 reduced-motion 降级

**Files:**
- Modify: `src/styles/globals.css:1-55` and append workspace component rules
- Create: `src/styles/workspaceStyle.test.ts`

- [ ] **Step 1: 写语义令牌和交互状态的失败测试**

```ts
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

test("工作区使用语义令牌并提供焦点、拖动和减少动态效果规则", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
  assert.match(css, /--workspace-frame:/);
  assert.match(css, /--workspace-panel:/);
  assert.match(css, /--workspace-panel-border:/);
  assert.match(css, /--workspace-panel-radius: 10px/);
  assert.match(css, /\.workspace-editor-panel:focus-within/);
  assert.match(css, /\.workspace-split-separator:focus-visible/);
  assert.match(css, /\.workspace-is-resizing/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
```

- [ ] **Step 2: 运行测试并确认缺少样式**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/styles/workspaceStyle.test.ts
```

Expected: FAIL，提示缺少 `--workspace-frame`。

- [ ] **Step 3: 添加工作区语义令牌**

在 `:root` 加入：

```css
--workspace-frame: #f1f1f4;
--workspace-panel: #ffffff;
--workspace-panel-border: #dedee5;
--workspace-panel-active: rgba(94, 106, 210, 0.52);
--workspace-panel-radius: 10px;
```

不要为此修改 Tailwind config；新增组件使用稳定的语义 class，避免散布任意颜色值。

- [ ] **Step 4: 添加工作区组件样式**

```css
.workspace-frame {
  background: var(--workspace-frame);
}

.workspace-panel {
  box-sizing: border-box;
  border: 1px solid var(--workspace-panel-border);
  border-radius: var(--workspace-panel-radius);
  background: var(--workspace-panel);
  transition: border-color 130ms var(--ease);
}

.workspace-editor-panel:focus-within {
  border-color: var(--workspace-panel-active);
}

.workspace-split-separator {
  position: relative;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
  outline: none;
}

.workspace-split-separator::before {
  content: "";
  position: absolute;
  inset-block: 10px;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: var(--border-strong);
  transition: background-color 130ms var(--ease), width 130ms var(--ease);
}

.workspace-split-separator:hover::before,
.workspace-split-separator:focus-visible::before {
  width: 2px;
  background: var(--accent);
}

.workspace-split-separator:focus-visible {
  box-shadow: inset 0 0 0 2px var(--ring);
  border-radius: var(--radius-sm);
}

html.workspace-is-resizing,
html.workspace-is-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .workspace-panel,
  .workspace-split-separator::before {
    transition: none;
  }
}
```

保持面板轻边框，不新增明显阴影。编辑器标题栏本身继续使用现有 `--border`。

- [ ] **Step 5: 运行样式、组件和 App 结构测试**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test src/styles/workspaceStyle.test.ts src/components/Workspace/WorkspaceSplit.test.ts src/components/Workspace/EditorWorkspacePanel.test.ts src/App.workspaceLayout.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交样式**

```powershell
git add src/styles/globals.css src/styles/workspaceStyle.test.ts
git commit -m "style: define paneled workspace surfaces"
```

---

### Task 7: 全量验证与人工验收

**Files:**
- Verify only; modify only files from Tasks 1-6 if verification exposes a defect

- [ ] **Step 1: 检查未提交差异和格式错误**

Run:

```powershell
git status --short
git diff --check
```

Expected: `git diff --check` 无输出。若前面每任务已提交，`git status --short` 为空。

- [ ] **Step 2: 运行完整自动化测试**

Run:

```powershell
npm test
```

Expected: exit code 0；所有 `src/**/*.test.ts` 通过。特别确认输出中出现：

- `workspaceSplitLayout.test.ts`
- `workspaceSplitState.test.ts`
- `WorkspaceSplit.test.ts`
- `EditorWorkspacePanel.test.ts`
- `App.workspaceLayout.test.ts`
- `workspaceStyle.test.ts`

若某个测试没有出现在输出中，先修正文件名或 test glob，不能把“未执行”当作通过。

- [ ] **Step 3: 运行生产构建**

Run:

```powershell
npm run build
```

Expected: TypeScript build 与 Vite build 均 exit code 0，无 TS 类型错误。

- [ ] **Step 4: 启动应用进行桌面视觉验收**

Run:

```powershell
npm run dev
```

在浏览器或 Tauri WebView 中逐项检查：

1. `1200×800` 默认窗口：主体四周约 `10px` inset，核心面板间约 `8px` gap。
2. 只有编辑器存在局部标题栏，Markdown 命令均可用；全局顶栏不再拥挤。
3. 预览没有标题栏；状态栏的三种 `PreviewModeToggle` 均正常。
4. 文档管理关闭/大纲关闭。
5. 仅文档管理打开。
6. 仅大纲打开。
7. 两者同时打开，顺序稳定为 `DocTree → OutlineNav → Editor → Preview`，且都推挤而非覆盖。
8. 调到 Tauri 最小宽度 `800px`，两个抽屉不被自动关闭；核心区按剩余宽度安全退化。
9. 指针拖动分隔柄时无文本误选，释放和移出窗口后 cursor/user-select 恢复。
10. separator 聚焦后方向键小步调整，Shift/Alt+方向键大步调整，Home 与双击恢复 50%。
11. 刷新/重启后恢复上次提交的分栏比例；抽屉仍按既有逻辑默认关闭。
12. 流式/微信桌面/手机三种内部预览宽度不改写外层分栏比例。
13. 同步滚动、预览图片调整、文档树调宽、大纲跳转正常。
14. 点击预览元素打开 `StylePanel` 时，Inspector 仍浮动，不挤压列、不改写比例。
15. 用键盘 Tab 能清楚看到 separator 和编辑器面板焦点提示；系统“减少动态效果”开启时无新增过渡。

- [ ] **Step 5: 若人工验收发现缺陷，先写回归测试再做最小修复**

遵循 `@superpowers:systematic-debugging` 和 `@superpowers:test-driven-development`：复现、定位根因、添加失败测试、最小修复、重跑聚焦测试。不要通过自动关闭抽屉、移走状态栏切换器或把 `StylePanel` 改成固定列来绕开布局问题。

- [ ] **Step 6: 最终复验**

Run:

```powershell
npm test
npm run build
git diff --check
git status --short
```

Expected: 测试和构建 exit code 0，`git diff --check` 无输出；只存在经过审查的预期改动。

- [ ] **Step 7: 提交仅由验收产生的修复（如有）**

```powershell
git add <仅列出实际修复文件>
git commit -m "fix: harden workspace panel layout"
```

若没有修复，不创建空提交。

---

## 完成定义

只有同时满足以下条件才算完成：

- 编辑器与预览是两个视觉明确、圆角轻边框的核心面板。
- 仅编辑器有局部标题栏，且 `SyntaxToolbar` 已从全局顶栏迁入。
- 文档管理和大纲仍可独立折叠，也可以同时展开并推挤核心区。
- 指针、键盘、双击均可调整或恢复分栏，separator 语义完整。
- 比例持久化，抽屉状态不持久化；窗口变窄不会擅自关闭抽屉。
- `PreviewModeToggle`、同步滚动和浮动 `StylePanel` 行为无回退。
- `npm test`、`npm run build` 和人工矩阵全部通过。
- 本轮没有引入暗色模式、移动专用布局、自由停靠或工作区预设。
