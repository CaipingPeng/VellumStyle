# Platform-Aware Syntax Shortcut Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every syntax toolbar icon's native hover title show its meaning plus the actual shortcut for the current operating system.

**Architecture:** Keep `SYNTAX_SHORTCUTS` as the single source of truth. Add pure platform detection and display-formatting helpers beside the registry, then have `SyntaxToolbar` derive every syntax button title from those helpers without changing button layout, icons, or click behavior.

**Tech Stack:** React 18, TypeScript, CodeMirror 6 key bindings, Node test runner, jsdom

---

## File Structure

- `src/components/Editor/syntaxActions.ts`: retain action/keymap definitions; add platform detection and user-facing shortcut formatting.
- `src/components/Editor/syntaxActions.test.ts`: verify Windows, Linux, macOS, fallback, simple keys, and complex modifier combinations.
- `src/components/Toolbar/SyntaxToolbar.tsx`: generate native `title` values for the 14 syntax actions and compact the H1–H4 title into one range.
- `src/components/Toolbar/SyntaxToolbar.test.tsx`: verify toolbar titles use the platform-specific registry values while existing click dispatch remains unchanged.

### Task 1: Platform Detection and Shortcut Display Formatting

**Files:**
- Modify: `src/components/Editor/syntaxActions.ts`
- Test: `src/components/Editor/syntaxActions.test.ts`

- [ ] **Step 1: Write failing tests for platform detection**

Extend imports and add tests equivalent to:

```ts
import {
  detectSyntaxShortcutPlatform,
  // existing imports...
} from "./syntaxActions.ts";

test("快捷键提示识别当前桌面平台并安全降级", () => {
  assert.equal(detectSyntaxShortcutPlatform("Win32"), "win");
  assert.equal(detectSyntaxShortcutPlatform("Linux x86_64"), "linux");
  assert.equal(detectSyntaxShortcutPlatform("MacIntel"), "mac");
  assert.equal(detectSyntaxShortcutPlatform("iPad"), "mac");
  assert.equal(detectSyntaxShortcutPlatform(""), "linux");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/components/Editor/syntaxActions.test.ts
```

Expected: FAIL because `detectSyntaxShortcutPlatform` is not exported.

- [ ] **Step 3: Add failing tests for display formatting**

Add tests equivalent to:

```ts
import {
  formatSyntaxShortcut,
  // existing imports...
} from "./syntaxActions.ts";

test("快捷键提示按平台格式化真实注册键位", () => {
  assert.equal(formatSyntaxShortcut("bold", "win"), "Ctrl+B");
  assert.equal(formatSyntaxShortcut("bold", "linux"), "Ctrl+B");
  assert.equal(formatSyntaxShortcut("bold", "mac"), "⌘B");
  assert.equal(formatSyntaxShortcut("strikethrough", "win"), "Shift+Alt+5");
  assert.equal(formatSyntaxShortcut("strikethrough", "mac"), "⌃⇧`");
  assert.equal(formatSyntaxShortcut("orderedList", "mac"), "⌘⌥O");
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
npm test -- src/components/Editor/syntaxActions.test.ts
```

Expected: FAIL because `formatSyntaxShortcut` is not exported.

- [ ] **Step 5: Implement the minimal pure helpers**

Add a normalized platform type and detector:

```ts
export type SyntaxShortcutPlatform = "win" | "linux" | "mac";

export function detectSyntaxShortcutPlatform(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): SyntaxShortcutPlatform {
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) return "mac";
  if (/Win/i.test(platform)) return "win";
  return "linux";
}
```

Add a registry lookup and formatter. Preserve CodeMirror modifier order, use `+` on Windows/Linux, concatenate macOS modifier symbols, and uppercase a one-letter primary key:

```ts
const macModifierLabels: Record<string, string> = {
  Cmd: "⌘",
  Ctrl: "⌃",
  Shift: "⇧",
  Alt: "⌥",
};

export function formatSyntaxShortcut(
  action: SyntaxAction,
  platform: SyntaxShortcutPlatform = detectSyntaxShortcutPlatform(),
): string {
  const shortcut = SYNTAX_SHORTCUTS.find((item) => item.action === action);
  if (!shortcut) return "";

  const parts = shortcut[platform].split("-");
  const key = parts.pop() ?? "";
  const displayKey = key.length === 1 && /[a-z]/i.test(key) ? key.toUpperCase() : key;

  if (platform === "mac") {
    return parts.map((part) => macModifierLabels[part] ?? part).join("") + displayKey;
  }
  return [...parts, displayKey].join("+");
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/components/Editor/syntaxActions.test.ts
```

Expected: all `syntaxActions` tests PASS with no warnings.

- [ ] **Step 7: Commit the registry display helpers**

```bash
git add src/components/Editor/syntaxActions.ts src/components/Editor/syntaxActions.test.ts
git commit -m "feat: format syntax shortcuts for platform hints"
```

### Task 2: Syntax Toolbar Native Hover Titles

**Files:**
- Modify: `src/components/Toolbar/SyntaxToolbar.tsx`
- Test: `src/components/Toolbar/SyntaxToolbar.test.tsx`

- [ ] **Step 1: Write a failing Windows toolbar title test**

Add a helper that temporarily replaces `navigator.platform` and always restores its descriptor. Render the toolbar under `Win32`, then assert native titles:

```ts
assert.ok(host.querySelector('button[title="加粗 (Ctrl+B)"]'));
assert.ok(host.querySelector('button[title="删除线 (Shift+Alt+5)"]'));
assert.ok(host.querySelector('button[title="代码块 (Ctrl+Shift+K)"]'));
assert.ok(host.querySelector('button[title="标题 (Ctrl+1–4)"]'));
```

Keep the existing action-dispatch assertions, updating their title selectors to include the shortcut.

- [ ] **Step 2: Run the toolbar test and verify RED**

Run:

```bash
npm test -- src/components/Toolbar/SyntaxToolbar.test.tsx
```

Expected: FAIL because production titles still contain only the syntax meaning.

- [ ] **Step 3: Write a failing macOS toolbar title test**

Render under `MacIntel` and assert representative simple and complex titles:

```ts
assert.ok(host.querySelector('button[title="加粗 (⌘B)"]'));
assert.ok(host.querySelector('button[title="删除线 (⌃⇧`)"]'));
assert.ok(host.querySelector('button[title="有序列表 (⌘⌥O)"]'));
assert.ok(host.querySelector('button[title="标题 (⌘1–4)"]'));
```

- [ ] **Step 4: Run the toolbar test and verify RED**

Run:

```bash
npm test -- src/components/Toolbar/SyntaxToolbar.test.tsx
```

Expected: FAIL on the new macOS title assertions.

- [ ] **Step 5: Derive toolbar titles from the registry**

Import the helpers:

```ts
import {
  detectSyntaxShortcutPlatform,
  formatSyntaxShortcut,
  type SyntaxAction,
} from "../Editor/syntaxActions.ts";
```

Inside `SyntaxToolbar`, calculate the current platform and define a title helper:

```ts
const shortcutPlatform = detectSyntaxShortcutPlatform();
const syntaxTitle = (label: string, action: SyntaxAction) =>
  `${label} (${formatSyntaxShortcut(action, shortcutPlatform)})`;
const headingStart = formatSyntaxShortcut("heading1", shortcutPlatform);
const headingEnd = formatSyntaxShortcut("heading4", shortcutPlatform);
let commonLength = 0;
while (
  commonLength < headingStart.length
  && headingStart[commonLength] === headingEnd[commonLength]
) commonLength++;
const headingShortcut = `${headingStart}–${headingEnd.slice(commonLength)}`;
```

Replace only the 14 syntax `title` values, for example:

```tsx
<IconButton title={syntaxTitle("加粗", "bold")} onClick={run("bold")}>...</IconButton>
<IconButton title={`标题 (${headingShortcut})`} ...>...</IconButton>
```

Do not change upload, undo, redo, icons, layout classes, or click handlers.

- [ ] **Step 6: Run toolbar and editor integration tests and verify GREEN**

Run:

```bash
npm test -- src/components/Toolbar/SyntaxToolbar.test.tsx src/components/Editor/MarkdownEditor.syntaxActions.test.tsx src/components/Workspace/EditorWorkspacePanel.test.ts
```

Expected: all tests PASS with no warnings.

- [ ] **Step 7: Commit toolbar hints**

```bash
git add src/components/Toolbar/SyntaxToolbar.tsx src/components/Toolbar/SyntaxToolbar.test.tsx
git commit -m "feat: show syntax shortcuts in toolbar hints"
```

### Task 3: Regression and Production Verification

**Files:**
- Modify only if verification exposes a defect in the files listed above.

- [ ] **Step 1: Run syntax feature tests**

```bash
npm test -- src/components/Editor/syntaxActions.test.ts src/components/Editor/syntaxCommands.test.ts src/components/Editor/MarkdownEditor.syntaxActions.test.tsx src/components/Toolbar/SyntaxToolbar.test.tsx
```

Expected: all tests PASS with no warnings.

- [ ] **Step 2: Run the complete test suite**

```bash
npm test
```

Expected: exit code 0 and zero failed tests.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: `tsc -b && vite build` exits with code 0.

- [ ] **Step 4: Check formatting and repository state**

```bash
git diff --check
git status --short
```

Expected: `git diff --check` has no output and the worktree is clean after commits.

- [ ] **Step 5: Manually inspect representative hover titles if desktop runtime is available**

Run `npm run tauri`, hover the syntax icons, and confirm the current platform shows `Ctrl` labels on Windows/Linux or macOS symbols on macOS without any toolbar layout change.
