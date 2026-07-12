# Editor Toolbar Divider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clearly visible one-pixel divider between the editor syntax toolbar and editor content.

**Architecture:** Give the editor toolbar a dedicated CSS class and define its bottom border in the workspace stylesheet using the existing panel-border token. Preserve all existing layout and behavior.

**Tech Stack:** React, TypeScript, CSS, Node test runner

---

### Task 1: Editor toolbar divider

**Files:**
- Modify: `src/components/Workspace/EditorWorkspacePanel.tsx`
- Modify: `src/styles/globals.css`
- Test: `src/components/Workspace/EditorWorkspacePanel.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that the editor toolbar includes the dedicated `workspace-editor-toolbar` class and that `globals.css` defines `border-bottom: 1px solid var(--workspace-panel-border)` for it.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/components/Workspace/EditorWorkspacePanel.test.ts`
Expected: FAIL because the dedicated class/style is absent.

- [ ] **Step 3: Write minimal implementation**

Add `workspace-editor-toolbar` to the toolbar and define its one-pixel bottom border. Remove the weaker generic border utilities.

- [ ] **Step 4: Verify**

Run the focused test, `npm test`, `npm run build`, `git diff --check`, and `git status --short`.

- [ ] **Step 5: Commit**

Commit the regression test and minimal implementation together.
