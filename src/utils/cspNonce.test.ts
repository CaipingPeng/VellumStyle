import {test} from "node:test";
import assert from "node:assert/strict";
import {getCodeMirrorCspNonce} from "./cspNonce.ts";

test("从 style.nonce 读取 Tauri 注入的 CSP nonce", () => {
  const root = {
    querySelectorAll: () => [
      {nonce: "", getAttribute: () => null},
      {nonce: "9415005684580036989", getAttribute: () => ""},
    ],
  } as unknown as ParentNode;

  assert.equal(getCodeMirrorCspNonce(root), "9415005684580036989");
});

test("没有可用 nonce 时返回 undefined", () => {
  const root = {
    querySelectorAll: () => [
      {nonce: "", getAttribute: () => null},
      {nonce: "", getAttribute: () => ""},
    ],
  } as unknown as ParentNode;

  assert.equal(getCodeMirrorCspNonce(root), undefined);
});
