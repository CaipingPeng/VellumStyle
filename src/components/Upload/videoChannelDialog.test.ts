import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("视频号弹窗接入后台接口并以官方组件插入", async () => {
  const source = await readFile(new URL("./VideoChannelDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /searchVideoAccount/);
  assert.match(source, /getVideoFeedList/);
  assert.match(source, /getVideoMediaList/);
  assert.match(source, /waitBackendCommand/);
  assert.match(source, /toProxyImageUrl/);
  assert.match(source, /mp-common-videosnap/);
  // 官方草稿结构：section 带 channels_iframe_wrp custom_select_card_wrp + nodeleaf，
  // 不带内联 style；widget 不带 mp_common_widget，data-height 用卡片显示比例。
  assert.match(source, /channels_iframe_wrp custom_select_card_wrp/);
  assert.match(source, /wxw_wechannel_card_not_horizontal/);
  assert.match(source, /nodeleaf=""/);
  assert.match(source, /<mp-common-videosnap class="js_uneditable custom_select_card channels_iframe videosnap_video_iframe"/);
  assert.match(source, /draggable="true"/);
  assert.doesNotMatch(source, /videosnap_video_iframe mp_common_widget/);
  assert.doesNotMatch(source, /text-align:center;width:65%/);
  assert.match(source, /Math\.round\(\(video\.width \* 4\) \/ 3\)/);
  assert.match(source, /data-pluginname/);
  assert.match(source, /data-username/);
  assert.match(source, /data-nonceid/);
  assert.match(source, /data-authiconurl/);
  assert.match(source, /acct_list/);
  assert.match(source, /插入视频号/);
  assert.match(source, /输入视频号搜索/);
});
