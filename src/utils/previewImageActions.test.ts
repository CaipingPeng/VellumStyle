import assert from "node:assert/strict";
import {test} from "node:test";
import {copyPreviewImage, savePreviewImageAs} from "./previewImageActions.ts";

interface PreviewImageAsset {
  bytesBase64: string;
  mimeType: string;
  fileName: string;
  extension: string;
}

interface Invocation {
  command: string;
  args?: Record<string, unknown>;
}

interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{name: string; extensions: string[]}>;
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type DialogSave = (options?: SaveDialogOptions) => Promise<string | null>;

function createInvoke(
  handler: (command: string, args?: Record<string, unknown>) => unknown | Promise<unknown>,
): {invoke: Invoke; calls: Invocation[]} {
  const calls: Invocation[] = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({command, args});
    return (await handler(command, args)) as T;
  };
  return {invoke, calls};
}

function tauriDependencies(
  invoke: Invoke,
  save: DialogSave = async () => null,
  loadDialog: () => Promise<{save: DialogSave}> = async () => ({save}),
) {
  return {
    invoke,
    isTauriRuntime: () => true,
    loadDialog,
  };
}

const pngAsset: PreviewImageAsset = {
  bytesBase64: "iVBORw0KGgoAAAANSUhEUg==",
  mimeType: "image/png",
  fileName: "wechat-photo.png",
  extension: ".png",
};

test("copy 恢复 Windows 与自定义 wximg 代理 URL 后调用图片复制命令", async () => {
  const originalSources = [
    "https://mmbiz.qpic.cn/mmbiz_png/example/a.png?wx_fmt=png&from=appmsg",
    "https://mmbiz.qlogo.cn/mmbiz_jpg/example/b.jpg?wx_fmt=jpeg",
  ];
  const proxySources = [
    `http://wximg.localhost/?url=${encodeURIComponent(originalSources[0])}`,
    `wximg://localhost/?url=${encodeURIComponent(originalSources[1])}`,
  ];
  const {invoke, calls} = createInvoke(() => undefined);

  for (const source of proxySources) {
    await copyPreviewImage(source, tauriDependencies(invoke));
  }

  assert.deepEqual(calls, originalSources.map((source) => ({
    command: "copy_preview_image",
    args: {source},
  })));
});

test("copy 在 Web 模式明确拒绝且不调用后端", async () => {
  const {invoke, calls} = createInvoke(() => undefined);

  await assert.rejects(
    copyPreviewImage("https://example.com/image.png", {
      isTauriRuntime: () => false,
      invoke,
    }),
    /当前环境不支持图片操作/,
  );

  assert.deepEqual(calls, []);
});

test("Save 在 Web 模式明确拒绝且不加载 dialog", async () => {
  const {invoke, calls} = createInvoke(() => undefined);
  let dialogLoaded = false;

  await assert.rejects(
    savePreviewImageAs("https://example.com/image.png", {
      isTauriRuntime: () => false,
      invoke,
      loadDialog: async () => {
        dialogLoaded = true;
        return {save: async () => null};
      },
    }),
    /当前环境不支持图片操作/,
  );

  assert.deepEqual(calls, []);
  assert.equal(dialogLoaded, false);
});

test("Save 获取真实元数据并用默认文件名与无点扩展名写入原始 base64", async () => {
  const originalSource = "https://mmbiz.qpic.cn/mmbiz_png/example/photo.png?wx_fmt=png";
  const proxySource = `wximg://localhost/?url=${encodeURIComponent(originalSource)}`;
  const selectedPath = "C:\\Users\\tester\\Pictures\\saved-photo.png";
  const {invoke, calls} = createInvoke((command) => {
    if (command === "get_preview_image_asset") return pngAsset;
    if (command === "write_preview_image_asset") return undefined;
    throw new Error(`unexpected command: ${command}`);
  });
  let dialogOptions: SaveDialogOptions | undefined;

  const result = await savePreviewImageAs(proxySource, tauriDependencies(invoke, async (options) => {
    dialogOptions = options;
    return selectedPath;
  }));

  assert.deepEqual(result, {status: "saved", path: selectedPath});
  assert.deepEqual(calls, [
    {command: "get_preview_image_asset", args: {source: originalSource}},
    {
      command: "write_preview_image_asset",
      args: {path: selectedPath, bytesBase64: pngAsset.bytesBase64},
    },
  ]);
  assert.equal(dialogOptions?.defaultPath, pngAsset.fileName);
  assert.deepEqual(dialogOptions?.filters, [
    {name: pngAsset.mimeType, extensions: ["png"]},
  ]);
});

test("Save 取消时返回 cancelled 且不调用写盘命令", async () => {
  const {invoke, calls} = createInvoke((command) => {
    if (command === "get_preview_image_asset") return pngAsset;
    throw new Error(`unexpected command: ${command}`);
  });

  const result = await savePreviewImageAs(
    "https://example.com/image.png",
    tauriDependencies(invoke, async () => null),
  );

  assert.deepEqual(result, {status: "cancelled"});
  assert.deepEqual(calls, [
    {
      command: "get_preview_image_asset",
      args: {source: "https://example.com/image.png"},
    },
  ]);
});

test("Save 原样传播 metadata invoke 失败且不加载 dialog", async () => {
  const metadataError = new Error("metadata unavailable");
  const {invoke} = createInvoke(() => {
    throw metadataError;
  });
  let dialogLoaded = false;

  await assert.rejects(
    savePreviewImageAs("https://example.com/image.png", tauriDependencies(
      invoke,
      async () => null,
      async () => {
        dialogLoaded = true;
        return {save: async () => null};
      },
    )),
    (error) => error === metadataError,
  );

  assert.equal(dialogLoaded, false);
});

test("Save 原样传播 dialog 失败", async () => {
  const dialogError = new Error("dialog unavailable");
  const {invoke} = createInvoke((command) => {
    if (command === "get_preview_image_asset") return pngAsset;
    throw new Error(`unexpected command: ${command}`);
  });

  await assert.rejects(
    savePreviewImageAs("https://example.com/image.png", tauriDependencies(invoke, async () => {
      throw dialogError;
    })),
    (error) => error === dialogError,
  );
});

test("Save 原样传播 write invoke 失败", async () => {
  const writeError = new Error("disk full");
  const selectedPath = "D:\\Images\\image.png";
  const {invoke} = createInvoke((command) => {
    if (command === "get_preview_image_asset") return pngAsset;
    if (command === "write_preview_image_asset") throw writeError;
    throw new Error(`unexpected command: ${command}`);
  });

  await assert.rejects(
    savePreviewImageAs(
      "https://example.com/image.png",
      tauriDependencies(invoke, async () => selectedPath),
    ),
    (error) => error === writeError,
  );
});

test("Save 将 SVG 原始 base64 字符串完全不变地传给写盘命令", async () => {
  const svgAsset: PreviewImageAsset = {
    bytesBase64: "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwhLS0rLz09LS0+PC9zdmc+",
    mimeType: "image/svg+xml",
    fileName: "vector.svg",
    extension: ".svg",
  };
  const selectedPath = "D:\\Images\\vector.svg";
  const {invoke, calls} = createInvoke((command) => {
    if (command === "get_preview_image_asset") return svgAsset;
    if (command === "write_preview_image_asset") return undefined;
    throw new Error(`unexpected command: ${command}`);
  });

  await savePreviewImageAs(
    "data:image/svg+xml;base64,PHN2Zy8+",
    tauriDependencies(invoke, async () => selectedPath),
  );

  assert.deepEqual(calls[1], {
    command: "write_preview_image_asset",
    args: {path: selectedPath, bytesBase64: svgAsset.bytesBase64},
  });
});

test("Save 尊重用户手工修改的扩展名并原样传递路径", async () => {
  const selectedPath = "C:\\Users\\tester\\Pictures\\keep-my-choice.gif";
  const {invoke, calls} = createInvoke((command) => {
    if (command === "get_preview_image_asset") return pngAsset;
    if (command === "write_preview_image_asset") return undefined;
    throw new Error(`unexpected command: ${command}`);
  });

  const result = await savePreviewImageAs(
    "https://example.com/actual-png",
    tauriDependencies(invoke, async () => selectedPath),
  );

  assert.deepEqual(result, {status: "saved", path: selectedPath});
  assert.deepEqual(calls[1], {
    command: "write_preview_image_asset",
    args: {path: selectedPath, bytesBase64: pngAsset.bytesBase64},
  });
});
