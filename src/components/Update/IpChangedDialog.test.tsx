import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {act} from "react";
import {createRoot} from "react-dom/client";
import IpChangedDialog from "./IpChangedDialog.tsx";

afterEach(() => {
  document.body.innerHTML = "";
});

test("whitelist shortcut copies the new IP before opening the saved AppID page", async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const events: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {writeText: async (text: string) => events.push(`copy:${text}`)},
  });
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: () => number;
    };
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      if (cmd === "get_config") return {wechat: {app_id: "wx-test", app_secret: "secret"}};
      if (cmd === "open_external_url") events.push(`open:${String(args?.url)}`);
      return undefined;
    },
    transformCallback: () => 0,
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<IpChangedDialog open previousIp="198.51.100.1" currentIp="203.0.113.2" onClose={() => {}} />);
  });
  try {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("前往设置白名单"),
    );
    assert.ok(button, "whitelist shortcut should render");
    await act(async () => {
      button.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assert.deepEqual(events, [
      "copy:203.0.113.2",
      "open:https://developers.weixin.qq.com/console/product/mp/wx-test?tab1=basicInfo",
    ]);
  } finally {
    act(() => root.unmount());
    container.remove();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});
