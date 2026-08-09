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
  // 合成表情（emoticonType=1）的 emoji_url 未加密，搜索结果直接显示动图；
  // 普通表情（emoticonType=0）才回退静态缩略图 + hover 转换。
  assert.match(source, /item\.emoticonType === 1/);
  assert.match(source, /toProxyImageUrl\(item\.emojiUrl\)/);
  assert.match(source, /if \(item\.emoticonType === 1\) return;/);
  assert.match(source, /经典表情/);
  assert.match(source, /smileyKey/);
  assert.match(source, /smileyImgHtml/);
  assert.match(source, /display:inline-block/);
  assert.match(source, /rich_pages wxw-img/);
  // 微表情必须用 !important 固定 20×20，否则主题/微信编辑器会覆盖为原图尺寸
  assert.match(source, /width:20px !important/);
  assert.match(source, /height:20px !important/);
  // 默认搜索表情占主区域，经典表情通过右侧图标切换；
  // 每次打开弹窗都回到搜索页，经典表情仅作为可选项。
  assert.match(source, /useState<"search" \| "smiley">\("search"\)/);
  assert.match(source, /setActiveTab\("search"\)/);
  assert.match(source, /switchTab\("search"\)/);
  assert.match(source, /switchTab\("smiley"\)/);
  assert.match(source, /border border-border bg-bg/);
  // 当前功能用主题色强调（微表情标签 / 搜索框边框）
  assert.match(source, /flex h-8 min-w-0 flex-1 items-center justify-center rounded-md bg-accent/);
  assert.match(source, /border-\[color:var\(--ring\)\]/);
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
