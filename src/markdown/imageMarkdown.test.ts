import assert from "node:assert/strict";
import {test} from "node:test";
import {
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
