import assert from "node:assert/strict";
import {test} from "node:test";
import {
  importMarkdownFile,
  prepareMarkdownImport,
  processMarkdownImportInBackground,
} from "./markdownImport.ts";
import {registerBackgroundDocumentUpdater} from "./backgroundDocumentUpdates.ts";
import {imageUploadTasks} from "./imageUploadTasks.ts";

test("importMarkdownFile normalizes html img tags to img tag syntax", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const sourceUrl =
    "http://mmbiz.qpic.cn/mmbiz_png/w6BjglibIFcjerY35751TWjb4CmhB0ds8B944Kts9VibJVichRauZn6sQOibeBtSWtT5eTib0ibrvjmHNia2iaMpIfnOjichP5G8xuSXs0zTicAoxibq8s/0?wx_fmt=png";
  const uploadedUrl = "https://cdn.example.com/uploaded.png";
  const source = `前文\n<img src="${sourceUrl}" alt="image-20260702205417533" style="zoom:50%;" />\n后文`;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      if (cmd === "read_markdown_file") {
        assert.deepEqual(args, {path: "C:\\article.md"});
        return {
          path: "C:\\article.md",
          base_dir: "C:\\",
          content: source,
        };
      }
      if (cmd === "upload_remote_image") {
        const uploadArgs = args as {url: string; taskId: string};
        assert.equal(uploadArgs.url, sourceUrl);
        assert.equal(typeof uploadArgs.taskId, "string");
        assert.ok(uploadArgs.taskId.length > 0);
        return uploadedUrl;
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  };

  try {
    const result = await importMarkdownFile({markdownPath: "C:\\article.md"});

    assert.equal(
      result.content,
      `前文\n<img src="${uploadedUrl}" alt="image-20260702205417533" width="50%">\n后文`,
    );
    assert.equal(result.totalRefs, 1);
    assert.equal(result.uploadedRemote.length, 1);
    assert.equal(result.uploadedRemote[0].syntax, "html-img");
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("importMarkdownFile ignores code-example media while importing one genuine scaled image", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const sourceUrl = "https://images.example.com/real.png";
  const uploadedUrl = "https://cdn.example.com/real-uploaded.png";
  const realImage = `<img src="${sourceUrl}" alt="真实图片" style="display:block; zoom: 40%; margin:0">`;
  const source = [
    "行内示例：`![inline](https://examples.invalid/inline.png)`",
    "",
    "```markdown",
    "![fenced](https://examples.invalid/fenced.png)",
    "```",
    "",
    '<code><img src="https://examples.invalid/code.png"></code>',
    "",
    "<pre>",
    "![[https://examples.invalid/pre.png]]",
    "[video](https://examples.invalid/pre.mp4)",
    "</pre>",
    "",
    realImage,
  ].join("\n");
  const commands: Array<{cmd: string; args: unknown}> = [];

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      commands.push({cmd, args});
      if (cmd === "read_markdown_file") {
        return {
          path: "C:\\article.md",
          base_dir: "C:\\",
          content: source,
        };
      }
      if (cmd === "upload_remote_image") {
        const uploadArgs = args as {url: string; taskId: string};
        assert.equal(uploadArgs.url, sourceUrl);
        assert.equal(typeof uploadArgs.taskId, "string");
        return uploadedUrl;
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  };

  try {
    const result = await importMarkdownFile({markdownPath: "C:\\article.md"});

    assert.equal(result.totalRefs, 1);
    assert.equal(commands.length, 2);
    assert.deepEqual(commands[0], {cmd: "read_markdown_file", args: {path: "C:\\article.md"}});
    assert.equal(commands[1].cmd, "upload_remote_image");
    assert.equal((commands[1].args as {url: string}).url, sourceUrl);
    assert.equal(typeof (commands[1].args as {taskId: string}).taskId, "string");
    assert.equal(result.uploadedRemote.length, 1);
    assert.equal(result.uploadedRemote[0].originalUrl, sourceUrl);
    assert.equal(result.uploadedRemote[0].replacementUrl, uploadedUrl);
    assert.equal(result.uploadedRemote[0].sourceType, "remote");
    assert.equal(result.uploadedRemote[0].syntax, "html-img");
    assert.deepEqual(result.uploadedLocal, []);
    assert.deepEqual(result.unsupported, []);
    assert.deepEqual(result.failed, []);
    assert.equal(
      result.content,
      source.replace(realImage, `<img src="${uploadedUrl}" alt="真实图片" width="40%">`),
    );
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("background import preserves concurrent edits and records the target article", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const sourceUrl = "https://images.example.com/large.png";
  const uploadedUrl = "https://mmbiz.qpic.cn/uploaded/large.jpg";
  const source = `# 导入文章\n\n![原图](${sourceUrl})`;
  let currentContent = `${source}\n\n用户继续编辑`;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === "read_markdown_file") {
        return {path: "C:\\article.md", base_dir: "C:\\", content: source};
      }
      if (cmd === "upload_remote_image") return uploadedUrl;
      throw new Error(`unexpected command: ${cmd}`);
    },
  };
  const unregister = registerBackgroundDocumentUpdater(async (documentPath, transform) => {
    assert.equal(documentPath, "导入/article.md");
    currentContent = transform(currentContent);
    return true;
  });

  try {
    imageUploadTasks.clearFinished();
    const prepared = await prepareMarkdownImport({markdownPath: "C:\\article.md"});
    assert.equal(prepared.content, source);
    await processMarkdownImportInBackground(prepared, "导入/article.md");

    assert.equal(currentContent, `# 导入文章\n\n<img src="${uploadedUrl}" alt="原图">\n\n用户继续编辑`);
    const task = imageUploadTasks.getSnapshot().find((item) => item.documentPath === "导入/article.md");
    assert.equal(task?.status, "success");
    assert.equal(task?.category, "导入图片");
  } finally {
    unregister();
    imageUploadTasks.clearFinished();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("background import does not restore an image reference deleted during upload", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const sourceUrl = "https://images.example.com/deleted.png";
  const source = `![稍后删除](${sourceUrl})`;
  let currentContent = "# 图片已由用户删除";

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === "read_markdown_file") return {path: "C:\\deleted.md", base_dir: "C:\\", content: source};
      if (cmd === "upload_remote_image") return "https://mmbiz.qpic.cn/uploaded/deleted.jpg";
      throw new Error(`unexpected command: ${cmd}`);
    },
  };
  const unregister = registerBackgroundDocumentUpdater(async (_documentPath, transform) => {
    currentContent = transform(currentContent);
    return false;
  });

  try {
    const prepared = await prepareMarkdownImport({markdownPath: "C:\\deleted.md"});
    await processMarkdownImportInBackground(prepared, "deleted.md");
    assert.equal(currentContent, "# 图片已由用户删除");
  } finally {
    unregister();
    imageUploadTasks.clearFinished();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("background import uploads up to sixteen images concurrently while serializing document updates", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const names = Array.from({length: 17}, (_, index) => `image-${index + 1}`);
  const urls = names.map((name) => `https://images.example.com/${name}.png`);
  const source = urls.map((url, index) => `![图${index + 1}](${url})`).join("\n");
  const started: string[] = [];
  const resolvers = new Map<string, (url: string) => void>();
  let currentContent = source;
  let activeUpdates = 0;
  let maxActiveUpdates = 0;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      if (cmd === "read_markdown_file") {
        return {path: "C:\\concurrent.md", base_dir: "C:\\", content: source};
      }
      if (cmd === "upload_remote_image") {
        const url = (args as {url: string}).url;
        started.push(url);
        return new Promise<string>((resolve) => resolvers.set(url, resolve));
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  };
  const unregister = registerBackgroundDocumentUpdater(async (_documentPath, transform) => {
    activeUpdates += 1;
    maxActiveUpdates = Math.max(maxActiveUpdates, activeUpdates);
    await new Promise((resolve) => setTimeout(resolve, 0));
    currentContent = transform(currentContent);
    activeUpdates -= 1;
    return true;
  });

  try {
    const prepared = await prepareMarkdownImport({markdownPath: "C:\\concurrent.md"});
    const processing = processMarkdownImportInBackground(prepared, "concurrent.md");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(started, urls.slice(0, 16));

    resolvers.get(urls[5])?.("https://mmbiz.qpic.cn/image-6.jpg");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 17);

    urls.forEach((url, index) => {
      if (index !== 5) resolvers.get(url)?.(`https://mmbiz.qpic.cn/${names[index]}.jpg`);
    });
    await processing;

    assert.equal(maxActiveUpdates, 1);
    for (const name of names) {
      assert.match(currentContent, new RegExp(`https://mmbiz\\.qpic\\.cn/${name}\\.jpg`));
    }
  } finally {
    unregister();
    imageUploadTasks.clearFinished();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("import dedupes failures when the same remote image is referenced multiple times", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const duplicatedUrl = "https://images.example.com/duplicated.png";
  const source = `![第一处](${duplicatedUrl})\n\n![第二处](${duplicatedUrl})`;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === "read_markdown_file") {
        return {path: "C:\\duplicated.md", base_dir: "C:\\", content: source};
      }
      if (cmd === "upload_remote_image") {
        throw "下载远程图片失败：HTTP 503 Service Unavailable";
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  };

  try {
    const result = await importMarkdownFile({markdownPath: "C:\\duplicated.md"});

    assert.equal(result.totalRefs, 2);
    assert.equal(result.uploadedRemote.length, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].originalUrl, duplicatedUrl);
    assert.match(result.failed[0].reason ?? "", /503/);
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});

test("background import uploads a duplicated remote image only once and replaces every reference", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  const duplicatedUrl = "https://images.example.com/duplicated.png";
  const uploadedUrl = "https://mmbiz.qpic.cn/uploaded/duplicated.jpg";
  const source = `![第一处](${duplicatedUrl})\n\n![第二处](${duplicatedUrl})`;
  let uploadCalls = 0;
  let currentContent = source;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      if (cmd === "read_markdown_file") {
        return {path: "C:\\dedupe-upload.md", base_dir: "C:\\", content: source};
      }
      if (cmd === "upload_remote_image") {
        uploadCalls += 1;
        return uploadedUrl;
      }
      throw new Error(`unexpected command: ${cmd}`);
    },
  };
  const unregister = registerBackgroundDocumentUpdater(async (_documentPath, transform) => {
    currentContent = transform(currentContent);
    return true;
  });

  try {
    imageUploadTasks.clearFinished();
    const prepared = await prepareMarkdownImport({markdownPath: "C:\\dedupe-upload.md"});
    await processMarkdownImportInBackground(prepared, "dedupe-upload.md");

    assert.equal(uploadCalls, 1);
    assert.equal(
      currentContent,
      `<img src="${uploadedUrl}" alt="第一处">\n\n<img src="${uploadedUrl}" alt="第二处">`,
    );
  } finally {
    unregister();
    imageUploadTasks.clearFinished();
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});
