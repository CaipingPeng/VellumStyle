import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("AI 配图对话框：仿官方聊天式布局，历史/生成/调整/应用全流程", async () => {
  const source = await readFile(new URL("./AiImageDialog.tsx", import.meta.url), "utf8");

  // 会话与历史会话
  assert.match(source, /aiImageGetSession/);
  assert.match(source, /aiImageGetBizRecentImgList/);
  assert.match(source, /aiImageGetStyle/);
  assert.match(source, /aiImageGetExample/);
  assert.match(source, /waitBackendCommand/);
  assert.match(source, /session_id/);

  // 官方聊天布局
  assert.match(source, /AI配图/);
  assert.match(source, /历史对话/);
  assert.match(source, /新建对话/);
  assert.match(source, /欢迎使用 AI配图，试试这样对我说/);
  assert.match(source, /请描述你想要创作的内容/);
  assert.match(source, /告诉我你想怎么改/);
  assert.match(source, /已为你生成图片/);
  assert.match(source, /图片生成中\.\.\./);
  assert.match(source, /生成失败，请调整提示词后重试/);
  assert.match(source, /微信公众平台AI配图功能使用条款/);

  // 生成：文生图 gen_type 5、调整 gen_type 6 + refer_pic_ids、轮询 get_ai_pic
  assert.match(source, /aiImageStartCreation/);
  assert.match(source, /gen_type: 5/);
  assert.match(source, /gen_type: image\?\.id \? 6 : 5/);
  assert.match(source, /refer_pic_ids/);
  assert.match(source, /is_sensitive_prompt/);
  assert.match(source, /aiImageGetPic/);
  assert.match(source, /GEN_POLL_INTERVAL_MS = 5000/);
  assert.match(source, /GEN_TIMEOUT_MS = 3 \* 60 \* 1000/);

  // 图片瓦片：比例尺寸、调整/应用、AI 水印、失败态、进度环
  assert.match(source, /imageTileSize/);
  assert.match(source, /1024x436/);
  assert.match(source, /调整/);
  assert.match(source, /应用/);
  assert.match(source, /AI<\/span>/);
  assert.match(source, /图片<\/span>/);
  assert.match(source, /生成失败/);
  assert.match(source, /conic-gradient/);

  // 会话提示词标签（点击触发调整）
  assert.match(source, /sessionPrompt/);
  assert.match(source, /adjustWithTag/);

  // 插入：insert_ai_pic 返回永久 mmbiz 链接
  assert.match(source, /aiImageInsertPic/);
  assert.match(source, /pic_id/);
  assert.match(source, /cdn_url/);
  assert.match(source, /fileid/);
  assert.match(source, /!\[AI配图\]\(\$\{inserted\.cdnUrl\}\)/);

  // 后台窗口未打开时自动开窗等待并重试
  assert.match(source, /waitBackendCommand/);
  assert.doesNotMatch(source, /找相关图/);
});
