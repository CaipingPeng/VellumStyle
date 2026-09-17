import assert from "node:assert/strict";
import {test} from "node:test";
import {createRenderCache, htmlByteSize} from "./renderCache.ts";

test("htmlByteSize 按 UTF-16 计，中文与 ASCII 都是 2 字节/字符", () => {
  assert.equal(htmlByteSize(""), 0);
  assert.equal(htmlByteSize("abc"), 6);
  assert.equal(htmlByteSize("正文"), 4);
});

test("未超限时全部保留，且 get 能取回原值", () => {
  const cache = createRenderCache({maxEntries: 5, maxBytes: 1000});
  cache.set("a", "<p>甲</p>");
  cache.set("b", "<p>乙</p>");
  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), "<p>甲</p>");
  assert.equal(cache.get("b"), "<p>乙</p>");
  assert.equal(cache.get("missing"), undefined);
  assert.equal(cache.byteSize, htmlByteSize("a<p>甲</p>") + htmlByteSize("b<p>乙</p>"));
});

test("超过条数上限时淘汰最旧的（FIFO）", () => {
  const cache = createRenderCache({maxEntries: 3, maxBytes: 10_000});
  for (const key of ["a", "b", "c", "d"]) {
    cache.set(key, `<p>${key}</p>`);
  }
  assert.equal(cache.size, 3);
  assert.equal(cache.get("a"), undefined, "最旧的 a 应被淘汰");
  assert.equal(cache.get("b"), "<p>b</p>");
  assert.equal(cache.get("d"), "<p>d</p>");
});

test("超过字节预算时按最旧的淘汰，直到回到预算内", () => {
  // 预算 22 字节，包含单字符键与 10 字符 HTML。
  const cache = createRenderCache({maxEntries: 100, maxBytes: 22});
  cache.set("a", "0123456789");
  assert.equal(cache.byteSize, 22);
  cache.set("b", "abcdefghij");
  assert.equal(cache.byteSize, 22, "总字节数必须回落到预算内");
  assert.equal(cache.size, 1);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "abcdefghij");
});

test("单条就超过字节预算时仍保留它，避免大文档永远命不中缓存", () => {
  const cache = createRenderCache({maxEntries: 100, maxBytes: 4});
  cache.set("huge", "0123456789");
  assert.equal(cache.size, 1);
  assert.equal(cache.get("huge"), "0123456789");
  // 再来一条更大的，此时才允许淘汰旧的
  cache.set("bigger", "0123456789abcdefghij");
  assert.equal(cache.size, 1);
  assert.equal(cache.get("huge"), undefined);
  assert.equal(cache.get("bigger"), "0123456789abcdefghij");
});

test("同一个 key 重复写入不会把字节数越算越多", () => {
  const cache = createRenderCache({maxEntries: 100, maxBytes: 1000});
  cache.set("k", "abcd");
  assert.equal(cache.byteSize, 10);
  cache.set("k", "abcdefgh");
  assert.equal(cache.byteSize, 18, "旧值要先扣掉");
  assert.equal(cache.size, 1);
  assert.equal(cache.get("k"), "abcdefgh");
});

test("clear 清空条目与字节计数", () => {
  const cache = createRenderCache({maxEntries: 5, maxBytes: 1000});
  cache.set("a", "<p>甲</p>");
  cache.set("b", "<p>乙</p>");
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.byteSize, 0);
  assert.equal(cache.get("a"), undefined);
});

test("源码键也占用预算，更新旧条目后保留最近写入的结果", () => {
  const cache = createRenderCache({maxEntries: 10, maxBytes: 30});
  cache.set("a".repeat(10), "x");
  cache.set("b".repeat(10), "y");
  assert.equal(cache.size, 1);
  assert.equal(cache.byteSize, 22);
  cache.set("c", "z");
  cache.set("b".repeat(10), "longer");
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("b".repeat(10)), "longer");
  assert.equal(cache.byteSize, 32);
});

test("条数与字节两条约束同时生效时取更严的那条", () => {
  const cache = createRenderCache({maxEntries: 2, maxBytes: 1000});
  cache.set("a", "x");
  cache.set("b", "y");
  cache.set("c", "z");
  assert.equal(cache.size, 2, "条数上限 2 生效");
  assert.deepEqual([cache.get("a"), cache.get("b"), cache.get("c")], [undefined, "y", "z"]);
});
