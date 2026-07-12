import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const previewSource = readFile(new URL("./Preview.tsx", import.meta.url), "utf8");
const thumbnailSource = readFile(new URL("../Theme/ThemeThumbnail.tsx", import.meta.url), "utf8");
const exportSource = readFile(new URL("../../utils/exportArticle.ts", import.meta.url), "utf8");

test("应用暗色模式不会改变文章预览画布的主题底色", async () => {
  const source = await previewSource;
  assert.match(source, /id=\{ARTICLE_BOX_ID\}[\s\S]*background: "#fff"/);
  assert.doesNotMatch(source, /appearanceMode|data-appearance/);
});

test("主题缩略图继续呈现真实的白色文章输出", async () => {
  assert.match(await thumbnailSource, /background: "#fff"/);
});

test("文章导出链路不读取应用外观状态", async () => {
  const source = await exportSource;
  assert.doesNotMatch(source, /appearanceMode|data-appearance|useStore/);
});
