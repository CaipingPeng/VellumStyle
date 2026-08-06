import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("表情搜索弹窗接入后台搜索并以上传后的永久链接插入", async () => {
  const source = await readFile(new URL("./EmojiPickerDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /searchRemoticon/);
  assert.match(source, /openWechatBackendHidden/);
  assert.match(source, /showWechatBackend/);
  assert.match(source, /closeWechatBackend/);
  assert.match(source, /uploadRemoteImage/);
  assert.match(source, /toProxyImageUrl/);
  assert.match(source, /gen_emoji_result/);
  assert.match(source, /normal_emoji_result/);
  assert.match(source, /thumbUrl/);
  assert.match(source, /加载更多/);
  assert.match(source, /插入所选/);
  assert.match(source, /点击表情可多选/);
  assert.match(source, /搜索表情/);
  assert.match(source, /插入时会自动上传为永久图片链接/);
  assert.doesNotMatch(source, /overflow-x-auto|overflow-x: auto/);
});
