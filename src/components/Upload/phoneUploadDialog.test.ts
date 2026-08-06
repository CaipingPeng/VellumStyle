import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("手机传图对话框：取二维码→轮询上传列表→确认保存并插入", async () => {
  const source = await readFile(new URL("./PhoneUploadDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /getPhoneUploadQrcode/);
  assert.match(source, /getPhoneUploadPicList/);
  assert.match(source, /confirmPhoneUploadPics/);
  // 后台窗口未打开时自动开窗等待并重试
  assert.match(source, /waitBackendCommand/);
  assert.match(source, /qrcode_uuid/);
  assert.match(source, /qrcode_tmp_url/);
  assert.match(source, /upload_pic_info_list/);
  assert.match(source, /pic_info_list/);
  assert.match(source, /svr_time/);
  assert.match(source, /seq:/);
  assert.match(source, /fileid: ""/);
  assert.match(source, /toProxyImageUrl/);
  assert.match(source, /POLL_INTERVAL_MS = 2000/);
  assert.match(source, /用微信扫码上传图片/);
  assert.match(source, /确认插入/);
  assert.match(source, /手机图片\$\{index \+ 1\}/);
  assert.doesNotMatch(source, /overflow-x-auto|overflow-x: auto/);
});
