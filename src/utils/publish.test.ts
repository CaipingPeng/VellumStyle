import assert from "node:assert/strict";
import test from "node:test";
import {addDraft, listImageMaterials} from "./publish.ts";

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
