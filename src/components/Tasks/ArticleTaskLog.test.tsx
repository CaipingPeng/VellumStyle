import assert from "node:assert/strict";
import {test} from "node:test";
import {act} from "react";
import {createRoot} from "react-dom/client";
import ArticleTaskLog from "./ArticleTaskLog.tsx";
import {imageUploadTasks} from "../../utils/imageUploadTasks.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

test("task log stays hidden when empty and groups active work by article", async () => {
  imageUploadTasks.clearFinished();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ArticleTaskLog currentDocumentPath="专题/文章.md" />);
  });

  try {
    assert.equal(host.querySelector('[aria-label="文章任务日志"]'), null);
    let taskId = "";
    act(() => {
      taskId = imageUploadTasks.start("large.png", "导入图片", {
        documentPath: "专题/文章.md",
        documentTitle: "文章.md",
      });
      imageUploadTasks.progress({taskId, filename: "large.png", phase: "compressing"});
    });

    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="文章任务日志"]');
    assert.ok(trigger);
    act(() => trigger.click());
    assert.equal(host.textContent?.includes("large.png"), false);
    assert.match(document.body.textContent || "", /文章\.md/);
    assert.match(document.body.textContent || "", /large\.png/);
    assert.match(document.body.textContent || "", /压缩中/);

    act(() => {
      imageUploadTasks.fail(taskId, "测试结束");
      imageUploadTasks.clearFinished();
    });
    assert.equal(host.querySelector('[aria-label="文章任务日志"]'), null);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test("task log renders concurrent and completed entries instead of replacing them", async () => {
  imageUploadTasks.clearFinished();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ArticleTaskLog currentDocumentPath="文章.md" />);
  });

  try {
    act(() => {
      const first = imageUploadTasks.start("first.jpg", "正文图片", {documentPath: "文章.md"});
      imageUploadTasks.complete(first);
      imageUploadTasks.start("second.jpg", "正文图片", {documentPath: "文章.md"});
      imageUploadTasks.start("third.jpg", "正文图片", {documentPath: "文章.md"});
    });
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="文章任务日志"]');
    assert.ok(trigger);
    act(() => trigger.click());

    const text = document.body.textContent || "";
    assert.match(text, /first\.jpg/);
    assert.match(text, /second\.jpg/);
    assert.match(text, /third\.jpg/);
  } finally {
    act(() => imageUploadTasks.clearFinished());
    await act(async () => root.unmount());
    host.remove();
  }
});

test("copy error log copies failed image details to the clipboard", async () => {
  imageUploadTasks.clearFinished();
  const clipboardEvents: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {writeText: async (text: string) => clipboardEvents.push(text)},
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ArticleTaskLog currentDocumentPath="文章.md" />);
  });

  try {
    act(() => {
      const first = imageUploadTasks.start("broken-remote.svg", "导入图片", {
        documentPath: "文章.md",
        documentTitle: "文章.md",
      });
      imageUploadTasks.fail(first, "下载远程图片失败：HTTP 404 Not Found（broken-remote.svg）");
      const second = imageUploadTasks.start("ok.png", "导入图片", {documentPath: "文章.md"});
      imageUploadTasks.complete(second);
    });
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="文章任务日志"]');
    assert.ok(trigger);
    act(() => trigger.click());

    const copyButton = document.body.querySelector<HTMLButtonElement>('[aria-label="复制错误信息"]');
    assert.ok(copyButton, "copy error button should appear when there are failures");
    await act(async () => {
      copyButton.click();
    });

    assert.equal(clipboardEvents.length, 1);
    assert.equal(
      clipboardEvents[0],
      "[文章.md] broken-remote.svg：下载远程图片失败：HTTP 404 Not Found（broken-remote.svg）",
    );
  } finally {
    act(() => imageUploadTasks.clearFinished());
    await act(async () => root.unmount());
    host.remove();
    Reflect.deleteProperty(navigator, "clipboard");
  }
});
