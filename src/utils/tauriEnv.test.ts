import {test} from "node:test";
import assert from "node:assert/strict";
import {isTauriRuntime} from "./tauriEnv.ts";

test("Node/Web 环境默认不是 Tauri runtime", () => {
  assert.equal(isTauriRuntime(), false);
});

test("存在 Tauri internals 时识别为 Tauri runtime", () => {
  assert.equal(isTauriRuntime({__TAURI_INTERNALS__: {invoke: () => undefined}}), true);
});

test("缺少 invoke 的 internals 不算可用 Tauri runtime", () => {
  assert.equal(isTauriRuntime({__TAURI_INTERNALS__: {}}), false);
});
