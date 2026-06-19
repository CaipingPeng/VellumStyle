import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PUBLISH_SETTINGS,
  loadPublishSettings,
  savePublishSettings,
  type PublishSettings,
} from "./publishSettings.ts";

class MemoryStorage {
  private items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

test("loadPublishSettings 没有历史配置时返回草稿接口默认值", () => {
  const storage = new MemoryStorage();

  assert.deepEqual(loadPublishSettings(storage), DEFAULT_PUBLISH_SETTINGS);
});

test("savePublishSettings 会落盘作者和评论设置供下次打开复用", () => {
  const storage = new MemoryStorage();
  const settings: PublishSettings = {
    author: "作者名",
    needOpenComment: 1,
    onlyFansCanComment: 1,
  };

  savePublishSettings(settings, storage);

  assert.deepEqual(loadPublishSettings(storage), settings);
});

test("loadPublishSettings 会修正损坏或越界的历史配置", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "vellumstyle.publishSettings",
    JSON.stringify({
      author: 42,
      needOpenComment: 2,
      onlyFansCanComment: "1",
    }),
  );

  assert.deepEqual(loadPublishSettings(storage), DEFAULT_PUBLISH_SETTINGS);
});
