import {
  defaultHighlightStyle,
  syntaxHighlighting,
  type HighlightStyle,
} from "@codemirror/language";
import {oneDarkHighlightStyle} from "@uiw/react-codemirror";
import type {Extension} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import type {AppearanceMode} from "../../appearance/appearanceMode.ts";

export function editorHighlightStyleFor(
  appearanceMode: AppearanceMode,
): HighlightStyle {
  return appearanceMode === "dark"
    ? oneDarkHighlightStyle
    : defaultHighlightStyle;
}

export function createEditorAppearanceExtension(
  appearanceMode: AppearanceMode,
): Extension {
  return [
    EditorView.theme(
      {
        "&": {
          backgroundColor: "var(--workspace-panel)",
          color: "var(--text)",
        },
        ".cm-content": {caretColor: "var(--text)"},
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: "var(--text)",
        },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
          backgroundColor: "var(--accent-subtle)",
        },
        ".cm-activeLine": {
          backgroundColor: "var(--editor-active-line)",
        },
      },
      {dark: appearanceMode === "dark"},
    ),
    syntaxHighlighting(editorHighlightStyleFor(appearanceMode)),
  ];
}
