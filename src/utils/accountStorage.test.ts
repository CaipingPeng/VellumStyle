import assert from "node:assert/strict";
import {test} from "node:test";
import {scopeAccountStorage, migrateLegacyAccountStorage, recoverSharedPreferences} from "./accountStorage.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {return values.size;},
    key(index) {return [...values.keys()][index] ?? null;},
    getItem(key) {return values.get(key) ?? null;},
    setItem(key, value) {values.set(key, value);},
    removeItem(key) {values.delete(key);},
    clear() {values.clear();},
  };
}

test("account media and publishing preferences remain isolated across switches", () => {
  const raw = memoryStorage();
  raw.setItem("vellumstyle", "shared-editor");
  const a = scopeAccountStorage(raw, "wxA");
  const b = scopeAccountStorage(raw, "wxB");
  a.setItem("vs-video-media-ids", "video-a");
  a.setItem("vellumstyle.publishSettings", "author-a");
  assert.equal(b.getItem("vs-video-media-ids"), null);
  b.setItem("vs-video-media-ids", "video-b");
  assert.equal(scopeAccountStorage(raw, "wxA").getItem("vs-video-media-ids"), "video-a");
  b.clear();
  assert.equal(a.getItem("vs-video-media-ids"), "video-a");
  assert.equal(raw.getItem("vellumstyle"), "shared-editor");
});

test("legacy media is claimed once by the original account", () => {
  const raw = memoryStorage();
  raw.setItem("vs-audio-bindings", "old-audio");
  migrateLegacyAccountStorage(raw, "wxOld");
  migrateLegacyAccountStorage(raw, "wxNew");
  assert.equal(scopeAccountStorage(raw, "wxOld").getItem("vs-audio-bindings"), "old-audio");
  assert.equal(scopeAccountStorage(raw, "wxNew").getItem("vs-audio-bindings"), null);
});

test("recover shared preferences from the withdrawn login version without overwriting current edits", () => {
  const raw = memoryStorage();
  raw.setItem("vellumstyle.user.owner.legacy-migrated", "1");
  raw.setItem("vellumstyle.user.owner.vellumstyle", "old-editor");
  raw.setItem("vellumstyle.user.owner.vellumstyle.publishSettings", "old-author");
  raw.setItem("vellumstyle", "current-editor");
  recoverSharedPreferences(raw);
  assert.equal(raw.getItem("vellumstyle"), "current-editor");
  assert.equal(raw.getItem("vellumstyle.publishSettings"), "old-author");
});
