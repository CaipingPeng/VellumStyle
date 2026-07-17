import assert from "node:assert/strict";
import {test} from "node:test";
import {
  SYNTAX_ACTIONS,
  SYNTAX_SHORTCUTS,
  createSyntaxKeymap,
  detectSyntaxShortcutPlatform,
  formatSyntaxShortcut,
  type SyntaxAction,
} from "./syntaxActions.ts";

const expected = [
  ["bold", "Ctrl-b", "Ctrl-b", "Cmd-b"],
  ["italic", "Ctrl-i", "Ctrl-i", "Cmd-i"],
  ["strikethrough", "Shift-Alt-5", "Shift-Alt-5", "Ctrl-Shift-`"],
  ["inlineCode", "Ctrl-Shift-`", "Ctrl-Shift-`", "Cmd-Shift-`"],
  ["link", "Ctrl-k", "Ctrl-k", "Cmd-k"],
  ["heading1", "Ctrl-1", "Ctrl-1", "Cmd-1"],
  ["heading2", "Ctrl-2", "Ctrl-2", "Cmd-2"],
  ["heading3", "Ctrl-3", "Ctrl-3", "Cmd-3"],
  ["heading4", "Ctrl-4", "Ctrl-4", "Cmd-4"],
  ["orderedList", "Ctrl-Shift-[", "Ctrl-Shift-[", "Cmd-Alt-o"],
  ["unorderedList", "Ctrl-Shift-]", "Ctrl-Shift-]", "Cmd-Alt-u"],
  ["blockquote", "Ctrl-Shift-q", "Ctrl-Shift-q", "Cmd-Alt-q"],
  ["codeBlock", "Ctrl-Shift-k", "Ctrl-Shift-k", "Cmd-Alt-c"],
  ["horizontalRule", "Ctrl-Shift-h", "Ctrl-Shift-h", "Cmd-Shift-h"],
] as const;

test("语法动作完整覆盖现有十四项语法按钮", () => {
  assert.equal(SYNTAX_ACTIONS.length, 14);
  assert.deepEqual(SYNTAX_SHORTCUTS.map(({action}) => action), SYNTAX_ACTIONS);
});

test("快捷键除分割线外精确兼容 Typora 的平台映射", () => {
  assert.deepEqual(
    SYNTAX_SHORTCUTS.map(({action, win, linux, mac}) => [action, win, linux, mac]),
    expected,
  );
});

test("快捷键提示识别当前桌面平台并安全降级", () => {
  assert.equal(detectSyntaxShortcutPlatform("Win32"), "win");
  assert.equal(detectSyntaxShortcutPlatform("Linux x86_64"), "linux");
  assert.equal(detectSyntaxShortcutPlatform("MacIntel"), "mac");
  assert.equal(detectSyntaxShortcutPlatform("iPhone"), "mac");
  assert.equal(detectSyntaxShortcutPlatform("iPad"), "mac");
  assert.equal(detectSyntaxShortcutPlatform("iPod"), "mac");
  assert.equal(detectSyntaxShortcutPlatform(""), "linux");

  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {platform: "MacIntel"},
    });
    assert.equal(detectSyntaxShortcutPlatform(), "mac");

    Reflect.deleteProperty(globalThis, "navigator");
    assert.equal(detectSyntaxShortcutPlatform(), "linux");
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  }
});

test("快捷键提示按平台格式化真实注册键位", () => {
  for (const platform of ["win", "linux"] as const) {
    assert.equal(formatSyntaxShortcut("bold", platform), "Ctrl+B");
    assert.equal(formatSyntaxShortcut("strikethrough", platform), "Shift+Alt+5");
    assert.equal(formatSyntaxShortcut("orderedList", platform), "Ctrl+Shift+[");
  }
  assert.equal(formatSyntaxShortcut("bold", "mac"), "⌘B");
  assert.equal(formatSyntaxShortcut("strikethrough", "mac"), "⌃⇧`");
  assert.equal(formatSyntaxShortcut("orderedList", "mac"), "⌘⌥O");
  assert.equal(formatSyntaxShortcut("heading1", "mac"), "⌘1");
});

test("快捷键提示将 Darwin 识别为 macOS", () => {
  assert.equal(detectSyntaxShortcutPlatform("Darwin"), "mac");
});

test("快捷键提示不会把中间含 win 的未知平台识别为 Windows", () => {
  assert.equal(detectSyntaxShortcutPlatform("UnknownWinPlatform"), "linux");
});

test("快捷键提示仅在平台前缀识别 macOS 标识", () => {
  const platforms = [
    "UnknownDarwinPlatform",
    "NotMacPlatform",
    "NotiPhonePlatform",
    "NotiPadPlatform",
    "NotiPodPlatform",
  ];
  assert.deepEqual(
    platforms.map((platform) => detectSyntaxShortcutPlatform(platform)),
    platforms.map(() => "linux"),
  );
});

test("keymap 将按键分派到对应 SyntaxAction", () => {
  const calls: SyntaxAction[] = [];
  const bindings = createSyntaxKeymap((_view, action) => {
    calls.push(action);
    return true;
  });
  assert.equal(bindings.length, 14);
  assert.equal(bindings[0].run?.({} as never), true);
  assert.deepEqual(calls, ["bold"]);
});
