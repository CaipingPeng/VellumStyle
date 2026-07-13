# Workspace Sidebar Overflow Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale fixed-pixel editor/preview sizing with synchronous CSS proportional sizing so sidebar animations never create a bottom horizontal scrollbar or lift the status bar.

**Architecture:** `WorkspaceSplit` will continue measuring its container for ratio bounds, minimum-pane fallback, ARIA values, and interaction clamping, but physical pane widths will be owned by the browser's Flexbox layout in the same frame as the sidebar animation. The editor and preview will use complementary flex weights around the fixed 8px separator; obsolete JavaScript pixel-width conversion will be removed after the component contract is covered by tests.

**Tech Stack:** React 18, TypeScript, Tailwind CSS utilities, native Flexbox, Node test runner + JSDOM, Vite, Tauri/WebView2.

---

## Scope and file map

- Modify `src/components/Workspace/WorkspaceSplit.test.ts`: change the component contract from fixed pixel widths to complementary flex weights and prove `ResizeObserver` no longer writes physical widths.
- Modify `src/components/Workspace/WorkspaceSplit.tsx`: remove pixel-width rendering, render proportional flex panes, and keep measurement only for interaction/accessibility constraints.
- Modify `src/components/Workspace/workspaceSplitLayout.ts`: remove the now-unused `getWorkspacePaneWidths` helper.
- Modify `src/components/Workspace/workspaceSplitLayout.test.ts`: remove tests/imports for the deleted pixel-width helper while retaining ratio, minimum-width, pointer, and keyboard coverage.
- Do not modify `src/App.tsx`: the existing 140ms sidebar animation is deliberately preserved.
- Do not add global or workspace-level `overflow-x: hidden/clip`: the implementation must eliminate the stale-width condition rather than hide it.

## Task 1: Drive proportional pane rendering through component tests

**Files:**
- Modify: `src/components/Workspace/WorkspaceSplit.test.ts:10-137`
- Modify: `src/components/Workspace/WorkspaceSplit.tsx:9-15,84-89,136-175`

- [ ] **Step 1: Extend the ResizeObserver test stub so tests can trigger width changes**

Replace the current observer stub with a controllable instance and add a helper:

```ts
let activeResizeObserver: ResizeObserverStub | null = null;

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {
    activeResizeObserver = this;
  }

  emit(width: number) {
    this.callback(
      [{contentRect: {width}} as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  observe() {
    this.emit(1008);
  }

  unobserve() {}

  disconnect() {
    if (activeResizeObserver === this) activeResizeObserver = null;
  }
}

function resizeWorkspace(width: number) {
  const observer = activeResizeObserver;
  assert.ok(observer);
  act(() => observer.emit(width));
}
```

Keep the existing `Object.defineProperty(globalThis, "ResizeObserver", ...)` installation.

- [ ] **Step 2: Let the render helper accept a non-default ratio**

Change the helper signature and prop assignment:

```ts
function renderSplit(onRatioCommit: (ratio: number) => void, ratio = 0.5) {
  // existing container/root setup
  act(() => {
    root.render(React.createElement(WorkspaceSplit, {
      ratio,
      onRatioCommit,
      editor: React.createElement("div", null, "editor"),
      preview: React.createElement("div", null, "preview"),
    }));
  });
  // existing query and cleanup
}
```

- [ ] **Step 3: Add a reusable assertion for the pane Flexbox contract**

Add below `renderSplit`:

```ts
function assertPaneFlex(
  container: HTMLElement,
  pane: "editor" | "preview",
  expectedGrow: string,
) {
  const element = container.querySelector<HTMLElement>(`[data-workspace-pane="${pane}"]`);
  assert.ok(element);
  assert.equal(element.style.flexGrow, expectedGrow);
  assert.equal(element.style.flexShrink, "1");
  assert.equal(element.style.flexBasis, "0px");
  assert.equal(element.style.width, "");
  assert.equal(element.classList.contains("flex-none"), false);
}
```

- [ ] **Step 4: Replace fixed-width assertions and add observer-resize coverage**

Rename the first test to `分栏使用同步比例布局并提供完整 separator 语义`. Keep all existing separator assertions, then replace the two `style.width === "500px"` assertions with:

```ts
assertPaneFlex(view.container, "editor", "0.5");
assertPaneFlex(view.container, "preview", "0.5");
```

Add this test immediately after it:

```ts
test("容器测量只约束比例和 ARIA，不向面板写固定像素宽度", () => {
  const view = renderSplit(() => {}, 0.6);
  try {
    assertPaneFlex(view.container, "editor", "0.6");
    assertPaneFlex(view.container, "preview", "0.4");
    assert.equal(view.separator.getAttribute("aria-valuenow"), "60");

    resizeWorkspace(508);

    assertPaneFlex(view.container, "editor", "0.5");
    assertPaneFlex(view.container, "preview", "0.5");
    assert.equal(view.separator.getAttribute("aria-valuemin"), "50");
    assert.equal(view.separator.getAttribute("aria-valuemax"), "50");
    assert.equal(view.separator.getAttribute("aria-valuenow"), "50");
  } finally {
    view.cleanup();
  }
});
```

In `指针拖动即时更新，结束提交并可靠清理捕获状态`, replace the `style.width === "600px"` assertion after `pointermove` with:

```ts
assertPaneFlex(view.container, "editor", "0.6");
assertPaneFlex(view.container, "preview", "0.4");
```

Keep all commit, pointer-capture, keyboard, double-click, cancellation, and unmount assertions unchanged.

- [ ] **Step 5: Run the focused component test and verify the new contract fails**

Run:

```powershell
npm test -- src/components/Workspace/WorkspaceSplit.test.ts
```

Expected: FAIL in the new flex assertions because the current component still emits fixed `width` values and retains `flex-none`. The unrelated keyboard and pointer-cleanup assertions should not introduce new failures.

- [ ] **Step 6: Replace pixel-width rendering with complementary Flexbox weights**

In `WorkspaceSplit.tsx`, remove `getWorkspacePaneWidths` from the import list and delete:

```ts
const paneWidths = useMemo(
  () => getWorkspacePaneWidths(draftRatio, containerWidth),
  [containerWidth, draftRatio],
);
```

Replace the current `unmeasuredStyle`, `editorStyle`, and `previewStyle` declarations with:

```ts
const editorStyle = {
  flexGrow: displayRatio,
  flexShrink: 1,
  flexBasis: 0,
};
const previewStyle = {
  flexGrow: 1 - displayRatio,
  flexShrink: 1,
  flexBasis: 0,
};
```

For both pane wrappers, change:

```tsx
className="min-h-0 min-w-0 flex-none"
```

to:

```tsx
className="min-h-0 min-w-0"
```

Do not change the separator's `workspace-split-separator flex-none` class: it must remain a fixed 8px item. Do not remove `containerWidth`, `ResizeObserver`, `bounds`, or `displayRatio`; they still own constraints and ARIA values.

- [ ] **Step 7: Run the focused test and verify it passes**

Run:

```powershell
npm test -- src/components/Workspace/WorkspaceSplit.test.ts
```

Expected: all `WorkspaceSplit.test.ts` tests PASS. In particular, the observer-resize test must show a 50/50 constrained ratio at 508px while both `style.width` values remain empty.

- [ ] **Step 8: Review the production diff for forbidden symptom masking**

Run:

```powershell
git diff -- src/components/Workspace/WorkspaceSplit.tsx src/components/Workspace/WorkspaceSplit.test.ts
git diff --check
```

Expected: the only layout change is pane flex sizing; there is no change to `App.tsx`, no `overflow-x` rule, and no whitespace error.

- [ ] **Step 9: Commit the tested component change**

```powershell
git add -- src/components/Workspace/WorkspaceSplit.tsx src/components/Workspace/WorkspaceSplit.test.ts
git commit -m "fix: keep workspace panes within animated layout"
```

## Task 2: Remove the obsolete JavaScript pixel-width contract

**Files:**
- Modify: `src/components/Workspace/workspaceSplitLayout.ts:36-46`
- Modify: `src/components/Workspace/workspaceSplitLayout.test.ts:3-42`

- [ ] **Step 1: Confirm the pixel helper has no production callers**

Run:

```powershell
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern 'getWorkspacePaneWidths'
```

Expected: matches exist only in `workspaceSplitLayout.ts` and `workspaceSplitLayout.test.ts`. If a production caller remains, stop and reconcile it with the approved design rather than deleting the helper blindly.

- [ ] **Step 2: Delete the unused helper and its test imports/assertions**

Delete this export from `workspaceSplitLayout.ts`:

```ts
export function getWorkspacePaneWidths(
  ratio: unknown,
  containerWidth: number,
): {editor: number; preview: number} {
  const distributable = Math.max(containerWidth - WORKSPACE_SEPARATOR_WIDTH, 0);
  const safeRatio = clampWorkspaceSplitRatio(ratio, containerWidth);
  const editor = Math.round(distributable * safeRatio);
  return {editor, preview: distributable - editor};
}
```

In `workspaceSplitLayout.test.ts`:

- remove `getWorkspacePaneWidths` from the import list;
- rename `比例和像素换算忽略 8px 分隔柄并受实时宽度约束` to `指针比例换算忽略 8px 分隔柄并受实时宽度约束`;
- remove the `getWorkspacePaneWidths(0.6, 1008)` assertion from that test;
- remove the `getWorkspacePaneWidths(0.8, 508)` assertion from `不足双侧最小宽度时均分而不关闭抽屉`;
- keep the ratio bounds, clamping, pointer conversion, sanitization, and keyboard assertions.

The two affected tests should reduce to:

```ts
test("指针比例换算忽略 8px 分隔柄并受实时宽度约束", () => {
  assert.equal(ratioFromPointer(700, 100, 1008), 0.6);
  assert.equal(ratioFromPointer(-1000, 100, 1008), 0.28);
});

test("不足双侧最小宽度时均分而不关闭抽屉", () => {
  assert.deepEqual(getWorkspaceRatioBounds(508), {min: 0.5, max: 0.5});
  assert.equal(clampWorkspaceSplitRatio(0.8, 508), 0.5);
});
```

- [ ] **Step 3: Run both workspace split test files**

Run:

```powershell
npm test -- src/components/Workspace/workspaceSplitLayout.test.ts src/components/Workspace/WorkspaceSplit.test.ts
```

Expected: all tests in both files PASS, with no unresolved import or TypeScript transform error.

- [ ] **Step 4: Verify the old helper and fixed pane widths are gone**

Run:

```powershell
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern 'getWorkspacePaneWidths'
Select-String -Path src/components/Workspace/WorkspaceSplit.tsx -Pattern 'paneWidths|\{width:'
```

Expected: both commands return no matches. The separator remains `flex-none` and the two panes remain `min-w-0`.

- [ ] **Step 5: Commit the cleanup**

```powershell
git add -- src/components/Workspace/workspaceSplitLayout.ts src/components/Workspace/workspaceSplitLayout.test.ts
git commit -m "refactor: remove workspace pixel width helper"
```

## Task 3: Verify behavior, regression safety, and the original animation failure mode

**Files:**
- Verify only; no source file should be added or modified.

- [ ] **Step 1: Run the full automated test suite**

Run:

```powershell
npm test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: TypeScript project build and Vite production build both complete successfully with exit code 0.

- [ ] **Step 3: Start or reuse the web development server for animation diagnostics**

If `http://127.0.0.1:5173` is not already available, run in a separate terminal:

```powershell
npm run dev:web -- --host 127.0.0.1
```

Expected: Vite serves the application. Do not stop a pre-existing development server owned by another session.

- [ ] **Step 4: Install a per-frame overflow probe in Edge DevTools**

Open the app in Edge, open DevTools Console, and run:

```js
window.__workspaceOverflowProbe = {
  active: true,
  samples: [],
};
(function sampleWorkspaceOverflow() {
  const root = document.documentElement;
  window.__workspaceOverflowProbe.samples.push({
    time: performance.now(),
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    overflow: root.scrollWidth - root.clientWidth,
  });
  if (window.__workspaceOverflowProbe.active) {
    requestAnimationFrame(sampleWorkspaceOverflow);
  }
})();
```

After exercising one transition, stop and inspect it with:

```js
window.__workspaceOverflowProbe.active = false;
const overflowFrames = window.__workspaceOverflowProbe.samples.filter(({overflow}) => overflow > 0);
console.table(overflowFrames);
if (overflowFrames.length) throw new Error("Workspace produced horizontal overflow");
```

Expected: `overflowFrames` is empty. Re-run the installation snippet before each transition so samples are isolated.

- [ ] **Step 5: Exercise every sidebar transition at 800px and 1200px viewport widths**

Using the toolbar buttons with titles `文档` and `大纲`, run the probe separately for:

1. both closed → open `文档`;
2. both closed → open `大纲`;
3. `文档` open → also open `大纲`;
4. `大纲` open → also open `文档`;
5. each corresponding close transition.

Repeat the sequence with the viewport at 800px and 1200px. For every run, expected:

- no probe sample has `scrollWidth > clientWidth`;
- no bottom horizontal scrollbar appears;
- the status bar does not visibly rise;
- editor, separator, and preview continue filling the available split width.

- [ ] **Step 6: Verify split interactions and persistence**

At both viewport widths:

- drag the separator left and right and confirm panes update continuously;
- release it, reload the app, and confirm the committed ratio is restored;
- focus the separator and verify ArrowLeft/ArrowRight small steps;
- verify Shift/Alt + arrow large steps;
- verify Home and double-click restore 50/50;
- exercise persisted ratios 0.2 and 0.8 and confirm current-width bounds clamp them without horizontal overflow;
- open both sidebars and confirm the sub-568px split fallback is 50/50 rather than closing a sidebar.

Expected: all existing interactions remain functional and no action creates page-level horizontal overflow.

- [ ] **Step 7: Check Windows/WebView2 scaling**

Run the desktop application or packaged WebView2 build at Windows display scaling 100%, 125%, 150%, and 200%. At each scale, at minimum test `文档` closed → open, `大纲` closed → open, and opening the second sidebar while the first is open.

Expected: no bottom horizontal scrollbar or status-bar lift. If the environment cannot change system scaling, record exactly which scale factors were verified instead of claiming the full matrix.

- [ ] **Step 8: Confirm the worktree contains only intended changes**

Run:

```powershell
git status --short
git log -3 --oneline
git diff --check HEAD~2..HEAD
```

Expected: the two implementation commits are present, tracked source/test files are clean, and no diagnostic script or global overflow workaround was added.

## Completion criteria

- The editor and preview use complementary flex weights with empty inline `width` values.
- The 8px separator remains fixed and excluded from proportional space.
- `ResizeObserver` continues to update bounds and ARIA values but cannot create stale physical widths.
- All sidebar open/close sequences remain free of document-level horizontal overflow at animation time.
- Pointer, keyboard, reset, minimum-width, and persisted-ratio behavior remain unchanged.
- `npm test` and `npm run build` pass.
