import assert from "node:assert/strict";
import {test} from "node:test";
import {activateUser, scopeStorage} from "./profileStorage.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key(i) { return [...values.keys()][i] ?? null; },
    getItem(k) { return values.get(k) ?? null; },
    setItem(k, v) { values.set(k, v); },
    removeItem(k) { values.delete(k); },
    clear() { values.clear(); },
  };
}

test("账户之间的文章缓存、偏好和素材映射相互隔离，清空仅影响当前用户", () => {
  const raw = memoryStorage();
  raw.setItem("vellumstyle", "legacy private draft");
  const alice = scopeStorage(raw, "alice");
  const bob = scopeStorage(raw, "bob");
  assert.equal(alice.getItem("vellumstyle"), null);
  alice.setItem("vellumstyle", "alice draft");
  alice.setItem("vs-video-media-ids", "alice media");
  bob.setItem("vellumstyle", "bob draft");
  assert.equal(bob.getItem("vs-video-media-ids"), null);
  assert.equal(alice.getItem("vellumstyle"), "alice draft");
  assert.equal(bob.length, 1);
  assert.equal(bob.key(0), "vellumstyle");
  alice.clear();
  assert.equal(alice.length, 0);
  assert.equal(bob.getItem("vellumstyle"), "bob draft");
  assert.equal(raw.getItem("vellumstyle"), "legacy private draft");
});

test("首个用户只迁移旧缓存一次，其他账户无法继承旧草稿和媒体绑定", () => {
  const raw = memoryStorage();
  Object.defineProperty(window, "localStorage", {configurable: true, value: raw});
  raw.setItem("vellumstyle", "legacy private draft");
  raw.setItem("vs-audio-bindings", "legacy audio");
  raw.setItem("unrelated", "keep");
  const user = {id: "first", name: "First", ownsLegacyData: true};
  activateUser(user);
  const first = scopeStorage(raw, "first");
  assert.equal(first.getItem("vellumstyle"), "legacy private draft");
  assert.equal(first.getItem("vs-audio-bindings"), "legacy audio");
  assert.equal(raw.getItem("vellumstyle"), null);
  assert.equal(raw.getItem("vs-audio-bindings"), null);
  assert.equal(raw.getItem("unrelated"), "keep");
  first.setItem("vellumstyle", "new draft");
  activateUser(user);
  assert.equal(first.getItem("vellumstyle"), "new draft");
  assert.equal(scopeStorage(raw, "second").getItem("vellumstyle"), null);
  assert.throws(() => activateUser({...user, id: "second"}), /重启/);
});
