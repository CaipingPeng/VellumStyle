import assert from "node:assert/strict";
import {test} from "node:test";
import {isManualSyncShortcut, type ManualSyncShortcutEvent} from "./manualSyncShortcut.ts";

function shortcut(overrides: Partial<ManualSyncShortcutEvent> = {}): ManualSyncShortcutEvent {
  return {
    key: "s",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

test("主动同步快捷键支持 Ctrl+S 和 Cmd+S", () => {
  assert.equal(isManualSyncShortcut(shortcut()), true);
  assert.equal(isManualSyncShortcut(shortcut({ctrlKey: false, metaKey: true, key: "S"})), true);
});

test("主动同步快捷键不占用带额外修饰键或普通输入的组合", () => {
  assert.equal(isManualSyncShortcut(shortcut({altKey: true})), false);
  assert.equal(isManualSyncShortcut(shortcut({shiftKey: true})), false);
  assert.equal(isManualSyncShortcut(shortcut({ctrlKey: false})), false);
  assert.equal(isManualSyncShortcut(shortcut({key: "x"})), false);
});
