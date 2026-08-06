import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const previewSource = readFile(new URL("./Preview.tsx", import.meta.url), "utf8");
const thumbnailSource = readFile(new URL("../Theme/ThemeThumbnail.tsx", import.meta.url), "utf8");
const exportSource = readFile(new URL("../../utils/exportArticle.ts", import.meta.url), "utf8");

test("文章预览画布不再垫白色底，且不依赖应用外观", async () => {
  const source = await previewSource;
  assert.match(source, /id=\{ARTICLE_BOX_ID\}[\s\S]*background: "transparent"/);
  assert.doesNotMatch(source, /id=\{ARTICLE_BOX_ID\}[\s\S]{0,600}padding: "24px 32px"/);
  assert.match(source, /className=\{needsNeutralArticleBg \? "vs-preview-article vs-article-neutral-bg" : "vs-preview-article"\}/);
  assert.match(source, /articleRootBackgroundIsSolid/);
  assert.doesNotMatch(source, /appearanceMode|data-appearance/);
});

test("文章描边投影只作用于预览滚动容器，不影响导出", async () => {
  const css = await readFile(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.editor-preview-scrollbar #article\s*\{[\s\S]*?border: 1px solid var\(--card-border\)/);
  assert.match(css, /\.editor-preview-scrollbar #article\s*\{[\s\S]*?box-shadow: var\(--shadow-md\)/);
});

test("主题缩略图继续呈现真实的白色文章输出", async () => {
  assert.match(await thumbnailSource, /background: "#fff"/);
});

test("文章导出链路不读取应用外观状态", async () => {
  const source = await exportSource;
  assert.doesNotMatch(source, /appearanceMode|data-appearance|useStore/);
});

test("预览为素材库视频注入本地占位并在导出时还原", async () => {
  const source = await previewSource;
  const css = await readFile(new URL("../../styles/globals.css", import.meta.url), "utf8");
  const converterSource = await readFile(new URL("../../markdown/converter.ts", import.meta.url), "utf8");

  assert.match(source, /vs-video-placeholder/);
  assert.match(source, /iframe\.video_iframe/);
  assert.match(source, /vsVideoHidden/);
  assert.match(source, /mp-common-mpaudio/);
  assert.match(source, /mpvoice\.js_editor_audio/);
  assert.match(source, /vsAudioHidden/);
  assert.match(source, /vs-audio-placeholder/);
  assert.match(source, /本地预览不播放/);
  assert.match(css, /iframe\.video_iframe\[data-vs-video-hidden="true"\]/);
  assert.match(css, /\.vs-video-placeholder \{/);
  assert.match(css, /mpvoice\.js_editor_audio\[data-vs-audio-hidden="true"\]/);
  assert.match(css, /\.vs-audio-placeholder \{/);
  assert.match(converterSource, /\.vs-video-placeholder/);
  assert.match(converterSource, /data-vs-video-src/);
  assert.match(converterSource, /\.vs-audio-placeholder/);
  assert.match(converterSource, /data-vs-audio-hidden/);
});
