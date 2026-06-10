# UI Workflow Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the existing tool-style UI so the core公众号 author workflows are easier to discover, safer to use, and possible to review in a normal browser.

**Architecture:** Keep the current React/Tailwind/Tauri structure and the existing token/UI component system. Add small adapter utilities and focused UI components around the current surfaces instead of replacing the layout.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + Tauri v2 APIs + lucide-react + framer-motion.

---

## Task 1: Web Debug Fallback for Tauri APIs

**Files:**
- Create: `src/utils/tauriEnv.ts`
- Modify: `src/utils/documents.ts`
- Modify: `src/App.tsx`
- Test: `src/utils/tauriEnv.test.ts`
- Test: `src/utils/documents.test.ts`

- [ ] **Step 1: Add failing tests**

Test that non-Tauri environments are detected without throwing and that document APIs return a sample tree/content in Web mode.

Run: `npm test src/utils/tauriEnv.test.ts src/utils/documents.test.ts`

Expected: fail because helpers do not exist yet.

- [ ] **Step 2: Implement `isTauriRuntime()`**

Create `src/utils/tauriEnv.ts` with a tiny runtime guard around `window.__TAURI_INTERNALS__`.

- [ ] **Step 3: Add Web document fallback**

In `src/utils/documents.ts`, keep the real Tauri command path for desktop and return a mock sample document tree/content for Web debug. Mutating commands should update an in-memory Web fallback store enough for UI exploration.

- [ ] **Step 4: Guard window close handling**

In `src/App.tsx`, only call `getCurrentWindow().onCloseRequested` in Tauri. Web mode should skip the hook instead of crashing.

- [ ] **Step 5: Verify**

Run: `npm test src/utils/tauriEnv.test.ts src/utils/documents.test.ts`, `npm run build`, and open `http://127.0.0.1:5173` in a normal browser.

---

## Task 2: Save Status in the Main Chrome

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/utils/autosave.ts`
- Modify: `src/App.tsx`
- Test: `src/utils/autosave.test.ts`

- [ ] **Step 1: Add failing autosave status tests**

Cover pending, saved, and failed save transitions at the debounced saver boundary.

- [ ] **Step 2: Track save status in store**

Add `saveStatus: "idle" | "saving" | "saved" | "error"` and `lastSavedAt` to store. `setContent` should mark pending/saving, successful flush should mark saved, failures should mark error.

- [ ] **Step 3: Surface status**

Add footer text such as `已保存 22:31` / `保存中` / `保存失败`, and show a toast when a disk save fails.

- [ ] **Step 4: Verify**

Run autosave tests and `npm run build`.

---

## Task 3: Toolbar Grouping and Small-Width Behavior

**Files:**
- Create: `src/components/Toolbar/MainToolbar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Toolbar/SyntaxToolbar.tsx`
- Modify: `src/components/ui/Menu.tsx`

- [ ] **Step 1: Introduce a main toolbar component**

Move right-side actions into `MainToolbar`: upload, import, theme, settings, publish, copy. Keep `CopyButton` as the strongest visual CTA.

- [ ] **Step 2: Add grouping and overflow**

Show primary actions inline on wide layouts. Move lower-frequency actions into a compact menu when width is tight.

- [ ] **Step 3: Add subtle separators**

Add separators between syntax groups and action groups without increasing visual noise.

- [ ] **Step 4: Verify**

Run `npm run build` and screenshot desktop plus narrow browser widths.

---

## Task 4: Preview Edit Affordance and Width Modes

**Files:**
- Create: `src/components/Preview/PreviewModeToggle.tsx`
- Modify: `src/components/Preview/Preview.tsx`
- Modify: `src/store/index.ts`
- Modify: `src/components/StylePanel/elementMap.ts`
- Test: `src/components/StylePanel/elementMap.test.ts`

- [ ] **Step 1: Add element label tests**

Test that model ids map to friendly Chinese labels for common blocks: H1/H2/body/blockquote/code/table/image.

- [ ] **Step 2: Add hover/selected affordance**

On hover over editable preview blocks, show a light outline and cursor. On click, keep selected outline while the side panel is open.

- [ ] **Step 3: Add preview width modes**

Add `previewMode: "fluid" | "wechat" | "mobile"` in store. Render the preview content as full width, 677px WeChat-ish width, or 390px mobile width.

- [ ] **Step 4: Verify**

Run element map tests, build, and manually check hover/click/highlight/mode switching.

---

## Task 5: Human-Friendly Style Panel Controls

**Files:**
- Create: `src/components/StylePanel/styleLabels.ts`
- Modify: `src/components/StylePanel/StylePanel.tsx`
- Modify: `src/components/StylePanel/controls.tsx`
- Test: `src/components/StylePanel/styleLabels.test.ts`

- [ ] **Step 1: Add label tests**

Test Chinese labels for common style ids and fallback behavior for unknown ids.

- [ ] **Step 2: Replace raw ids in the panel**

Display human labels while keeping raw ids in `title` attributes for advanced debugging.

- [ ] **Step 3: Upgrade controls**

Use color input plus text value for colors, stepper-like numeric inputs for px/rem/em values, and icon/short-label segmented controls for weight and alignment.

- [ ] **Step 4: Add single-field reset hook**

If the style model contains original/default values later, wire the button then. For this pass, reserve the UI location only if no reliable default exists.

- [ ] **Step 5: Verify**

Run label tests and build. Manually edit h1 color/size/weight and confirm preview updates.

---

## Task 6: Theme Picker Search and Favorites

**Files:**
- Modify: `src/components/Theme/ThemePickerDialog.tsx`
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add search input**

Filter themes by name/id. Keep current theme visible when it matches or put it at the top when no search is active.

- [ ] **Step 2: Add favorites**

Store favorite theme ids in Zustand persist. Add a star button in each card and a favorites-first sort.

- [ ] **Step 3: Improve dialog focus**

Use a subtle overlay instead of transparent backdrop so theme cards own the visual focus.

- [ ] **Step 4: Verify**

Run build and manually check search, favorite persistence, pagination, and selecting a theme.

---

## Task 7: Final Verification

**Files:** no code-only files expected.

- [ ] **Step 1: Run tests**

Run: `npm test`

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc -b --noEmit` and `npm run build`.

- [ ] **Step 3: Browser smoke test**

Run `npm run dev -- --host 127.0.0.1 --port 5174` if 5173 is occupied. Capture normal browser screenshots for desktop and narrow widths.

- [ ] **Step 4: Tauri smoke test if available**

Run `npm run tauri dev` and verify document loading, editing, save status, close flush, and publish/copy entry points.
