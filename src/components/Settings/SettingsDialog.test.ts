import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import SettingsDialog, {type SettingsUpdateState} from "./SettingsDialog.tsx";

const helpUrl = "https://my.feishu.cn/docx/RUDpd1zWnoWuuyx0uFxcahIGnmC";

function renderSettingsDialog(updateState?: SettingsUpdateState) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(SettingsDialog, {open: true, onClose: () => {}, updateState}));
  });

  return {
    root,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("about page shows pending update details and install action", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {invoke: () => Promise<unknown>; transformCallback: () => number};
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: () => Promise.resolve({wechat: {app_id: "", app_secret: ""}}),
    transformCallback: () => 0,
  };

  const {cleanup} = renderSettingsDialog({
    status: "available",
    currentVersion: "1.4.3",
    version: "1.5.0",
    body: "## 更新内容\n- 新增：更新说明展示\n- 修复：发布页正文同步",
    installing: false,
    checking: false,
    message: "",
    onCheck: () => {},
    onInstall: () => {},
  });

  try {
    const aboutTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("关于"),
    );
    assert.ok(aboutTab, "about settings tab should render");

    act(() => {
      aboutTab.click();
    });

    assert.match(document.body.textContent || "", /发现新版本/);
    assert.match(document.body.textContent || "", /1\.4\.3/);
    assert.match(document.body.textContent || "", /1\.5\.0/);
    assert.match(document.body.textContent || "", /更新内容/);
    assert.match(document.body.textContent || "", /新增：更新说明展示/);
    const releaseNotes = document.querySelector(".update-release-notes");
    assert.ok(releaseNotes, "release notes should use the shared markdown renderer");
    assert.ok(releaseNotes.querySelector("h2"), "release notes markdown heading should render as a heading");
    assert.doesNotMatch(releaseNotes.textContent || "", /## 更新内容/);
    const installButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("立即更新"),
    );
    assert.ok(installButton, "install update button should render");
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

test("about page hides redundant latest-version update message", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {invoke: () => Promise<unknown>; transformCallback: () => number};
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: () => Promise.resolve({wechat: {app_id: "", app_secret: ""}}),
    transformCallback: () => 0,
  };

  const {cleanup} = renderSettingsDialog({
    status: "none",
    currentVersion: "1.5.3",
    installing: false,
    checking: false,
    message: "当前已是最新版本。",
    onCheck: () => {},
    onInstall: () => {},
  });

  try {
    const aboutTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("关于"),
    );
    assert.ok(aboutTab, "about settings tab should render");

    act(() => {
      aboutTab.click();
    });

    assert.match(document.body.textContent || "", /已是最新版本/);
    assert.doesNotMatch(document.body.textContent || "", /当前已是最新版本。/);
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

test("network helper links to the operation guide with readable text", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {invoke: () => Promise<unknown>; transformCallback: () => number};
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: () => Promise.resolve({wechat: {app_id: "", app_secret: ""}}),
    transformCallback: () => 0,
  };

  const {cleanup} = renderSettingsDialog();
  try {
    const networkTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("网络辅助"),
    );
    assert.ok(networkTab, "network settings tab should render");

    act(() => {
      networkTab.click();
    });

    const link = document.querySelector<HTMLAnchorElement>(`a[href="${helpUrl}"]`);
    assert.ok(link, "help document link should render");
    assert.equal(link.textContent, "VellumStyle-文澜排版帮助文档");
    assert.equal(link.target, "_blank");
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

test("clicking the help guide link asks Tauri to open it externally", async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const calls: Array<{cmd: string; args?: Record<string, unknown>}> = [];
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: () => number;
    };
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: (cmd, args) => {
      calls.push({cmd, args});
      return Promise.resolve(cmd === "get_config" ? {wechat: {app_id: "", app_secret: ""}} : undefined);
    },
    transformCallback: () => 0,
  };

  const {cleanup} = renderSettingsDialog();
  try {
    const networkTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("网络辅助"),
    );
    assert.ok(networkTab, "network settings tab should render");

    act(() => {
      networkTab.click();
    });

    const link = document.querySelector<HTMLAnchorElement>(`a[href="${helpUrl}"]`);
    assert.ok(link, "help document link should render");

    act(() => {
      link.click();
    });
    await Promise.resolve();

    assert.deepEqual(calls[calls.length - 1], {cmd: "open_external_url", args: {url: helpUrl}});
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});


test("network helper opens the saved AppID whitelist page", async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const calls: Array<{cmd: string; args?: Record<string, unknown>}> = [];
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: () => number;
    };
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: (cmd, args) => {
      calls.push({cmd, args});
      return Promise.resolve(cmd === "get_config" ? {wechat: {app_id: "wx saved/id", app_secret: "secret"}} : undefined);
    },
    transformCallback: () => 0,
  };

  const {cleanup} = renderSettingsDialog();
  try {
    const networkTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("网络辅助"),
    );
    assert.ok(networkTab);
    act(() => networkTab.click());

    const openButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("前往设置白名单"),
    );
    assert.ok(openButton, "whitelist shortcut should render");
    await act(async () => {
      openButton.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    assert.deepEqual(calls[calls.length - 1], {
      cmd: "open_external_url",
      args: {url: "https://developers.weixin.qq.com/console/product/mp/wx%20saved%2Fid?tab1=basicInfo"},
    });
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

test("wechat settings opens the WeChat developer console", async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const calls: Array<{cmd: string; args?: Record<string, unknown>}> = [];
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: () => number;
    };
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: (cmd, args) => {
      calls.push({cmd, args});
      return Promise.resolve(cmd === "get_config" ? {wechat: {app_id: "", app_secret: ""}} : undefined);
    },
    transformCallback: () => 0,
  };

  const {cleanup} = renderSettingsDialog();
  try {
    const openButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("前往微信开发者平台获取凭证"),
    );
    assert.ok(openButton, "wechat developer console shortcut should render");
    await act(async () => {
      openButton.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    assert.deepEqual(calls[calls.length - 1], {
      cmd: "open_external_url",
      args: {url: "https://developers.weixin.qq.com/console/member/manage/mp"},
    });
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

