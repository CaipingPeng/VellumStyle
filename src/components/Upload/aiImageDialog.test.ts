import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("AI 配图对话框：创建会话→拉取风格→生成轮询→转换永久素材后插入", async () => {
  const source = await readFile(new URL("./AiImageDialog.tsx", import.meta.url), "utf8");

  // 会话与会话内接口
  assert.match(source, /aiImageGetSession/);
  assert.match(source, /aiImageGetStyle/);
  assert.match(source, /aiImageGetExample/);
  assert.match(source, /waitBackendCommand/);
  assert.match(source, /session_id/);

  // 生成：start_ai_creation（gen_type 5）+ 轮询 get_ai_pic
  assert.match(source, /aiImageStartCreation/);
  assert.match(source, /gen_type: 5/);
  assert.match(source, /is_sensitive_prompt/);
  assert.match(source, /aiImageGetPic/);
  assert.match(source, /GEN_POLL_INTERVAL_MS = 5000/);
  assert.match(source, /GEN_TIMEOUT_MS = 3 \* 60 \* 1000/);
  assert.match(source, /status === 3/);

  // 相关图：related_search + append_related_search
  assert.match(source, /aiImageRelatedSearch/);
  assert.match(source, /aiImageAppendRelatedSearch/);
  assert.match(source, /search_url/);

  // 插入：insert_ai_pic 返回永久 mmbiz 链接
  assert.match(source, /aiImageInsertPic/);
  assert.match(source, /pic_id/);
  assert.match(source, /cdn_url/);
  assert.match(source, /fileid/);
  assert.match(source, /!\[AI配图\]\(\$\{inserted\.cdnUrl\}\)/);

  // UI 文案与交互
  assert.match(source, /AI 配图/);
  assert.match(source, /生成图片/);
  assert.match(source, /找相关图/);
  assert.match(source, /描述图片/);
  assert.match(source, /图片比例/);
  assert.match(source, /风格（可不选）/);
  assert.match(source, /插入/);
  assert.match(source, /未上传图片/);
});
