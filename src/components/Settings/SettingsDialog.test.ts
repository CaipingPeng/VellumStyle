import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import SettingsDialog, {type SettingsUpdateState} from "./SettingsDialog.tsx";
import type {AppearanceMode} from "../../appearance/appearanceMode.ts";
import type {ColorSchemeId} from "../../appearance/colorScheme.ts";
import {DEFAULT_BACKGROUND_BLUR} from "../../appearance/backgroundImage.ts";

const helpUrl = "https://my.feishu.cn/docx/RUDpd1zWnoWuuyx0uFxcahIGnmC";

function renderSettingsDialog(
  updateState?: SettingsUpdateState,
  appearance: {
    appearanceMode?: AppearanceMode;
    colorScheme?: ColorSchemeId;
    backgroundImagePath?: string | null;
    backgroundBlur?: number;
    statusBarOpacity?: number;
    onAppearanceModeChange?: (mode: AppearanceMode) => void;
    onColorSchemeChange?: (scheme: ColorSchemeId) => void;
    onBackgroundImageChange?: (path: string | null) => void;
    onBackgroundBlurChange?: (blur: number) => void;
    onStatusBarOpacityChange?: (opacity: number) => void;
  } = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      React.createElement(SettingsDialog, {
        open: true,
        onClose: () => {},
        updateState,
        appearanceMode: appearance.appearanceMode ?? "light",
        colorScheme: appearance.colorScheme ?? "violet",
        backgroundImagePath: appearance.backgroundImagePath ?? null,
        backgroundBlur: appearance.backgroundBlur ?? DEFAULT_BACKGROUND_BLUR,
        statusBarOpacity: appearance.statusBarOpacity ?? 0.7,
        onAppearanceModeChange: appearance.onAppearanceModeChange ?? (() => {}),
        onColorSchemeChange: appearance.onColorSchemeChange ?? (() => {}),
        onBackgroundImageChange: appearance.onBackgroundImageChange ?? (() => {}),
        onBackgroundBlurChange: appearance.onBackgroundBlurChange ?? (() => {}),
        onStatusBarOpacityChange: appearance.onStatusBarOpacityChange ?? (() => {}),
      }),
    );
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

test("appearance tab renders light/dark toggle and all color schemes", () => {
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
    const appearanceTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("外观"),
    );
    assert.ok(appearanceTab, "appearance settings tab should render");

    act(() => {
      appearanceTab.click();
    });

    const body = document.body.textContent || "";
    assert.match(body, /界面明暗/);
    assert.match(body, /亮色/);
    assert.match(body, /暗色/);
    assert.match(body, /配色方案/);
    assert.match(body, /文澜紫/);
    assert.match(body, /珊瑚暖橙/);
    assert.match(body, /薄荷青绿/);
    assert.match(body, /海岸蓝/);

    const schemeLabels = ["文澜紫", "珊瑚暖橙", "薄荷青绿", "海岸蓝"];
    const swatches = Array.from(document.querySelectorAll("button")).filter((button) =>
      button.getAttribute("aria-pressed") !== null &&
      schemeLabels.some((label) => button.textContent?.includes(label)),
    );
    assert.ok(swatches.length >= 4, "scheme swatches should render");
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

test("appearance tab applies light/dark and color scheme selections", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {invoke: () => Promise<unknown>; transformCallback: () => number};
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: () => Promise.resolve({wechat: {app_id: "", app_secret: ""}}),
    transformCallback: () => 0,
  };

  const appearanceChanges: AppearanceMode[] = [];
  const schemeChanges: ColorSchemeId[] = [];
  const {cleanup} = renderSettingsDialog(undefined, {
    appearanceMode: "light",
    colorScheme: "violet",
    onAppearanceModeChange: (mode) => appearanceChanges.push(mode),
    onColorSchemeChange: (scheme) => schemeChanges.push(scheme),
  });

  try {
    const appearanceTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("外观"),
    );
    assert.ok(appearanceTab);
    act(() => appearanceTab.click());

    const darkButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("暗色"),
    );
    assert.ok(darkButton);
    act(() => darkButton.click());
    assert.deepEqual(appearanceChanges, ["dark"]);

    const coralSwatch = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("珊瑚暖橙"),
    );
    assert.ok(coralSwatch);
    act(() => coralSwatch.click());
    assert.deepEqual(schemeChanges, ["coral"]);
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

test("appearance tab renders background image controls and remove flow", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {invoke: () => Promise<unknown>; transformCallback: () => number};
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: () => Promise.resolve({wechat: {app_id: "", app_secret: ""}}),
    transformCallback: () => 0,
  };

  const imageChanges: Array<string | null> = [];
  const {cleanup} = renderSettingsDialog(undefined, {
    backgroundImagePath: "C:\\app-data\\backgrounds\\bg-123.png",
    backgroundBlur: 10,
    onBackgroundImageChange: (path) => imageChanges.push(path),
  });

  try {
    const appearanceTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("外观"),
    );
    assert.ok(appearanceTab);
    act(() => appearanceTab.click());

    const body = document.body.textContent || "";
    assert.match(body, /背景图/);
    assert.match(body, /更换/);
    assert.match(body, /移除/);
    assert.match(body, /背景模糊/);
    assert.match(body, /10px/);
    assert.match(body, /状态栏透明度/);
    assert.match(body, /70%/);

    const removeButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("移除"),
    );
    assert.ok(removeButton);
    act(() => removeButton.click());
    assert.deepEqual(imageChanges, [null]);
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

test("appearance tab adjusts background blur and status bar opacity sliders", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {invoke: () => Promise<unknown>; transformCallback: () => number};
  };
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: () => Promise.resolve({wechat: {app_id: "", app_secret: ""}}),
    transformCallback: () => 0,
  };

  const blurChanges: number[] = [];
  const opacityChanges: number[] = [];
  const {cleanup} = renderSettingsDialog(undefined, {
    backgroundImagePath: "C:\\app-data\\backgrounds\\bg-123.png",
    backgroundBlur: 10,
    statusBarOpacity: 0.7,
    onBackgroundBlurChange: (value) => blurChanges.push(value),
    onStatusBarOpacityChange: (value) => opacityChanges.push(value),
  });

  try {
    const appearanceTab = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("外观"),
    );
    assert.ok(appearanceTab);
    act(() => appearanceTab.click());

    const blurSlider = document.querySelector<HTMLInputElement>('input[aria-label="背景模糊程度"]');
    assert.ok(blurSlider, "blur slider should render");
    act(() => setRangeValue(blurSlider, "20"));
    assert.deepEqual(blurChanges, [20]);

    const opacitySlider = document.querySelector<HTMLInputElement>('input[aria-label="状态栏透明度"]');
    assert.ok(opacitySlider, "status bar opacity slider should render");
    act(() => setRangeValue(opacitySlider, "45"));
    assert.deepEqual(opacityChanges, [0.45]);
  } finally {
    cleanup();
    delete tauriWindow.__TAURI_INTERNALS__;
  }
});

// jsdom 里直接改受控 range 的 value 不会触发 React onChange，
// 需要用原型原生 setter 绕过 React 的 value tracker。
function setRangeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event("input", {bubbles: true}));
}

