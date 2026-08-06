import assert from "node:assert/strict";
import test from "node:test";
import {WECHAT_SMILEY_EMOJIS} from "./wechatSmileyEmojis.ts";

test("微信默认微表情数据完整且 URL 格式正确", () => {
  assert.ok(
    WECHAT_SMILEY_EMOJIS.length >= 60,
    `经典微表情应至少 60 个，实际 ${WECHAT_SMILEY_EMOJIS.length}`,
  );
  const names = new Set<string>();
  for (const emoji of WECHAT_SMILEY_EMOJIS) {
    assert.match(emoji.title, /^\[.+\]$/, `${emoji.name} 的 title 应为 [xxx] 形式`);
    assert.match(
      emoji.url,
      /^https:\/\/res\.wx\.qq\.com\/t\/wx_fed\/we-emoji\/res\/assets\/Expression\/Expression_\d+@2x\.png$/,
      `${emoji.name} 的 URL 格式异常：${emoji.url}`,
    );
    assert.ok(!names.has(emoji.name), `name 重复：${emoji.name}`);
    names.add(emoji.name);
  }
});
