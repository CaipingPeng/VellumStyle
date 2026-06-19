import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import UpdatePromptDialog from "./UpdatePromptDialog.tsx";

function renderUpdatePrompt(overrides: Partial<React.ComponentProps<typeof UpdatePromptDialog>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: React.ComponentProps<typeof UpdatePromptDialog> = {
    open: true,
    version: "1.4.9",
    currentVersion: "1.4.8",
    releaseNotes: "- 新增：发布草稿箱作者设置\n- 修复：评论图标状态",
    message: "新版本 1.4.9 已准备好下载。",
    installing: false,
    onClose: () => {},
    onInstall: () => {},
    ...overrides,
  };

  act(() => {
    root.render(React.createElement(UpdatePromptDialog, props));
  });

  return {
    root,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("update prompt renders release notes markdown and hides redundant ready status", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {cleanup} = renderUpdatePrompt();

  try {
    assert.match(document.body.textContent || "", /新版本已准备好/);
    assert.match(document.body.textContent || "", /VellumStyle v1\.4\.9/);
    assert.ok(document.querySelector(".update-release-notes li"), "markdown list items should render as li");
    assert.equal(document.querySelector(".update-release-notes h1"), null);
    assert.doesNotMatch(document.querySelector(".update-release-notes")?.textContent || "", /^# VellumStyle/m);
    assert.doesNotMatch(document.body.textContent || "", /更新内容/);
    assert.doesNotMatch(document.body.textContent || "", /已准备好下载/);
  } finally {
    cleanup();
  }
});

test("update prompt keeps download progress visible while installing", () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const {cleanup} = renderUpdatePrompt({
    installing: true,
    message: "正在下载更新包，已下载 2 MB。",
  });

  try {
    assert.match(document.body.textContent || "", /正在下载更新包，已下载 2 MB。/);
    const installButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("更新中"),
    );
    assert.ok(installButton, "install button should communicate the in-progress state");
  } finally {
    cleanup();
  }
});
