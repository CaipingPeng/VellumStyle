import assert from "node:assert/strict";
import {after, afterEach, test} from "node:test";
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {build} from "esbuild";
import {readFile, unlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {ARTICLE_BOX_ID, ARTICLE_ROOT_ID} from "../../articleRoot.ts";
import {render as renderMarkdown} from "../../markdown/parser.ts";
import {STYLE_IDS} from "../../utils/style.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const INLINE_IMAGE_FIXTURE = [
  "正文中的图片写法保持可见：`![imgDescription](imgUrl)`。",
  "缩放写法保持可见：`![imgDescription](imgUrl =缩放参数)`。",
  "",
  "![已上传](https://mmbiz.qpic.cn/mmbiz_png/real/0)",
].join("\n");

const WARNING_FIXTURE = [
  "正文",
  "![本地](./assets/cover.png)",
  "",
  "![外链](https://example.com/external.png)",
].join("\n");

const UPDATED_WARNING_FIXTURE = [
  "更新后的正文",
  "",
  "",
  "",
  "![临时](blob:https://example.com/new-image)",
].join("\n");

type StoreModule = typeof import("../../store/index.ts");
type PublishDialogComponent = typeof import("./PublishDialog.tsx").default;

let storeModule: StoreModule | null = null;
let PublishDialog: PublishDialogComponent | null = null;
let initialStoreState: ReturnType<StoreModule["useStore"]["getState"]> | null = null;
const runtimeBundlePath = join(process.cwd(), "src", "components", "Publish", `.publishFlow.runtime-${process.pid}.mjs`);

async function loadRuntimeModules() {
  if (!storeModule) {
    const result = await build({
      stdin: {
        contents: [
          'export {default as PublishDialog} from "./src/components/Publish/PublishDialog.tsx";',
          'export {useStore} from "./src/store/index.ts";',
        ].join("\n"),
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      packages: "external",
      plugins: [{
        name: "node-test-import-meta-glob",
        setup(pluginBuild) {
          pluginBuild.onLoad({filter: /src[\\/]themes[\\/]index\.ts$/}, async (args) => ({
            contents: (await readFile(args.path, "utf8")).replace(
              'import.meta.glob("./presets/*.json", {import: "default"})',
              "({})",
            ),
            loader: "ts",
          }));
        },
      }],
    });
    await writeFile(runtimeBundlePath, result.outputFiles[0].contents);
    const runtime = await import(`${pathToFileURL(runtimeBundlePath).href}?test=${Date.now()}`) as {
      useStore: StoreModule["useStore"];
      PublishDialog: PublishDialogComponent;
    };
    storeModule = {useStore: runtime.useStore} as StoreModule;
    PublishDialog = runtime.PublishDialog;
    initialStoreState = runtime.useStore.getState();
  }
  return {useStore: storeModule.useStore, PublishDialog: PublishDialog!, initialStoreState: initialStoreState!};
}
const originalBodyHtml = document.body.innerHTML;
let activeCleanup: (() => void) | null = null;

type InvokeCall = {cmd: string; args?: Record<string, unknown>};
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === text);
  assert.ok(button, `button not found: ${text}`);
  return button;
}

function warningRegion(): HTMLElement | null {
  return document.querySelector('[role="region"][aria-labelledby]');
}

function installRenderedFixture(markdown: string) {
  const style = document.createElement("style");
  style.id = STYLE_IDS.markdown;
  style.innerText = "";
  document.body.appendChild(style);

  const box = document.createElement("div");
  box.id = ARTICLE_BOX_ID;
  box.innerHTML = `<section id="${ARTICLE_ROOT_ID}">${renderMarkdown(markdown)}</section>`;
  document.body.appendChild(box);
  return box;
}

interface Harness {
  calls: InvokeCall[];
  closeCount: () => number;
  draftCalls: () => InvokeCall[];
  holdDraft: () => Deferred<string>;
  publish: () => Promise<void>;
  continuePublish: () => Promise<void>;
  setContent: (content: string) => Promise<void>;
  setOpen: (open: boolean) => Promise<void>;
  cleanup: () => void;
}

async function createHarness(content = WARNING_FIXTURE): Promise<Harness> {
  const previousLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
  const storage = new Map<string, string>();
  const testStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    };
  Object.defineProperty(window, "localStorage", {configurable: true, value: testStorage});
  const previousGlobalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {configurable: true, value: testStorage});

  const {useStore, PublishDialog: DialogComponent, initialStoreState: storeInitialState} = await loadRuntimeModules();
  const storeState = {...storeInitialState, content, currentDocPath: null};
  useStore.setState(storeState, true);

  const previousMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    }),
  });

  const previousRaf = Object.getOwnPropertyDescriptor(window, "requestAnimationFrame");
  const previousCancelRaf = Object.getOwnPropertyDescriptor(window, "cancelAnimationFrame");
  let nextFrame = 1;
  const animationFrames = new Map<number, FrameRequestCallback>();
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      animationFrames.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(window, "cancelAnimationFrame", {configurable: true, value: (id: number) => animationFrames.delete(id)});

  const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {configurable: true, value: TestResizeObserver});

  const previousSetTimeout = Object.getOwnPropertyDescriptor(window, "setTimeout");
  const previousClearTimeout = Object.getOwnPropertyDescriptor(window, "clearTimeout");
  let nextTimer = 1;
  const timers = new Map<number, TimerHandler>();
  Object.defineProperty(window, "setTimeout", {
    configurable: true,
    value: (handler: TimerHandler) => {
      const id = nextTimer++;
      timers.set(id, handler);
      return id;
    },
  });
  Object.defineProperty(window, "clearTimeout", {configurable: true, value: (id: number) => timers.delete(id)});

  const calls: InvokeCall[] = [];
  let draftGate: Deferred<string> | null = null;
  const tauriWindow = window as typeof window & {
    __TAURI_INTERNALS__?: {invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>};
  };
  const previousInternals = tauriWindow.__TAURI_INTERNALS__;
  tauriWindow.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calls.push({cmd, args});
      if (cmd === "list_image_materials") {
        return {
          totalCount: 1,
          itemCount: 1,
          items: [{mediaId: "THUMB_ID", name: "cover.png", updateTime: 1780000000, url: "https://mmbiz.qpic.cn/cover/0"}],
        };
      }
      if (cmd === "add_draft") return draftGate?.promise ?? "DRAFT_ID";
      throw new Error(`unexpected Tauri command: ${cmd}`);
    },
  };

  const previousConsoleError = console.error;
  const actWarnings: string[] = [];
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (/not wrapped in act|testing environment is not configured/i.test(message)) actWarnings.push(message);
    else previousConsoleError(...args);
  };

  const articleBox = installRenderedFixture(content);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let open = true;
  let closes = 0;

  const renderDialog = async () => {
    await act(async () => {
      root.render(<DialogComponent open={open} onClose={() => { closes++; }} onNeedSettings={() => {}} />);
      await flushPromises();
    });
  };

  await renderDialog();
  await act(async () => {
    const material = document.querySelector<HTMLButtonElement>('button[aria-label^="选择素材库第 1 张图片作为封面"]');
    assert.ok(material, "material library item should load");
    material.click();
    await flushPromises();
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    act(() => root.unmount());
    timers.clear();
    animationFrames.clear();
    container.remove();
    articleBox.remove();
    document.getElementById(STYLE_IDS.markdown)?.remove();
    console.error = previousConsoleError;
    if (previousInternals === undefined) delete tauriWindow.__TAURI_INTERNALS__;
    else tauriWindow.__TAURI_INTERNALS__ = previousInternals;
    if (previousLocalStorage) Object.defineProperty(window, "localStorage", previousLocalStorage);
    else Reflect.deleteProperty(window, "localStorage");
    if (previousMatchMedia) Object.defineProperty(window, "matchMedia", previousMatchMedia);
    else Reflect.deleteProperty(window, "matchMedia");
    if (previousRaf) Object.defineProperty(window, "requestAnimationFrame", previousRaf);
    else Reflect.deleteProperty(window, "requestAnimationFrame");
    if (previousCancelRaf) Object.defineProperty(window, "cancelAnimationFrame", previousCancelRaf);
    else Reflect.deleteProperty(window, "cancelAnimationFrame");
    if (previousResizeObserver) Object.defineProperty(globalThis, "ResizeObserver", previousResizeObserver);
    else Reflect.deleteProperty(globalThis, "ResizeObserver");
    if (previousSetTimeout) Object.defineProperty(window, "setTimeout", previousSetTimeout);
    if (previousClearTimeout) Object.defineProperty(window, "clearTimeout", previousClearTimeout);
    if (previousGlobalLocalStorage) Object.defineProperty(globalThis, "localStorage", previousGlobalLocalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
    useStore.setState(storeInitialState, true);
    activeCleanup = null;
    assert.deepEqual(actWarnings, [], "React emitted act warnings");
  };
  activeCleanup = cleanup;

  return {
    calls,
    closeCount: () => closes,
    draftCalls: () => calls.filter((call) => call.cmd === "add_draft"),
    holdDraft: () => {
      draftGate = deferred<string>();
      return draftGate;
    },
    publish: async () => {
      await act(async () => {
        buttonWithText("发布到草稿箱").click();
        await flushPromises();
      });
    },
    continuePublish: async () => {
      await act(async () => {
        buttonWithText("仍然发布").click();
        await flushPromises();
      });
    },
    setContent: async (nextContent) => {
      await act(async () => {
        useStore.setState({content: nextContent});
        await flushPromises();
      });
    },
    setOpen: async (nextOpen) => {
      open = nextOpen;
      await renderDialog();
    },
    cleanup,
  };
}

after(async () => {
  await unlink(runtimeBundlePath).catch(() => undefined);
});

afterEach(() => {
  activeCleanup?.();
  document.body.innerHTML = originalBodyHtml;
});

test("publish request replaces the existing dialog with diagnostics and does not publish", async () => {
  const harness = await createHarness();
  await harness.publish();

  const warning = warningRegion();
  assert.ok(warning);
  assert.equal(document.querySelectorAll('button[title="关闭"]').length, 1, "warning must not create a nested modal");
  assert.match(document.querySelector<HTMLButtonElement>('button[title="关闭"]')?.parentElement?.textContent ?? "", /未上传图片检查/);
  assert.match(warning.textContent ?? "", /第 2 行 · 本地图片/);
  assert.match(warning.textContent ?? "", /\.\/assets\/cover\.png/);
  assert.match(warning.textContent ?? "", /第 4 行 · 外部图片/);
  assert.match(warning.textContent ?? "", /https:\/\/example\.com\/external\.png/);
  assert.equal(harness.draftCalls().length, 0);
});

test("back returns to publish form and restores focus to its publish trigger", async () => {
  const harness = await createHarness();
  await harness.publish();

  await act(async () => {
    buttonWithText("返回检查").click();
    await flushPromises();
  });

  assert.equal(warningRegion(), null);
  const publishButton = buttonWithText("发布到草稿箱");
  assert.equal(document.activeElement, publishButton);
  assert.equal(harness.draftCalls().length, 0);
});

test("warning initially focuses 返回检查", async () => {
  const harness = await createHarness();
  await harness.publish();

  assert.equal(document.activeElement, buttonWithText("返回检查"));
});

test("Escape exits only the warning and leaves the parent dialog open", async () => {
  const harness = await createHarness();
  await harness.publish();

  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Escape", cancelable: true}));
    await flushPromises();
  });

  assert.equal(warningRegion(), null);
  assert.equal(document.querySelectorAll('button[title="关闭"]').length, 1);
  assert.equal(harness.closeCount(), 0);
  assert.equal(document.activeElement, buttonWithText("发布到草稿箱"));
});

test("confirmed warning publishes exactly once", async () => {
  const harness = await createHarness();
  await harness.publish();
  await harness.continuePublish();

  assert.equal(harness.draftCalls().length, 1);
  assert.equal(warningRegion(), null);
});

test("failed confirmed publishing clears stale warning authorization", async () => {
  const harness = await createHarness();
  await harness.publish();
  const gate = harness.holdDraft();

  await act(async () => {
    buttonWithText("仍然发布").click();
    await flushPromises();
  });
  await act(async () => {
    gate.reject(new Error("draft rejected"));
    await gate.promise.catch(() => undefined);
    await flushPromises();
  });

  assert.equal(harness.draftCalls().length, 1);
  assert.equal(warningRegion(), null);
  assert.ok(buttonWithText("发布失败"));
});

test("rapid repeated clicks on a clean publish path invoke addDraft once", async () => {
  const harness = await createHarness(INLINE_IMAGE_FIXTURE);
  const gate = harness.holdDraft();

  await act(async () => {
    const publishButton = buttonWithText("发布到草稿箱");
    publishButton.click();
    publishButton.click();
    await flushPromises();
  });

  assert.equal(harness.draftCalls().length, 1);
  await act(async () => {
    gate.resolve("DRAFT_ID");
    await gate.promise;
    await flushPromises();
  });
});

test("rapid repeated confirmations invoke addDraft once", async () => {
  const harness = await createHarness();
  await harness.publish();
  const gate = harness.holdDraft();

  await act(async () => {
    const continueButton = buttonWithText("仍然发布");
    continueButton.click();
    continueButton.click();
    await flushPromises();
  });

  assert.equal(harness.draftCalls().length, 1);
  await act(async () => {
    gate.resolve("DRAFT_ID");
    await gate.promise;
    await flushPromises();
  });
});

test("confirmed busy state disables warning actions and ignores Escape", async () => {
  const harness = await createHarness();
  await harness.publish();
  const gate = harness.holdDraft();

  await act(async () => {
    buttonWithText("仍然发布").click();
    await flushPromises();
  });

  assert.ok(buttonWithText("返回检查").disabled);
  assert.ok(buttonWithText("仍然发布").disabled);
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", {key: "Escape", cancelable: true}));
    await flushPromises();
  });
  assert.ok(warningRegion());
  assert.equal(harness.closeCount(), 0);

  await act(async () => {
    gate.resolve("DRAFT_ID");
    await gate.promise;
    await flushPromises();
  });
});

test("changed snapshots are rescanned without publishing and a newly clean snapshot requires a new click", async () => {
  const harness = await createHarness();
  await harness.publish();

  await harness.setContent(UPDATED_WARNING_FIXTURE);
  await harness.continuePublish();
  assert.equal(harness.draftCalls().length, 0);
  assert.match(warningRegion()?.textContent ?? "", /第 5 行 · 临时图片/);
  assert.match(warningRegion()?.textContent ?? "", /blob:https:\/\/example\.com\/new-image/);

  await harness.setContent(INLINE_IMAGE_FIXTURE);
  await harness.continuePublish();
  assert.equal(harness.draftCalls().length, 0);
  assert.equal(warningRegion(), null);
  assert.ok(buttonWithText("发布到草稿箱"));
});

test("closing and reopening clears stale warning authorization", async () => {
  const harness = await createHarness();
  await harness.publish();
  assert.ok(warningRegion());

  await act(async () => {
    document.querySelector<HTMLButtonElement>('button[title="关闭"]')?.click();
    await flushPromises();
  });
  await harness.setOpen(false);
  await harness.setOpen(true);

  assert.equal(warningRegion(), null);
  assert.ok(buttonWithText("发布到草稿箱"));
  assert.equal(harness.draftCalls().length, 0);
});

test("visible inline image examples survive rendering and the HTML passed to addDraft", async () => {
  const harness = await createHarness(INLINE_IMAGE_FIXTURE);
  const article = document.getElementById(ARTICLE_BOX_ID);
  assert.match(article?.textContent ?? "", /!\[imgDescription\]\(imgUrl\)/);
  assert.match(article?.textContent ?? "", /!\[imgDescription\]\(imgUrl =缩放参数\)/);

  await harness.publish();

  const draftCall = harness.draftCalls()[0];
  assert.ok(draftCall);
  const html = String(draftCall.args?.content ?? "");
  assert.match(html, /!\[imgDescription\]\(imgUrl\)/);
  assert.match(html, /!\[imgDescription\]\(imgUrl =缩放参数\)/);
  assert.match(html, /mmbiz\.qpic\.cn\/mmbiz_png\/real\/0/);
});
