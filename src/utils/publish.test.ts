import assert from "node:assert/strict";
import test from "node:test";
import {
  addDraft,
  bindVoiceMaterials,
  deleteImageMaterial,
  findUnuploadedImages,
  fetchBackendVoiceList,
  formatVoiceMarkup,
  formatVideoMaterialIframe,
  getVideoPlayUrl,
  getCoverCandidates,
  listImageMaterials,
  listVideoMaterials,
  listVoiceMaterials,
  loadVoiceBinding,
  openWechatBackend,
  parseVoiceBackendResponse,
  parseVoiceCode,
  saveVoiceBinding,
} from "./publish.ts";

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

test("deleteImageMaterial 调用永久素材删除命令", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
    },
  };

  try {
    await deleteImageMaterial("MEDIA_ID_1");
    assert.deepEqual(calledWith, {
      cmd: "delete_image_material",
      args: {mediaId: "MEDIA_ID_1"},
    });
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("listVideoMaterials 调用永久视频素材库命令并保留分页参数", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
      return {
        totalCount: 1,
        itemCount: 1,
        items: [
          {
            mediaId: "VIDEO_MEDIA_ID_1",
            name: "和自己赛跑",
            updateTime: 1666258618,
            coverUrl: "http://mmbiz.qpic.cn/mmbiz_jpg/example/0?wx_fmt=jpeg",
            vid: "wxv_2628424322221359104",
          },
        ],
      };
    },
  };

  try {
    const page = await listVideoMaterials(0, 20);

    assert.deepEqual(calledWith, {
      cmd: "list_video_materials",
      args: {offset: 0, count: 20},
    });
    assert.equal(page.totalCount, 1);
    assert.equal(page.items[0].vid, "wxv_2628424322221359104");
    assert.equal(page.items[0].coverUrl, "http://mmbiz.qpic.cn/mmbiz_jpg/example/0?wx_fmt=jpeg");
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("formatVideoMaterialIframe 用 vid 和封面拼出可发布的播放 iframe", () => {
  const html = formatVideoMaterialIframe({
    mediaId: "VIDEO_MEDIA_ID_1",
    name: "和自己赛跑",
    updateTime: 1666258618,
    coverUrl: "http://mmbiz.qpic.cn/mmbiz_jpg/example/0?wx_fmt=jpeg",
    vid: "wxv_2628424322221359104",
  });

  assert.match(html, /<iframe /);
  assert.match(html, /data-mpvid="wxv_2628424322221359104"/);
  assert.match(html, /data-src="https:\/\/mp\.weixin\.qq\.com\/mp\/readtemplate\?t=pages\/video_player_tmpl&amp;action=mpvideo&amp;auto=0&amp;vid=wxv_2628424322221359104"/);
  assert.doesNotMatch(html, / src="https:\/\/mp\.weixin\.qq\.com\/mp\/readtemplate/);
  assert.match(html, /data-media-id="VIDEO_MEDIA_ID_1"/);
  assert.match(html, /data-cover="http:\/\/mmbiz\.qpic\.cn\/mmbiz_jpg\/example\/0\?wx_fmt=jpeg"/);
  assert.match(html, /allowfullscreen/);
  assert.ok(html.endsWith("></iframe>"));
});

test("listVoiceMaterials 调用永久音频素材库命令并保留分页参数", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
      return {
        totalCount: 1,
        itemCount: 1,
        items: [
          {mediaId: "VOICE_MEDIA_ID_1", name: "测试音频", updateTime: 1785982723},
        ],
      };
    },
  };

  try {
    const page = await listVoiceMaterials(0, 20);
    assert.deepEqual(calledWith, {
      cmd: "list_voice_materials",
      args: {offset: 0, count: 20},
    });
    assert.equal(page.items[0].name, "测试音频");
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("parseVoiceCode 兼容老版 mpvoice 与新版 js_editor_audio 源码", () => {
  const mpvoice = parseVoiceCode(
    '<mpvoice class="js_editor_audio audio_iframe js_uneditable" src="/cgi-bin/readtemplate?t=tmpl/audio_tmpl&amp;name=%E6%B5%8B%E8%AF%95%E9%9F%B3%E9%A2%91&amp;play_length=02:12" isaac2="1" low_size="257.96" source_size="258" high_size="1038.91" name="测试音频" play_length="132000" voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA=" data-pluginname="insertaudio"></mpvoice>',
  );
  assert.ok(mpvoice);
  assert.equal(mpvoice.voiceEncodeFileid, "Mzk0NTMyNzk3N18xMDAwMDI1MzA=");
  assert.equal(mpvoice.name, "测试音频");
  assert.equal(mpvoice.playLength, "132000");
  assert.equal(mpvoice.src, "/cgi-bin/readtemplate?t=tmpl/audio_tmpl&name=%E6%B5%8B%E8%AF%95%E9%9F%B3%E9%A2%91&play_length=02:12");
  assert.equal(mpvoice.lowSize, "257.96");

  const sectionForm = parseVoiceCode(
    '<section src="/cgi-bin/readtemplate?t=tmpl/audio_tmpl&amp;play_length=2分钟" isaac2="1" low_size="257.96" source_size="258" high_size="1038.91" name="测试音频" play_length="132000" author="时代编译日志" voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA=" class="js_editor_audio audio_iframe res_iframe js_uneditable"></section>',
  );
  assert.ok(sectionForm);
  assert.equal(sectionForm.voiceEncodeFileid, "Mzk0NTMyNzk3N18xMDAwMDI1MzA=");
  assert.equal(sectionForm.author, "时代编译日志");

  assert.equal(parseVoiceCode("<p>没有音频代码</p>"), null);
});

test("formatVoiceMarkup 生成带封面的 mp-common-mpaudio 标签", () => {
  const html = formatVoiceMarkup({
    voiceEncodeFileid: "Mzk0NTMyNzk3N18xMDAwMDI1MzA=",
    name: "测试音频",
    playLength: "132000",
    src: "/cgi-bin/readtemplate?t=tmpl/audio_tmpl&name=%E6%B5%8B%E8%AF%95%E9%9F%B3%E9%A2%91&play_length=02:12",
    coverUrl: "https://wx.qlogo.cn/mmopen/example/0",
    isaac2: "1",
    lowSize: "257.96",
    sourceSize: "258",
    highSize: "1038.91",
  });

  assert.match(html, /^<mp-common-mpaudio class="mp_common_widget"/);
  assert.match(html, /cover="https:\/\/wx\.qlogo\.cn\/mmopen\/example\/0"/);
  assert.match(html, /voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA="/);
  assert.match(html, /name="测试音频"/);
  assert.match(html, /play_length="02:12"/);
  assert.match(html, /duration="132"/);
  assert.match(html, /&amp;play_length=02:12/);
  assert.ok(html.endsWith(' show-listen-later="1" data-topic_id="" data-topic_name=""></mp-common-mpaudio>'));
});

test("音频素材标识绑定在本地持久化并可取回", () => {
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

  try {
    assert.equal(loadVoiceBinding("VOICE_1"), null);
    saveVoiceBinding("VOICE_1", {
      voiceEncodeFileid: "Mzk0NTMyNzk3N18xMDAwMDI1MzA=",
      name: "测试音频",
      playLength: "132000",
      src: "/cgi-bin/readtemplate?t=tmpl/audio_tmpl&play_length=02:12",
    });
    const binding = loadVoiceBinding("VOICE_1");
    assert.ok(binding);
    assert.equal(binding.voiceEncodeFileid, "Mzk0NTMyNzk3N18xMDAwMDI1MzA=");
    assert.equal(loadVoiceBinding("VOICE_2"), null);
  } finally {
    if (previousStorage === undefined) {
      delete (globalThis as unknown as {localStorage?: unknown}).localStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", previousStorage);
    }
  }
});

test("parseVoiceBackendResponse 解析后台音频素材列表响应", () => {
  const source = JSON.stringify({
    base_resp: {ret: 0},
    file_item: [
      {
        file_id: 100002530,
        name: "测试音频",
        title: "测试音频",
        play_length: 132000,
        size: "258.0\tK",
        voice_encode_fileid: "Mzk0NTMyNzk3N18xMDAwMDI1MzA=",
        voice_low_media_size: 264152,
        voice_high_media_size: 1063848,
      },
    ],
  });

  const candidates = parseVoiceBackendResponse(source);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "测试音频");
  assert.equal(candidates[0].voiceEncodeFileid, "Mzk0NTMyNzk3N18xMDAwMDI1MzA=");
  assert.equal(candidates[0].playLength, "02:12");
  assert.equal(candidates[0].lowSize, "257.96");
  assert.equal(candidates[0].highSize, "1038.91");

  assert.deepEqual(parseVoiceBackendResponse("不是 JSON"), []);
  assert.deepEqual(parseVoiceBackendResponse('{"file_item":[{"name":"无标识音频"}]}'), []);
  assert.deepEqual(parseVoiceBackendResponse('[{"name":"直接数组但无标识"}]'), []);
});

test("parseVoiceBackendResponse 兼容 page_info 内嵌 file_item 的接口结构", () => {
  const source = JSON.stringify({
    base_resp: {ret: 0},
    page_info: {
      file_item: [
        {
          file_id: 100002530,
          name: "测试音频",
          title: "测试音频",
          play_length: 132000,
          size: "258.0\tK",
          voice_encode_fileid: "Mzk0NTMyNzk3N18xMDAwMDI1MzA=",
          voice_low_media_size: 264152,
          voice_high_media_size: 1063848,
        },
      ],
    },
  });

  const candidates = parseVoiceBackendResponse(source);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "测试音频");
  assert.equal(candidates[0].voiceEncodeFileid, "Mzk0NTMyNzk3N18xMDAwMDI1MzA=");
  assert.equal(candidates[0].playLength, "02:12");
  assert.equal(candidates[0].lowSize, "257.96");
});

test("bindVoiceMaterials 按名称批量绑定素材库音频并生成可插入 mpvoice", () => {
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

  try {
    const bound = bindVoiceMaterials(
      [
        {mediaId: "V1", name: "测试音频", updateTime: 1},
        {mediaId: "V2", name: "另一个音频", updateTime: 2},
      ],
      [
        {
          name: "测试音频",
          voiceEncodeFileid: "Mzk0NTMyNzk3N18xMDAwMDI1MzA=",
          playLength: "02:12",
          coverUrl: "https://wx.qlogo.cn/mmopen/example/0",
        },
        {name: "未出现在素材库", voiceEncodeFileid: "QQ==", playLength: "01:00"},
      ],
    );
    assert.equal(bound, 1);
    assert.equal(loadVoiceBinding("V2"), null);

    const binding = loadVoiceBinding("V1");
    assert.ok(binding);
    assert.equal(binding.voiceEncodeFileid, "Mzk0NTMyNzk3N18xMDAwMDI1MzA=");
    assert.equal(binding.coverUrl, "https://wx.qlogo.cn/mmopen/example/0");
    assert.match(binding.src, /name=%E6%B5%8B%E8%AF%95%E9%9F%B3%E9%A2%91/);
    assert.match(binding.src, /play_length=02:12/);
    assert.match(formatVoiceMarkup(binding), /voice_encode_fileid="Mzk0NTMyNzk3N18xMDAwMDI1MzA="/);
    assert.match(formatVoiceMarkup(binding), /cover="https:\/\/wx\.qlogo\.cn\/mmopen\/example\/0"/);
  } finally {
    if (previousStorage === undefined) {
      delete (globalThis as unknown as {localStorage?: unknown}).localStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", previousStorage);
    }
  }
});

test("openWechatBackend 与 fetchBackendVoiceList 调用后台同步命令", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const calls: Array<{cmd: string; args: unknown}> = [];
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calls.push({cmd, args});
      if (cmd === "fetch_backend_voice_list") {
        return '{"base_resp":{"ret":0},"file_item":[{"name":"测试音频","voice_encode_fileid":"Mzk0NTMyNzk3N18xMDAwMDI1MzA="}]}';
      }
    },
  };

  try {
    await openWechatBackend();
    const response = await fetchBackendVoiceList();
    assert.deepEqual(calls.map((call) => call.cmd), ["open_wechat_backend", "fetch_backend_voice_list"]);
    assert.match(response, /voice_encode_fileid/);
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("getVideoPlayUrl 调用视频直链命令并保留 media_id", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
      return "https://mpvideo.qpic.cn/example.f10004.mp4?dis_k=1";
    },
  };

  try {
    const url = await getVideoPlayUrl("VIDEO_1");
    assert.deepEqual(calledWith, {cmd: "get_video_play_url", args: {mediaId: "VIDEO_1"}});
    assert.match(url, /^https:\/\/mpvideo\.qpic\.cn\//);
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

function findDiagnosticsWithoutRepeatedNewlineSearch(markdown: string) {
  const originalLastIndexOf = String.prototype.lastIndexOf;
  let newlineSearches = 0;
  String.prototype.lastIndexOf = function (searchString: string, position?: number): number {
    if (String(this) === markdown && searchString === "\n") newlineSearches++;
    return originalLastIndexOf.call(this, searchString, position);
  };

  try {
    const diagnostics = findUnuploadedImages(markdown);
    assert.equal(newlineSearches, 0, "line positions must use one precomputed index, not search once per diagnostic");
    return diagnostics;
  } finally {
    String.prototype.lastIndexOf = originalLastIndexOf;
  }
}

test("findUnuploadedImages locates diagnostics across LF lines without repeated source scans", () => {
  const markdown = [
    "prefix",
    "![one](./one.png)",
    "middle",
    "  ![two](https://example.com/two.png)",
    'tail <img src="data:image/png;base64,three">',
  ].join("\n");

  const diagnostics = findDiagnosticsWithoutRepeatedNewlineSearch(markdown);

  assert.deepEqual(
    diagnostics.map(({url, line, column}) => ({url, line, column})),
    [
      {url: "./one.png", line: 2, column: 8},
      {url: "https://example.com/two.png", line: 4, column: 10},
      {url: "data:image/png;base64,three", line: 5, column: 6},
    ],
  );
});

test("findUnuploadedImages locates diagnostics across CRLF lines without repeated source scans", () => {
  const markdown = [
    "![first](./first.png)",
    "already uploaded: ![wechat](//mmbiz.qpic.cn/accepted/0)",
    '    <img src="blob:https://example.com/id">',
    "plain text",
    "![last](#anchor)",
  ].join("\r\n");

  const diagnostics = findDiagnosticsWithoutRepeatedNewlineSearch(markdown);

  assert.deepEqual(
    diagnostics.map(({url, line, column}) => ({url, line, column})),
    [
      {url: "./first.png", line: 1, column: 10},
      {url: "blob:https://example.com/id", line: 3, column: 5},
      {url: "#anchor", line: 5, column: 9},
    ],
  );
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
