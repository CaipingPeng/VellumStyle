import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("视频号弹窗接入后台接口并以官方组件插入", async () => {
  const source = await readFile(new URL("./VideoChannelDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /searchVideoAccount/);
  assert.match(source, /getVideoFeedList/);
  assert.match(source, /getVideoMediaList/);
  assert.match(source, /searchVideoFeeds/);
  assert.match(source, /waitBackendCommand/);
  assert.match(source, /toProxyImageUrl/);
  assert.match(source, /mp-common-videosnap/);
  // 加载更多：沿用 get_feed_list 的 last_buff 继续翻页，并展示“加载更多”按钮
  assert.match(source, /lastBuff/);
  assert.match(source, /hasMore/);
  assert.match(source, /getVideoFeedList\(selectedAccount\.username, lastBuff\)/);
  assert.match(source, /加载更多/);
  // 账号内视频描述检索：走服务端 search_feeds（可命中未加载的历史视频），防抖 + 会话防串扰
  assert.match(source, /feedQuery/);
  assert.match(source, /searchVideoFeeds\(username, keyword, ""\)/);
  assert.match(source, /searchVideoFeeds\(selectedAccount\.username, keyword, searchLastBuff\)/);
  assert.match(source, /feedSearchSessionRef/);
  assert.match(source, /setTimeout/);
  // 命中项渲染官方 highlight_desc 高亮（白名单只保留 em）
  assert.match(source, /highlight_desc/);
  assert.match(source, /sanitizeHighlight/);
  assert.match(source, /ALLOWED_TAGS: \["em"\]/);
  // 置顶：服务端字段兜底解析 + 用户手动置顶，置顶视频排最前并显示角标
  assert.match(source, /PIN_FIELD_CANDIDATES/);
  assert.match(source, /top_flag|is_top|pinned|stick_flag/);
  assert.match(source, /pinnedIds/);
  assert.match(source, /togglePin/);
  assert.match(source, /置顶/);
  assert.match(source, /<Pin size=\{14\}/);
  // 去重 + 排序：按 exportId/nonceId 去重，置顶优先、可选的发布时间倒序
  assert.match(source, /videoKey/);
  assert.match(source, /createTime/);
  assert.match(source, /\.sort\(/);
  assert.match(source, /leftPinned !== rightPinned/);
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
