import type {KeyBinding} from "@codemirror/view";
import type {EditorView} from "@codemirror/view";

export const SYNTAX_ACTIONS = [
  "bold",
  "italic",
  "strikethrough",
  "inlineCode",
  "link",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "orderedList",
  "unorderedList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
] as const;

export type SyntaxAction = (typeof SYNTAX_ACTIONS)[number];
export type SyntaxShortcutPlatform = "win" | "linux" | "mac";

export function detectSyntaxShortcutPlatform(
  platform: string = typeof navigator === "undefined" ? "" : navigator.platform,
): SyntaxShortcutPlatform {
  if (/Mac|Darwin|iPhone|iPad|iPod/i.test(platform)) return "mac";
  if (/^Win/i.test(platform)) return "win";
  return "linux";
}

export interface SyntaxShortcut {
  action: SyntaxAction;
  win: string;
  linux: string;
  mac: string;
}

export const SYNTAX_SHORTCUTS: readonly SyntaxShortcut[] = [
  {action: "bold", win: "Ctrl-b", linux: "Ctrl-b", mac: "Cmd-b"},
  {action: "italic", win: "Ctrl-i", linux: "Ctrl-i", mac: "Cmd-i"},
  {action: "strikethrough", win: "Shift-Alt-5", linux: "Shift-Alt-5", mac: "Ctrl-Shift-`"},
  {action: "inlineCode", win: "Ctrl-Shift-`", linux: "Ctrl-Shift-`", mac: "Cmd-Shift-`"},
  {action: "link", win: "Ctrl-k", linux: "Ctrl-k", mac: "Cmd-k"},
  {action: "heading1", win: "Ctrl-1", linux: "Ctrl-1", mac: "Cmd-1"},
  {action: "heading2", win: "Ctrl-2", linux: "Ctrl-2", mac: "Cmd-2"},
  {action: "heading3", win: "Ctrl-3", linux: "Ctrl-3", mac: "Cmd-3"},
  {action: "heading4", win: "Ctrl-4", linux: "Ctrl-4", mac: "Cmd-4"},
  {action: "orderedList", win: "Ctrl-Shift-[", linux: "Ctrl-Shift-[", mac: "Cmd-Alt-o"},
  {action: "unorderedList", win: "Ctrl-Shift-]", linux: "Ctrl-Shift-]", mac: "Cmd-Alt-u"},
  {action: "blockquote", win: "Ctrl-Shift-q", linux: "Ctrl-Shift-q", mac: "Cmd-Alt-q"},
  {action: "codeBlock", win: "Ctrl-Shift-k", linux: "Ctrl-Shift-k", mac: "Cmd-Alt-c"},
  {action: "horizontalRule", win: "Ctrl-Shift-h", linux: "Ctrl-Shift-h", mac: "Cmd-Shift-h"},
];

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

export type SyntaxActionRunner = (view: EditorView, action: SyntaxAction) => boolean;

export function createSyntaxKeymap(runAction: SyntaxActionRunner): KeyBinding[] {
  return SYNTAX_SHORTCUTS.map(({action, win, linux, mac}) => ({
    key: win,
    win,
    linux,
    mac,
    run: (view) => runAction(view, action),
  }));
}
