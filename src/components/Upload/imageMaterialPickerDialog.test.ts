import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {act, createElement} from "react";
import {createRoot} from "react-dom/client";
import ImageMaterialPickerDialog from "./ImageMaterialPickerDialog.tsx";
import {saveVoiceBinding} from "../../utils/publish.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

test("图片素材库默认多选并通过独立命令插入或删除所选素材", async () => {
  const source = await readFile(new URL("./ImageMaterialPickerDialog.tsx", import.meta.url), "utf8");
  const confirmSource = await readFile(new URL("./DeleteMaterialConfirmDialog.tsx", import.meta.url), "utf8");
  const audioBindSource = await readFile(new URL("./AudioCodeBindDialog.tsx", import.meta.url), "utf8");

  assert.match(source, /listImageMaterials/);
  assert.match(source, /listVideoMaterials/);
  assert.match(source, /listVoiceMaterials/);
  assert.match(source, /deleteImageMaterial/);
  assert.match(source, /onPickVideos/);
  assert.match(source, /onPickVoices/);
  assert.match(source, /parseVoiceCode/);
  assert.match(source, /saveVoiceBinding/);
  assert.match(source, /pickImageFiles/);
  assert.match(source, /uploadLocalImage/);
  assert.match(source, /视频请在公众号后台/);
  assert.match(source, /音频请在公众号后台/);
  assert.match(source, /AudioCodeBindDialog/);
  assert.match(audioBindSource, /box-border/);
  assert.doesNotMatch(audioBindSource, /overflow-x-auto|overflow-x: auto/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /onPick\(selectedItems\.map\(\(item\) => item\.url\)\)/);
  assert.match(source, /onPickFlow\(selectedItems\.map\(\(item\) => item\.url\)\)/);
  assert.match(source, /IMAGE_FLOW_LIMIT = 10/);
  assert.match(source, /删除所选/);
  assert.match(source, /插入所选/);
  assert.match(source, /插入横滑/);
  assert.match(source, /全选已加载/);
  assert.match(source, /UPLOAD_CONCURRENCY = 16/);
  assert.match(source, /contentPadding=\{false\}/);
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/);
  assert.match(source, /decoding="async"/);
  assert.match(source, /object-contain/);
  assert.match(source, /materialLoading \? "animate-spin"/);
  assert.doesNotMatch(source, /group-hover:scale|placeholder="搜索已加载素材/);
  assert.ok(source.indexOf("删除所选") < source.indexOf("刷新素材库"));
  assert.ok(source.indexOf("插入所选") < source.indexOf("刷新素材库"));
  assert.match(confirmSource, /尚未发表且仅停留在草稿箱中的文章图片失效/);
});

test("素材库点击图片切换多选并按列表顺序一次插入", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      assert.equal(cmd, "list_image_materials");
      return {
        totalCount: 2,
        itemCount: 2,
        items: [
          {mediaId: "M1", name: "first.png", updateTime: 1, url: "https://mmbiz.qpic.cn/first"},
          {mediaId: "M2", name: "second.png", updateTime: 2, url: "https://mmbiz.qpic.cn/second"},
        ],
      };
    },
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const picked: string[][] = [];
  let closed = 0;

  try {
    await act(async () => {
      root.render(createElement(ImageMaterialPickerDialog, {
        open: true,
        canInsert: true,
        onClose: () => { closed += 1; },
        onPick: (urls) => picked.push(urls),
        onPickFlow: () => {},
        onNeedSettings: () => {},
      }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label^="选择素材库第"]'));
    assert.equal(cards.length, 2);
    act(() => {
      cards[1].click();
      cards[0].click();
    });
    const insert = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("插入所选"));
    assert.ok(insert);
    act(() => insert.click());

    assert.deepEqual(picked, [["https://mmbiz.qpic.cn/first", "https://mmbiz.qpic.cn/second"]]);
    assert.equal(closed, 1);
  } finally {
    act(() => root.unmount());
    host.remove();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("素材库多选后可通过「插入横滑」按列表顺序拼成横滑组插入", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      assert.equal(cmd, "list_image_materials");
      return {
        totalCount: 2,
        itemCount: 2,
        items: [
          {mediaId: "M1", name: "first.png", updateTime: 1, url: "https://mmbiz.qpic.cn/first"},
          {mediaId: "M2", name: "second.png", updateTime: 2, url: "https://mmbiz.qpic.cn/second"},
        ],
      };
    },
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const flowPicked: string[][] = [];
  let closed = 0;

  try {
    await act(async () => {
      root.render(createElement(ImageMaterialPickerDialog, {
        open: true,
        canInsert: true,
        onClose: () => { closed += 1; },
        onPick: () => {},
        onPickFlow: (urls) => flowPicked.push(urls),
        onNeedSettings: () => {},
      }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label^="选择素材库第"]'));
    assert.equal(cards.length, 2);
    act(() => {
      cards[1].click();
      cards[0].click();
    });
    const insertFlow = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("插入横滑"));
    assert.ok(insertFlow);
    act(() => insertFlow.click());

    assert.deepEqual(flowPicked, [["https://mmbiz.qpic.cn/first", "https://mmbiz.qpic.cn/second"]]);
    assert.equal(closed, 1);
  } finally {
    act(() => root.unmount());
    host.remove();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("视频页签列出素材库视频并可把所选视频交给插入回调", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === "list_image_materials") {
        return {totalCount: 0, itemCount: 0, items: []};
      }
      assert.equal(cmd, "list_video_materials");
      return {
        totalCount: 2,
        itemCount: 2,
        items: [
          {mediaId: "V1", name: "first.mp4", updateTime: 1, coverUrl: "https://mmbiz.qpic.cn/cover1", vid: "wxv_1"},
          {mediaId: "V2", name: "second.mp4", updateTime: 2, coverUrl: "https://mmbiz.qpic.cn/cover2", vid: "wxv_2"},
        ],
      };
    },
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const videoPicked: Array<Array<{mediaId: string; vid: string}>> = [];
  let closed = 0;

  try {
    await act(async () => {
      root.render(createElement(ImageMaterialPickerDialog, {
        open: true,
        canInsert: true,
        onClose: () => { closed += 1; },
        onPick: () => {},
        onPickFlow: () => {},
        onPickVideos: (videos) => videoPicked.push(videos),
        onNeedSettings: () => {},
      }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const videoTab = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "视频");
    assert.ok(videoTab);
    await act(async () => {
      videoTab.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label^="选择素材库第"]'));
    assert.equal(cards.length, 2);
    assert.match(cards[0].getAttribute("aria-label") ?? "", /第 1 个视频：first\.mp4/);
    act(() => {
      cards[1].click();
      cards[0].click();
    });
    const insert = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("插入所选"));
    assert.ok(insert);
    act(() => insert.click());

    assert.equal(videoPicked.length, 1);
    assert.deepEqual(videoPicked[0].map(({mediaId, vid}) => ({mediaId, vid})), [
      {mediaId: "V1", vid: "wxv_1"},
      {mediaId: "V2", vid: "wxv_2"},
    ]);
    assert.equal(closed, 1);
  } finally {
    act(() => root.unmount());
    host.remove();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("音频页签列出素材库音频，已绑定标识的音频可直接插入 mpvoice", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === "list_image_materials") {
        return {totalCount: 0, itemCount: 0, items: []};
      }
      assert.equal(cmd, "list_voice_materials");
      return {
        totalCount: 1,
        itemCount: 1,
        items: [
          {mediaId: "VOICE_1", name: "测试音频", updateTime: 1785982723},
        ],
      };
    },
  };
  saveVoiceBinding("VOICE_1", {
    voiceEncodeFileid: "Mzk0NTMyNzk3N18xMDAwMDI1MzA=",
    name: "测试音频",
    playLength: "132000",
    src: "/cgi-bin/readtemplate?t=tmpl/audio_tmpl&name=%E6%B5%8B%E8%AF%95%E9%9F%B3%E9%A2%91&play_length=02:12",
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const voicePicked: string[][] = [];
  let closed = 0;

  try {
    await act(async () => {
      root.render(createElement(ImageMaterialPickerDialog, {
        open: true,
        canInsert: true,
        onClose: () => { closed += 1; },
        onPick: () => {},
        onPickFlow: () => {},
        onPickVoices: (markups) => voicePicked.push(markups),
        onNeedSettings: () => {},
      }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const audioTab = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "音频");
    assert.ok(audioTab);
    await act(async () => {
      audioTab.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label^="选择素材库第"]'));
    assert.equal(cards.length, 1);
    assert.match(cards[0].getAttribute("aria-label") ?? "", /第 1 个音频：测试音频/);
    act(() => {
      cards[0].click();
    });
    const insert = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("插入所选"));
    assert.ok(insert);
    act(() => insert.click());

    assert.equal(voicePicked.length, 1);
    assert.match(voicePicked[0][0], /^<mpvoice /);
    assert.match(voicePicked[0][0], /voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA="/);
    assert.equal(closed, 1);
  } finally {
    act(() => root.unmount());
    host.remove();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
    if (previousStorage === undefined) {
      delete (globalThis as unknown as {localStorage?: unknown}).localStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", previousStorage);
    }
  }
});
