import assert from "node:assert/strict";
import {test} from "node:test";
import {getWechatAccounts, holdWechatAccount, initializeWechatAccounts, invokeWechat, saveWechatConfiguration, switchWechatAccount} from "./wechatAccounts.ts";

test("switch commits account state only on success and blocks changes during account operations", async () => {
  const calls: string[] = [];
  const accounts = [{name: "A", app_id: "wxA"}, {name: "B", app_id: "wxB"}];
  let selected = "wxA";
  let fail = false;
  let finish!: (value: unknown) => void;
  const internals = {
    transformCallback: () => 0,
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push(command);
      if (command === "list_wechat_accounts") return {accounts, active_app_id: selected};
      if (command === "switch_wechat_account") {
        if (fail) throw new Error("disk full");
        selected = args?.appId as string;
        return {accounts, active_app_id: selected};
      }
      if (command === "upload_image") return new Promise((resolve) => { finish = resolve; });
      return undefined;
    },
  };
  const target = globalThis as typeof globalThis & {__TAURI_INTERNALS__?: typeof internals};
  const win = window as typeof window & {__TAURI_INTERNALS__?: typeof internals};
  target.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__ = internals;
  try {
    await initializeWechatAccounts();
    const release = holdWechatAccount();
    await assert.rejects(switchWechatAccount("wxB"), /关闭微信功能窗口/);
    await assert.rejects(saveWechatConfiguration({}), /关闭微信功能窗口/);
    assert.equal(calls.includes("switch_wechat_account"), false);
    release();
    const upload = invokeWechat("upload_image");
    await assert.rejects(switchWechatAccount("wxB"));
    finish("uploaded");
    await upload;
    fail = true;
    await assert.rejects(switchWechatAccount("wxB"), /disk full/);
    assert.equal(getWechatAccounts().active_app_id, "wxA");
    fail = false;
    await switchWechatAccount("wxB");
    assert.equal(getWechatAccounts().active_app_id, "wxB");
  } finally {
    delete target.__TAURI_INTERNALS__;
    delete win.__TAURI_INTERNALS__;
  }
});
