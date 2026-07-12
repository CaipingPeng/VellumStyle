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

test("HTML img attributes containing backticks remain scannable", () => {
  const tag = '<img alt="`caption`" src="inline-attr.png">';
  const refs = scanMarkdownMedia(tag);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].originalUrl, "inline-attr.png");
  assert.equal(refs[0].syntax, "html-img");
  assert.equal(refs[0].start, 0);
  assert.equal(refs[0].end, tag.length);
});

test("HTML img attributes containing literal code tags remain scannable", () => {
  const tag = '<img alt="<code>literal</code>" src="attr-code.png">';
  const refs = scanMarkdownMedia(tag);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].originalUrl, "attr-code.png");
  assert.equal(refs[0].syntax, "html-img");
  assert.equal(refs[0].start, 0);
  assert.equal(refs[0].end, tag.length);
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

test("excludes every supported media syntax in inline code while preserving exact real-image offsets", () => {
  const markdown = [
    "`![md](inline.png) <img src=\"inline-html.png\"> ![[inline-obsidian.png]] [video](inline.mp4)`",
    "``![md](multi.png) <img src=\"multi-html.png\"> ![[multi-obsidian.png]] [video](multi.mp4) ` literal``",
    "![real](real.png)",
  ].join("\n");

  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.indexOf("real.png");

  assert.equal(refs.length, 1);
  assert.equal(refs[0].originalUrl, "real.png");
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + "real.png".length);
  assert.equal(markdown.slice(refs[0].start, refs[0].end), "real.png");
});

test("inline code spans can cross lines", () => {
  const markdown = "`first line\n![hidden](multiline.png)\nlast line`\n![real](real.png)";

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["real.png"],
  );
});

test("escaped and unmatched backticks stay literal and do not hide later media", () => {
  const markdown = "\\`![escaped](escaped.png)`\n\n` unmatched\n![real](real.png)";

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["escaped.png", "real.png"],
  );
});

test("an escaped backtick only consumes one character from a longer delimiter run", () => {
  const markdown = "\\``![hidden](escaped-run.png)`\n![real](after-escaped-run.png)";

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["after-escaped-run.png"],
  );
});

test("keeps a genuine indented list image with exact source offsets", () => {
  const markdown = "1. parent\n   - child\n     ![nested](nested.png)";

  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.indexOf("nested.png");

  assert.equal(refs.length, 1);
  assert.equal(refs[0].originalUrl, "nested.png");
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + "nested.png".length);
  assert.equal(markdown.slice(refs[0].start, refs[0].end), "nested.png");
});


test("uses markdown-it indented code tokens without blanket-dropping list indentation", () => {
  const markdown = "    ![hidden](indented-code.png)\n\n1. item\n   ![real](list-image.png)";

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["list-image.png"],
  );
});

test("fenced code excludes all supported media syntax for backtick and tilde fences", () => {
  const markdown = [
    "```ts",
    "![markdown](fenced.png)",
    "<img src=\"fenced-html.png\">",
    "![[fenced-obsidian.png]]",
    "[video](fenced.mp4)",
    "````",
    "~~~",
    "![tilde](tilde.png)",
    "~~~",
    "![real](real.png)",
  ].join("\n");

  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.lastIndexOf("real.png");

  assert.deepEqual(refs.map((ref) => ref.originalUrl), ["real.png"]);
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + "real.png".length);
});

test("fenced code follows repeated blockquotes, nested lists, and continuation indentation", () => {
  const markdown = [
    "123. item",
    "     > > - child",
    "     > >      ```",
    "     > >      [hidden](nested.mp4)",
    "     > >      ```",
    "     > >   ![real](nested-real.png)",
  ].join("\n");

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["nested-real.png"],
  );
});

test("fenced code allows up to three relative spaces after a wide list marker", () => {
  const markdown = [
    "123. item",
    "        ~~~",
    "        ![[wide-hidden.png]]",
    "        ~~~",
    "     ![real](wide-real.png)",
  ].join("\n");

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["wide-real.png"],
  );
});

test("fenced code rejects backtick info strings containing backticks", () => {
  const markdown = [
    "```lang`bad",
    "![visible](invalid-info-visible.png)",
    "```",
    "![hidden](valid-fence-hidden.png)",
    "```",
    "![real](invalid-info-real.png)",
  ].join("\n");

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["invalid-info-visible.png", "invalid-info-real.png"],
  );
});

test("fenced code ignores invalid closers and accepts a longer valid closer", () => {
  const markdown = [
    "```",
    "![hidden](first-hidden.png)",
    "``` trailing",
    "![hidden](second-hidden.png)",
    "````   ",
    "![real](after-valid-closer.png)",
  ].join("\n");

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["after-valid-closer.png"],
  );
});

test("unclosed fenced code suppresses media through EOF", () => {
  const markdown = "```\n![hidden](unclosed.png)\n![[also-hidden.png]]";

  assert.deepEqual(scanMarkdownMedia(markdown), []);
});

test("fenced code respects container termination instead of treating an outside marker as its closer", () => {
  const markdown = [
    "- item",
    "  ```",
    "  ![hidden](inside-list.png)",
    "```",
    "![also-hidden](outside-unclosed.png)",
  ].join("\n");

  assert.deepEqual(scanMarkdownMedia(markdown), []);
});

test("triple backticks in ordinary paragraph text do not start fenced code", () => {
  const markdown = "ordinary ``` text ![visible](paragraph.png)";

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["paragraph.png"],
  );
});

test("closed HTML code excludes every supported media syntax across multiline attributed tags", () => {
  const markdown = [
    "before <CoDe",
    " data-language=\"markdown\">",
    "![markdown](code-markdown.png)",
    "<img src=\"code-html.png\">",
    "![[code-obsidian.png]]",
    "[video](code-video.mp4)</cOdE> after",
    "![real](after-code.png)",
  ].join("\n");

  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.lastIndexOf("after-code.png");

  assert.deepEqual(refs.map((ref) => ref.originalUrl), ["after-code.png"]);
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + "after-code.png".length);
});

test("closed HTML pre excludes every supported media syntax", () => {
  const markdown = [
    "<PRE class='language-markdown'>",
    "![markdown](pre-markdown.png)",
    "<img src=\"pre-html.png\">",
    "![[pre-obsidian.png]]",
    "[video](pre-video.mp4)",
    "</pRe>",
    "![real](after-pre.png)",
  ].join("\n");

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["after-pre.png"],
  );
});

test("closed HTML code ends exactly before a following HTML image token", () => {
  const realTag = '<img src="after-inline-code.png" alt="real">';
  const markdown = `<code>![hidden](hidden.png)</code>${realTag}`;

  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.indexOf(realTag);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].originalUrl, "after-inline-code.png");
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + realTag.length);
  assert.equal(markdown.slice(refs[0].start, refs[0].end), realTag);
});

test("unmatched inline HTML code does not suppress remaining media", () => {
  const markdown = "before <code> ![visible](inline-unclosed.png)\n![real](inline-after.png)";

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["inline-unclosed.png", "inline-after.png"],
  );
});

test("closed block-level HTML pre scans media after its closing tag on the opening line", () => {
  const markdown = '<pre>![hidden](hidden.png)</pre> ![real](same-line.png)';
  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.indexOf("same-line.png");

  assert.deepEqual(refs.map((ref) => ref.originalUrl), ["same-line.png"]);
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + "same-line.png".length);
});

test("multiline block-level HTML pre scans media after its closing tag on a later line", () => {
  const markdown = [
    "<pre>",
    "![hidden](hidden.png)",
    "</pre> ![real](later-closing-line.png)",
  ].join("\n");
  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.indexOf("later-closing-line.png");

  assert.deepEqual(refs.map((ref) => ref.originalUrl), ["later-closing-line.png"]);
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + "later-closing-line.png".length);
});

test("a later closed block-level HTML pre does not suppress media before its source range", () => {
  const markdown = [
    "![before](before.png)",
    "",
    "<pre>",
    "![hidden](hidden.png)",
    "</pre>",
    "",
    "![after](after.png)",
  ].join("\n");

  assert.deepEqual(
    scanMarkdownMedia(markdown).map((ref) => ref.originalUrl),
    ["before.png", "after.png"],
  );
});

test("unclosed block-level HTML pre suppresses media through EOF using markdown-it block semantics", () => {
  const markdown = [
    "  <pre data-language=\"markdown\">",
    "![hidden](block-pre.png)",
    "<img src=\"block-pre-html.png\">",
    "![[block-pre-obsidian.png]]",
    "[video](block-pre-video.mp4)",
  ].join("\n");

  assert.deepEqual(scanMarkdownMedia(markdown), []);
});

test("HTML pre block maps preserve container boundaries and following image offsets", () => {
  const markdown = [
    "> <pre>",
    "> ![hidden](quoted-pre.png)",
    "> </pre>",
    "![real](after-quoted-pre.png)",
  ].join("\n");

  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.indexOf("after-quoted-pre.png");

  assert.deepEqual(refs.map((ref) => ref.originalUrl), ["after-quoted-pre.png"]);
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + "after-quoted-pre.png".length);
});

test("CRLF block maps preserve an Obsidian token's whole-token replacement coordinates", () => {
  const token = "![[real.png|caption]]";
  const markdown = "```\r\n![[hidden.png]]\r\n```\r\n" + token;

  const refs = scanMarkdownMedia(markdown);
  const expectedStart = markdown.indexOf(token);

  assert.equal(refs.length, 1);
  assert.equal(refs[0].syntax, "obsidian-embed");
  assert.equal(refs[0].replacementMode, "token");
  assert.equal(refs[0].start, expectedStart);
  assert.equal(refs[0].end, expectedStart + token.length);
  assert.equal(markdown.slice(refs[0].start, refs[0].end), token);
});
