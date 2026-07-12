import assert from "node:assert/strict";
import test from "node:test";
import {addDraft, findUnuploadedImages, getCoverCandidates, listImageMaterials} from "./publish.ts";

test("listImageMaterials 调用永久图片素材库命令并保留分页参数", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
      return {
        totalCount: 8,
        itemCount: 1,
        items: [
          {
            mediaId: "MEDIA_ID_1",
            name: "series-cover.png",
            updateTime: 1780000000,
            url: "http://mmbiz.qpic.cn/mmbiz_png/example/0",
          },
        ],
      };
    },
  };

  try {
    const page = await listImageMaterials(20, 10);

    assert.deepEqual(calledWith, {
      cmd: "list_image_materials",
      args: {offset: 20, count: 10},
    });
    assert.equal(page.totalCount, 8);
    assert.equal(page.items[0].mediaId, "MEDIA_ID_1");
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("addDraft 只把正文 HTML 传给草稿接口，不把正文链接写到阅读原文", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
      return "MEDIA_ID";
    },
  };

  try {
    const mediaId = await addDraft("标题", '<p><a href="https://github.com/CaipingPeng/VellumStyle">VellumStyle</a></p>', "THUMB_ID");

    assert.equal(mediaId, "MEDIA_ID");
    assert.deepEqual(calledWith, {
      cmd: "add_draft",
      args: {
        title: "标题",
        content: '<p><a href="https://github.com/CaipingPeng/VellumStyle">VellumStyle</a></p>',
        thumbMediaId: "THUMB_ID",
        author: "",
        needOpenComment: 0,
        onlyFansCanComment: 0,
      },
    });
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("addDraft 会把作者和评论设置传给草稿接口", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
      return "MEDIA_ID";
    },
  };

  try {
    const mediaId = await addDraft("标题", "<p>正文</p>", "THUMB_ID", {
      author: "作者名",
      needOpenComment: 1,
      onlyFansCanComment: 1,
    });

    assert.equal(mediaId, "MEDIA_ID");
    assert.deepEqual(calledWith, {
      cmd: "add_draft",
      args: {
        title: "标题",
        content: "<p>正文</p>",
        thumbMediaId: "THUMB_ID",
        author: "作者名",
        needOpenComment: 1,
        onlyFansCanComment: 1,
      },
    });
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

const PUBLISH_IMAGE_VALIDATION_REGRESSION_FIXTURE = [
  "最终统一为 `![imgDescription](imgUrl)` 语法。",
  "缩放写法是 `![imgDescription](imgUrl =缩放参数)`。",
  "  - ![已上传](//mmbiz.qpic.cn/mmbiz_png/real/0)",
  "![本地](./assets/cover.png)",
  "![外链](https://example.com/external.png)",
  '<img src="data:image/png;base64,AAAA">',
  '<img src="blob:https://example.com/temporary-id">',
  '<img src="#preview">',
  '<img src="">',
  '<img src="ftp://example.com/unsupported.png">',
  "![畸形远程](https://[mmbiz.qpic.cn)",
  "![伪造微信](https://mmbiz.qpic.cn.evil.test/image.png)",
  "![重复本地](./assets/cover.png)",
].join("\n");

test("findUnuploadedImages returns exhaustive structured diagnostics at original source positions", () => {
  const diagnostics = findUnuploadedImages(PUBLISH_IMAGE_VALIDATION_REGRESSION_FIXTURE);

  assert.equal(diagnostics.length, 10);
  assert.deepEqual(diagnostics, [
    {
      url: "./assets/cover.png",
      line: 4,
      column: 7,
      sourceType: "local",
      syntax: "markdown-image",
      reason: "local",
    },
    {
      url: "https://example.com/external.png",
      line: 5,
      column: 7,
      sourceType: "remote",
      syntax: "markdown-image",
      reason: "external",
    },
    {
      url: "data:image/png;base64,AAAA",
      line: 6,
      column: 1,
      sourceType: "data",
      syntax: "html-img",
      reason: "temporary",
    },
    {
      url: "blob:https://example.com/temporary-id",
      line: 7,
      column: 1,
      sourceType: "blob",
      syntax: "html-img",
      reason: "temporary",
    },
    {
      url: "#preview",
      line: 8,
      column: 1,
      sourceType: "anchor",
      syntax: "html-img",
      reason: "unsupported",
    },
    {
      url: "",
      line: 9,
      column: 1,
      sourceType: "empty",
      syntax: "html-img",
      reason: "unsupported",
    },
    {
      url: "ftp://example.com/unsupported.png",
      line: 10,
      column: 1,
      sourceType: "unsupported",
      syntax: "html-img",
      reason: "unsupported",
    },
    {
      url: "https://[mmbiz.qpic.cn",
      line: 11,
      column: 9,
      sourceType: "remote",
      syntax: "markdown-image",
      reason: "unsupported",
    },
    {
      url: "https://mmbiz.qpic.cn.evil.test/image.png",
      line: 12,
      column: 9,
      sourceType: "remote",
      syntax: "markdown-image",
      reason: "external",
    },
    {
      url: "./assets/cover.png",
      line: 13,
      column: 9,
      sourceType: "local",
      syntax: "markdown-image",
      reason: "local",
    },
  ]);
});

test("getCoverCandidates excludes code-only WeChat images and normalizes a real protocol-relative image", () => {
  const markdown = [
    "`![code](https://mmbiz.qpic.cn/code-only.png)`",
    '`<img src="https://mmbiz.qlogo.cn/code-only.png">`',
    "![real](//mmbiz.qlogo.cn/mmbiz_png/real/0)",
    "![duplicate](https://mmbiz.qlogo.cn/mmbiz_png/real/0)",
    "![malformed](https://[mmbiz.qpic.cn)",
    "![evil](https://mmbiz.qpic.cn.evil.test/image.png)",
  ].join("\n");

  assert.deepEqual(getCoverCandidates(markdown), [
    {
      url: "https://mmbiz.qlogo.cn/mmbiz_png/real/0",
      syntax: "markdown-image",
      sourceType: "remote",
    },
  ]);
});
