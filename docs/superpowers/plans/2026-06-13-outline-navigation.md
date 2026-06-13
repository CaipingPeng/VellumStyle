# 文章大纲导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible multi-level heading outline sidebar for the current Markdown document.

**Architecture:** Parse headings from Markdown into a small pure data model, render them in a new left-side `OutlineNav` panel, and wire clicks to the existing preview line anchors. Store only the panel open/closed state in Zustand; keep derived heading data local to `App`.

**Tech Stack:** React 18, TypeScript, Zustand, lucide-react, Vite, Node test runner.

---

### Task 1: Heading Parser

**Files:**
- Create: `src/utils/outline.ts`
- Test: `src/utils/outline.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- ATX headings from `#` through `######`.
- Code fences are ignored.
- Closing hashes and simple inline Markdown markers are stripped from labels.
- Empty or over-deep headings are ignored.

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npm test -- src/utils/outline.test.ts`

- [ ] **Step 3: Implement parser**

Create `parseMarkdownOutline(markdown: string): OutlineItem[]`.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `npm test -- src/utils/outline.test.ts`

### Task 2: Store State

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add runtime UI state**

Add `outlineOpen: boolean` and `toggleOutline`.

- [ ] **Step 2: Confirm state is not persisted**

Keep `partialize` unchanged except for existing persisted fields.

### Task 3: Preview Jump API

**Files:**
- Modify: `src/components/Preview/Preview.tsx`

- [ ] **Step 1: Extend preview ref handle**

Expose `scrollToLine(line: number): void`.

- [ ] **Step 2: Implement DOM lookup**

Find the first `[data-line]` element whose line is greater than or equal to the target, falling back to the closest previous anchor.

### Task 4: Outline UI

**Files:**
- Create: `src/components/Outline/OutlineNav.tsx`

- [ ] **Step 1: Render panel shell**

Match `DocTree` density, border, width, and background.

- [ ] **Step 2: Render heading rows**

Use real `<button>` rows, level-based indentation, ellipsis for long labels, and active styling.

- [ ] **Step 3: Render empty state**

Show a short muted message when no headings exist.

### Task 5: App Wiring

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Parse outline**

Use `useMemo` on `content`.

- [ ] **Step 2: Add toolbar toggle**

Place the outline toggle next to the document sidebar toggle. Use a clearly different hierarchy-list icon.

- [ ] **Step 3: Mount panel**

Render `OutlineNav` next to `DocTree` when `outlineOpen` is true.

- [ ] **Step 4: Track active heading**

Listen to preview scroll, compute the last outline item whose preview anchor is above the viewport top, and pass that line to `OutlineNav`.

### Task 6: Verification

**Files:**
- None

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/utils/outline.test.ts`

- [ ] **Step 2: Run full tests**

Run: `npm test`

- [ ] **Step 3: Run build**

Run: `npm run build`

- [ ] **Step 4: Browser hand test**

Run the Vite dev server, open the app, verify both sidebars can toggle, click headings, and check active heading behavior.
