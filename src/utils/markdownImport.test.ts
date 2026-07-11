import assert from "node:assert/strict";
import {test} from "node:test";
import {importMarkdownFile} from "./markdownImport.ts";

test("importMarkdownFile normalizes html img tags to standard Markdown image syntax", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const sourceUrl =
    "http://mmbiz.qpic.cn/mmbiz_png/w6BjglibIFcjerY35751TWjb4CmhB0ds8B944Kts9VibJVichRauZn6sQOibeBtSWtT5eTib0ibrvjmHNia2iaMpIfnOjichP5G8xuSXs0zTicAoxibq8s/0?wx_fmt=png";
  const uploadedUrl = "https://cdn.example.com/uploaded.png";
  const source = `前文\n<img src="${sourceUrl}" alt="image-20260702205417533" style="zoom:50%;" />\n后文`;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      if (cmd === "read_markdown_file") {
        assert.deepEqual(args, {path: "C:\\article.md"});
        return {
          path: "C:\\article.md",
          base_dir: "C:\\",
          content: source,
        };
      }
      if (cmd === "upload_remote_image") {
        assert.deepEqual(args, {url: sourceUrl});
        return uploadedUrl;
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  };

  try {
    const result = await importMarkdownFile({markdownPath: "C:\\article.md"});

    assert.equal(result.content, `前文\n![image-20260702205417533](${uploadedUrl} =50%x)\n后文`);
    assert.equal(result.totalRefs, 1);
    assert.equal(result.uploadedRemote.length, 1);
    assert.equal(result.uploadedRemote[0].syntax, "html-img");
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});
