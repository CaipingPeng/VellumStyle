import assert from "node:assert/strict";
import test from "node:test";
import {buildCommandRegistry, filterCommands, isCommandPaletteShortcut} from "./registry.ts";

function actions() {
  const noop = () => undefined;
  return {
    toggleDocuments: noop,
    toggleOutline: noop,
    openSettings: noop,
    openMaterialLibrary: noop,
    openEmoji: noop,
    openPhoneUpload: noop,
    openAiImage: noop,
    openMusic: noop,
    openVideoChannel: noop,
    openTableEditor: noop,
    openFormulaEditor: noop,
    openTemplateLibrary: noop,
    openDocumentHistory: noop,
    syncNow: noop,
    undo: noop,
    redo: noop,
    openSearch: noop,
    runSyntaxAction: noop,
  };
}

test("注册表命令 id 唯一并包含全部语法动作", () => {
  const commands = buildCommandRegistry(actions());
  assert.equal(new Set(commands.map((command) => command.id)).size, commands.length);
  assert.ok(commands.some((command) => command.id === "syntax.bold"));
  assert.ok(commands.some((command) => command.id === "insert.ai-image"));
  assert.ok(commands.some((command) => command.id === "edit.history"));
});

test("命令搜索同时匹配名称、分组和关键词", () => {
  const commands = buildCommandRegistry(actions());
  assert.deepEqual(filterCommands(commands, "微信 表情").map((command) => command.id), ["insert.emoji"]);
  assert.ok(filterCommands(commands, "编辑 code").some((command) => command.id === "syntax.codeBlock"));
  assert.deepEqual(filterCommands(commands, "找不到").map((command) => command.id), []);
});

test("命令面板快捷键支持 Ctrl 和 Command", () => {
  assert.equal(isCommandPaletteShortcut({key: "P", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true}), true);
  assert.equal(isCommandPaletteShortcut({key: "p", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true}), true);
  assert.equal(isCommandPaletteShortcut({key: "p", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false}), false);
});
