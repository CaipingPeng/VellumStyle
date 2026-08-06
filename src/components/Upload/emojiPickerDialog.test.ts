import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("表情搜索弹窗接入后台搜索并以上传后的永久链接插入", async () => {
  const source = await readFile(new URL("./EmojiPickerDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /searchRemoticon/);
  assert.match(source, /openWechatBackendHidden/);
  assert.match(source, /showWechatBackend/);
  assert.match(source, /backendWindowUrl/);
  assert.match(source, /getEmojiCdnUrl/);
  assert.match(source, /WECHAT_SMILEY_EMOJIS/);
  assert.match(source, /toProxyImageUrl/);
  assert.match(source, /gen_emoji_result/);
  assert.match(source, /normal_emoji_result/);
  assert.match(source, /aes_key/);
  assert.match(source, /emoticonType/);
  assert.match(source, /gen_emoji_result\?\.items, 1\)/);
  assert.match(source, /normal_emoji_result\?\.items, 0\)/);
  assert.match(source, /thumbUrl/);
  assert.match(source, /微表情/);
  assert.match(source, /smileyKey/);
  assert.match(source, /smileyImgHtml/);
  assert.match(source, /display:inline-block/);
  assert.match(source, /rich_pages wxw-img/);
  // 默认微表情占主区域，搜索/微表情通过右侧图标切换
  assert.match(source, /useState<"search" \| "smiley">\("smiley"\)/);
  assert.match(source, /switchTab\("search"\)/);
  assert.match(source, /switchTab\("smiley"\)/);
  assert.match(source, /border border-border bg-bg/);
  // 当前功能用主题色强调（微表情标签 / 搜索框边框）
  assert.match(source, /bg-accent px-3/);
  assert.match(source, /border-accent\/60/);
  assert.match(source, /selectedCount === 0/);
  assert.match(source, /加载更多/);
  assert.match(source, /插入所选/);
  assert.match(source, /点击表情可多选/);
  assert.match(source, /按回车搜索/);
  assert.match(source, /插入时自动转换为永久图片链接/);
  // 完全搜索：只由用户按回车触发，不再有输入防抖自动搜索
  assert.match(source, /onKeyDown/);
  assert.match(source, /event\.key === "Enter"/);
  assert.doesNotMatch(source, /searchTimer/);
  assert.doesNotMatch(source, /window\.setTimeout/);
  assert.doesNotMatch(source, /overflow-x-auto|overflow-x: auto/);
});
