import assert from "node:assert/strict";
import {test} from "node:test";
import {
  formatHtmlImage,
  formatMarkdownImage,
  replaceMarkdownImageSizeByIndex,
} from "./imageMarkdown.ts";

test("formatMarkdownImage uses the standard Markdown image size syntax", () => {
  assert.equal(
    formatMarkdownImage({alt: "图]一", url: "https://example.com/a.png", width: 320, height: 180}),
    "![图\\]一](https://example.com/a.png =320x180)",
  );
});

test("formatMarkdownImage omits the size marker when no size is provided", () => {
  assert.equal(
    formatMarkdownImage({alt: "", url: "https://example.com/a.png"}),
    "![](https://example.com/a.png)",
  );
});

test("formatHtmlImage renders img tag with src/alt and optional dimensions", () => {
  assert.equal(
    formatHtmlImage({src: "https://example.com/a.png", alt: "图]一", width: 320, height: 180}),
    '<img src="https://example.com/a.png" alt="图]一" width="320" height="180">',
  );
});

test("formatHtmlImage escapes attribute delimiters and omits missing dimensions", () => {
  assert.equal(
    formatHtmlImage({src: 'https://example.com/a&b.png?x="1"', alt: 'a"b<c>d'}),
    '<img src="https://example.com/a&amp;b.png?x=&quot;1&quot;" alt="a&quot;b&lt;c&gt;d">',
  );
  assert.equal(
    formatHtmlImage({src: "https://example.com/a.png"}),
    '<img src="https://example.com/a.png" alt="">',
  );
});

test("replaceMarkdownImageSizeByIndex adds size to the selected Markdown image only", () => {
  const markdown = [
    "![第一张](https://example.com/a.png)",
    "",
    "![第二张](https://example.com/b.png)",
  ].join("\n");

  const result = replaceMarkdownImageSizeByIndex(markdown, 1, {width: 240, height: 135});

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    [
      "![第一张](https://example.com/a.png)",
      "",
      "![第二张](https://example.com/b.png =240x135)",
    ].join("\n"),
  );
});

test("replaceMarkdownImageSizeByIndex replaces an existing size marker", () => {
  const result = replaceMarkdownImageSizeByIndex("![图](https://example.com/a.png =100x50)", 0, {
    width: 360,
    height: 180,
  });

  assert.equal(result.markdown, "![图](https://example.com/a.png =360x180)");
});

test("replaceMarkdownImageSizeByIndex can write responsive percentage width without fixed height", () => {
  const result = replaceMarkdownImageSizeByIndex("![图](https://example.com/a.png =100x50)", 0, {
    width: "50%",
  });

  assert.equal(result.markdown, "![图](https://example.com/a.png =50%x)");
});

test("replaceMarkdownImageSizeByIndex preserves image title before the size marker", () => {
  const result = replaceMarkdownImageSizeByIndex('![图](https://example.com/a.png "标题" =100x50)', 0, {
    width: 360,
    height: 180,
  });

  assert.equal(result.markdown, '![图](https://example.com/a.png "标题" =360x180)');
});

test("replaceMarkdownImageSizeByIndex rewrites html img size and preserves other attributes", () => {
  const markdown = '<img src="https://example.com/a.png" alt="第一张" class="rich_pages" data-w="20">';
  const result = replaceMarkdownImageSizeByIndex(markdown, 0, {width: "70%"});

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    '<img src="https://example.com/a.png" alt="第一张" class="rich_pages" data-w="20" width="70%">',
  );
});

test("replaceMarkdownImageSizeByIndex replaces existing html width/height", () => {
  const result = replaceMarkdownImageSizeByIndex(
    '<img src="https://example.com/a.png" width="100" height="50" alt="图">',
    0,
    {width: 360, height: 180},
  );

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    '<img src="https://example.com/a.png" alt="图" width="360" height="180">',
  );
});

test("replaceMarkdownImageSizeByIndex drops height when only percentage width is written", () => {
  const result = replaceMarkdownImageSizeByIndex(
    '<img src="https://example.com/a.png" width="100" height="50">',
    0,
    {width: "50%"},
  );

  assert.equal(result.markdown, '<img src="https://example.com/a.png" width="50%">');
});

test("replaceMarkdownImageSizeByIndex indexes markdown and html images together in document order", () => {
  const markdown = [
    "![第一张](https://example.com/a.png)",
    "",
    '<img src="https://example.com/b.png" alt="第二张">',
  ].join("\n");

  const result = replaceMarkdownImageSizeByIndex(markdown, 1, {width: "50%"});

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    [
      "![第一张](https://example.com/a.png)",
      "",
      '<img src="https://example.com/b.png" alt="第二张" width="50%">',
    ].join("\n"),
  );
});

test("replaceMarkdownImageSizeByIndex skips images inside legacy flow groups", () => {
  const markdown = [
    "<![a](https://example.com/a.png),![b](https://example.com/b.png)>",
    "",
    '<img src="https://example.com/c.png" alt="c">',
  ].join("\n");

  const result = replaceMarkdownImageSizeByIndex(markdown, 0, {width: "70%"});

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    [
      "<![a](https://example.com/a.png),![b](https://example.com/b.png)>",
      "",
      '<img src="https://example.com/c.png" alt="c" width="70%">',
    ].join("\n"),
  );
});

test("replaceMarkdownImageSizeByIndex skips images inside html flow groups", () => {
  const markdown = [
    '<img src="https://example.com/a.png" alt="a">,<img src="https://example.com/b.png" alt="b">',
    "",
    "![c](https://example.com/c.png)",
  ].join("\n");

  const result = replaceMarkdownImageSizeByIndex(markdown, 0, {width: "70%"});

  assert.equal(result.changed, true);
  assert.equal(
    result.markdown,
    [
      '<img src="https://example.com/a.png" alt="a">,<img src="https://example.com/b.png" alt="b">',
      "",
      "![c](https://example.com/c.png =70%x)",
    ].join("\n"),
  );
});
