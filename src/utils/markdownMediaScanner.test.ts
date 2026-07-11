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

test("html img metadata preserves alt and explicit dimensions before zoom", () => {
  const refs = scanMarkdownMedia(
    `<img style="zoom:25%" height='120px' alt="图]一" src="./image.png" width=50%>`,
  );

  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0].htmlImageMeta, {
    alt: "图]一",
    width: "50%",
    height: "120px",
  });
});

test("html img metadata uses zoom as responsive width when dimensions are absent", () => {
  const refs = scanMarkdownMedia(`<img src="./image.png" style="display:block; zoom: 40%; margin:0">`);

  assert.deepEqual(refs[0].htmlImageMeta, {
    alt: "",
    width: "40%",
  });
});
