# CodeMirror Syntax Highlighting Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CodeMirror use a complete light syntax palette in light mode and the official One Dark syntax palette in dark mode without surrendering VellumStyle's editor surfaces.

**Architecture:** Extract editor appearance assembly into a focused module that combines VellumStyle's `EditorView.theme` surface extension with one explicit CodeMirror `syntaxHighlighting` extension. The existing `appearanceCompartment` remains the only runtime switch point, so changing appearance reconfigures the view in place and preserves editor state.

**Tech Stack:** React 18, TypeScript, CodeMirror 6, `@uiw/react-codemirror`, Node test runner

---

## File Structure

- Create `src/components/Editor/editorAppearance.ts`: own the light/dark syntax-style mapping and compose the complete CodeMirror appearance extension.
- Create `src/components/Editor/editorAppearance.test.ts`: test the real mapping and CodeMirror dark facet without depending on source-code regexes.
- Modify `src/components/Editor/MarkdownEditor.tsx`: consume the extracted appearance extension and keep the existing compartment reconfiguration path.
- Modify `src/components/Editor/MarkdownEditor.appearance.test.ts`: retain integration contracts while requiring explicit semantic syntax highlighting.
- Modify `package.json`: declare `@codemirror/language` as a direct dependency used by application source; keep consuming One Dark through the public `@uiw/react-codemirror` re-export required by the design.
- Modify `package-lock.json`: lock the direct dependency declarations without changing resolved versions unnecessarily.

### Task 1: Add failing appearance-theme contracts

**Files:**
- Create: `src/components/Editor/editorAppearance.test.ts`
- Modify: `src/components/Editor/MarkdownEditor.appearance.test.ts`

- [ ] **Step 1: Write the failing unit test for the desired palette mapping**

Create `src/components/Editor/editorAppearance.test.ts`:

```ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {defaultHighlightStyle} from "@codemirror/language";
import {oneDarkHighlightStyle} from "@uiw/react-codemirror";
import {EditorState} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import {
  createEditorAppearanceExtension,
  editorHighlightStyleFor,
} from "./editorAppearance.ts";

test("编辑器根据应用外观选择完整的官方语法高亮", () => {
  assert.equal(editorHighlightStyleFor("light"), defaultHighlightStyle);
  assert.equal(editorHighlightStyleFor("dark"), oneDarkHighlightStyle);
});

test("编辑器外观扩展向 CodeMirror 声明正确的亮暗模式", () => {
  const lightState = EditorState.create({
    extensions: [createEditorAppearanceExtension("light")],
  });
  const darkState = EditorState.create({
    extensions: [createEditorAppearanceExtension("dark")],
  });

  assert.equal(lightState.facet(EditorView.darkTheme), false);
  assert.equal(darkState.facet(EditorView.darkTheme), true);
});
```

- [ ] **Step 2: Strengthen the existing integration contract**

In `src/components/Editor/MarkdownEditor.appearance.test.ts`, require the editor to import and use the focused appearance module while retaining `theme: "none"` and compartment reconfiguration:

```ts
assert.match(source, /import \{createEditorAppearanceExtension\} from "\.\/editorAppearance\.ts"/);
assert.match(source, /appearanceCompartment\.reconfigure\(createEditorAppearanceExtension\(appearanceMode\)\)/);
assert.match(source, /theme: "none"/);
```

Remove the implementation-specific assertion for `{dark: appearanceMode === "dark"}` from this integration test because the new unit test owns that behavior.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test `
  src/components/Editor/editorAppearance.test.ts `
  src/components/Editor/MarkdownEditor.appearance.test.ts
```

Expected: FAIL because `editorAppearance.ts` does not exist and `MarkdownEditor.tsx` does not import it.

### Task 2: Implement unified light/dark syntax highlighting

**Files:**
- Create: `src/components/Editor/editorAppearance.ts`
- Modify: `src/components/Editor/MarkdownEditor.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Declare direct CodeMirror dependencies**

Run:

```powershell
npm install @codemirror/language@^6.12.3
```

Expected: `package.json` declares `@codemirror/language`; One Dark continues to come from the public `@uiw/react-codemirror` re-export, and the lockfile keeps the compatible CodeMirror 6 graph.

- [ ] **Step 2: Create the focused appearance module**

Create `src/components/Editor/editorAppearance.ts`:

```ts
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  type HighlightStyle,
} from "@codemirror/language";
import {oneDarkHighlightStyle} from "@uiw/react-codemirror";
import type {Extension} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import type {AppearanceMode} from "../../appearance/appearanceMode.ts";

export function editorHighlightStyleFor(appearanceMode: AppearanceMode): HighlightStyle {
  return appearanceMode === "dark" ? oneDarkHighlightStyle : defaultHighlightStyle;
}

export function createEditorAppearanceExtension(
  appearanceMode: AppearanceMode,
): Extension {
  return [
    EditorView.theme({
      "&": {backgroundColor: "var(--workspace-panel)", color: "var(--text)"},
      ".cm-content": {caretColor: "var(--text)"},
      ".cm-cursor, .cm-dropCursor": {borderLeftColor: "var(--text)"},
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--accent-subtle)",
      },
      ".cm-activeLine": {backgroundColor: "var(--editor-active-line)"},
    }, {dark: appearanceMode === "dark"}),
    syntaxHighlighting(editorHighlightStyleFor(appearanceMode)),
  ];
}
```

- [ ] **Step 3: Consume the module from MarkdownEditor**

In `src/components/Editor/MarkdownEditor.tsx`:

```ts
import {createEditorAppearanceExtension} from "./editorAppearance.ts";
```

Delete the local `createEditorAppearanceExtension` implementation. Keep all of the following unchanged:

```ts
const appearanceCompartment = new Compartment();
appearanceCompartment.of(createEditorAppearanceExtension(initialAppearanceModeRef.current));
appearanceCompartment.reconfigure(createEditorAppearanceExtension(appearanceMode));
theme: "none";
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node --import tsx --import ./src/test/setupDom.ts --test `
  src/components/Editor/editorAppearance.test.ts `
  src/components/Editor/MarkdownEditor.appearance.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 5: Run TypeScript and production build verification**

Run:

```powershell
npm run build
```

Expected: TypeScript compilation and Vite production build both exit 0.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- package.json package-lock.json `
  src/components/Editor/editorAppearance.ts `
  src/components/Editor/editorAppearance.test.ts `
  src/components/Editor/MarkdownEditor.tsx `
  src/components/Editor/MarkdownEditor.appearance.test.ts
git commit -m "fix: switch editor syntax palette with appearance"
```

### Task 3: Verify semantic colors and regressions

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run the complete test suite**

Run:

```powershell
npm test
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run the production build again after the final test state**

Run:

```powershell
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Inspect representative CodeMirror tokens**

Use a representative document containing headings, emphasis, links, fenced code info strings, strings, comments, keywords, numbers, booleans, and invalid syntax. In light mode, confirm CodeMirror uses `defaultHighlightStyle`; in dark mode, confirm it uses `oneDarkHighlightStyle` and that the link URL and `preview` info string are no longer `#219`.

Expected dark-mode examples with the installed official One Dark style:

```text
link URL: rgb(125, 135, 153), underlined
preview info string: rgb(97, 175, 239)
```

Prefer the in-app browser. If no browser backend is available, run a local CodeMirror DOM rendering probe and record that browser-level visual inspection was unavailable.

- [ ] **Step 4: Check repository hygiene**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` has no output and the worktree is clean.

