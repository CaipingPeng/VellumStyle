import assert from "node:assert/strict";
import {test} from "node:test";
import {
  SYNTAX_ACTIONS,
  SYNTAX_SHORTCUTS,
  createSyntaxKeymap,
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
