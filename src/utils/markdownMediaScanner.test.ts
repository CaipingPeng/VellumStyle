import assert from "node:assert/strict";
import {test} from "node:test";
import {scanMarkdownMedia} from "./markdownMediaScanner.ts";

test("keeps unescaped spaces in local markdown image paths", () => {
  const imagePath =
    "C:/Users/Administrator/Desktop/模型路由也可以算大模型？日本Fugu Ultra分析/fugu_assets/fugu_arch_image.png";
  const markdown = `![图1：Sakana官方的Fugu架构图。](${imagePath})`;

  const refs = scanMarkdownMedia(markdown);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].originalUrl, imagePath);
  assert.equal(refs[0].sourceType, "local");
});

test("excludes markdown image titles from the scanned url", () => {
  const refs = scanMarkdownMedia('![alt](./assets/my image.png "caption")');

  assert.equal(refs.length, 1);
  assert.equal(refs[0].originalUrl, "./assets/my image.png");
});

test("html img refs cover the whole tag so imports can normalize to Markdown image syntax", () => {
  const markdown = '前文\n<img src="http://mmbiz.qpic.cn/a.png" alt="image" style="zoom:50%;" />\n后文';

  const refs = scanMarkdownMedia(markdown);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].syntax, "html-img");
  assert.equal(refs[0].replacementMode, "token");
  assert.equal(markdown.slice(refs[0].start, refs[0].end), '<img src="http://mmbiz.qpic.cn/a.png" alt="image" style="zoom:50%;" />');
});
