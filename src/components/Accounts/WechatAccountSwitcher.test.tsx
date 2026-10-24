import assert from "node:assert/strict";
import {test} from "node:test";
import {act} from "react";
import {createRoot} from "react-dom/client";
import WechatAccountSwitcher from "./WechatAccountSwitcher.tsx";
import {initializeWechatAccounts} from "../../utils/wechatAccounts.ts";

test("toolbar shows the selected public account, displays only name and switches immediately", async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const accounts = [{name: "工作号", app_id: "wxA"}, {name: "个人号", app_id: "wxB"}];
  let active_app_id = "wxA";
  const calls: string[] = [];
  const internals = {
    transformCallback: () => 0,
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push(command);
      if (command === "switch_wechat_account") active_app_id = args?.appId as string;
      return {accounts, active_app_id};
    },
  };
  const target = globalThis as typeof globalThis & {__TAURI_INTERNALS__?: typeof internals};
  const win = window as typeof window & {__TAURI_INTERNALS__?: typeof internals};
  target.__TAURI_INTERNALS__ = win.__TAURI_INTERNALS__ = internals;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await initializeWechatAccounts();
    act(() => root.render(<WechatAccountSwitcher />));
    const select = container.querySelector("select")!;
    assert.equal(select.value, "wxA");

    // Must show only name, not appid
    const options = Array.from(select.querySelectorAll("option"));
    assert.equal(options.length, 2);
    assert.equal(options[0].textContent, "工作号");
    assert.equal(options[1].textContent, "个人号");
    assert.doesNotMatch(select.textContent || "", /wxA|wxB/);
    assert.doesNotMatch(select.textContent || "", /管理公众号/);

    assert.equal(select.title, "当前公众号：工作号");
    assert.doesNotMatch(select.title, /wxA/);

    await act(async () => {
      select.value = "wxB";
      select.dispatchEvent(new window.Event("change", {bubbles: true}));
      await Promise.resolve();
    });
    assert.equal(select.value, "wxB");
    assert.equal(select.title, "当前公众号：个人号");
    assert.ok(calls.includes("switch_wechat_account"));

    act(() => root.render(<WechatAccountSwitcher disabled />));
    assert.equal(select.disabled, true);
    assert.doesNotMatch(container.textContent || "", /AppSecret|密码|登录/);
  } finally {
    act(() => root.unmount());
    container.remove();
    delete target.__TAURI_INTERNALS__;
    delete win.__TAURI_INTERNALS__;
  }
});
