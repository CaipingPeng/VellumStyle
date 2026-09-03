import assert from "node:assert/strict";
import test from "node:test";
import {deleteArticleTemplate, listArticleTemplates, parseTemplateTags, saveArticleTemplate} from "./articleTemplates.ts";

test("模板标签支持中英文分隔并去重", () => {
  assert.deepEqual(parseTemplateTags("周报, 工作 周报，公众号"), ["周报", "工作", "公众号"]);
});

test("Web 回退可保存、更新并删除模板", async () => {
  const template = {id: "test-template", name: "周报", description: "", tags: ["工作"], content: "# 周报", updatedAt: 1};
  await saveArticleTemplate(template);
  assert.equal((await listArticleTemplates()).find((item) => item.id === template.id)?.content, "# 周报");
  await saveArticleTemplate({...template, content: "# 新周报", updatedAt: 2});
  assert.equal((await listArticleTemplates()).find((item) => item.id === template.id)?.content, "# 新周报");
  await deleteArticleTemplate(template.id);
  assert.equal((await listArticleTemplates()).some((item) => item.id === template.id), false);
});
