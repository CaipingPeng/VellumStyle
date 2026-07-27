import assert from "node:assert/strict";
import {test} from "node:test";
import {imageUploadTasks} from "./imageUploadTasks.ts";
import {uploadImage} from "./upload.ts";

test("File uploads use a raw Uint8Array IPC body with small metadata headers", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let receivedArgs: unknown;
  let receivedOptions: unknown;
  (window as unknown as {__TAURI_INTERNALS__: {invoke: (
    command: string,
    args: unknown,
    options: unknown,
  ) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (command, args, options) => {
      assert.equal(command, "upload_image");
      receivedArgs = args;
      receivedOptions = options;
      return "https://mmbiz.qpic.cn/uploaded.jpg";
    },
  };

  try {
    const url = await uploadImage(new File([new Uint8Array([1, 2, 3])], "测试 image.jpg", {type: "image/jpeg"}));
    assert.equal(url, "https://mmbiz.qpic.cn/uploaded.jpg");
    assert.ok(receivedArgs instanceof Uint8Array);
    assert.deepEqual(Array.from(receivedArgs as Uint8Array), [1, 2, 3]);
    const headers = (receivedOptions as {headers: Record<string, string>}).headers;
    assert.equal(decodeURIComponent(headers["x-vellum-filename"]), "测试 image.jpg");
    assert.equal(headers["x-vellum-mime"], "image/jpeg");
    assert.ok(headers["x-vellum-task-id"]);
  } finally {
    imageUploadTasks.clearFinished();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});
