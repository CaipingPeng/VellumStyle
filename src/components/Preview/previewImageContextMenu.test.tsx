import assert from "node:assert/strict";
import {after, test} from "node:test";
import {unlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {act, type ComponentType} from "react";
import {createRoot, type Root} from "react-dom/client";
import {build} from "esbuild";
import type {SavePreviewImageResult} from "../../utils/previewImageActions.ts";
import {
  clampMenuPosition,
  resolvePreviewImage,
  type PreviewImageMenuTarget,
} from "./previewImageContextMenu.ts";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

interface PreviewImageContextMenuProps {
  target: PreviewImageMenuTarget;
  onCopy: (source: string) => void | Promise<void>;
  onSave: (source: string) => void | Promise<void>;
  onClose: () => void;
}

type PreviewImageContextMenuComponent = ComponentType<PreviewImageContextMenuProps>;
type PreviewComponent = ComponentType<{
  content: string;
  markdownThemeId: string;
  onResizeImage?: (imageIndex: number, size: {width: string}) => void;
}>;

const contextMenuModulePromise = import("./PreviewImageContextMenu.tsx")
  .then((module) => module as {default?: PreviewImageContextMenuComponent})
  .catch(() => ({} as {default?: PreviewImageContextMenuComponent}));

async function loadContextMenu(): Promise<PreviewImageContextMenuComponent> {
  const module = await contextMenuModulePromise;
  assert.equal(typeof module.default, "function", "PreviewImageContextMenu must be exported");
  return module.default as PreviewImageContextMenuComponent;
}

function dispatchPointerDown(target: EventTarget) {
  target.dispatchEvent(new window.MouseEvent("pointerdown", {bubbles: true, cancelable: true}));
}

function dispatchKey(target: EventTarget, key: string) {
  target.dispatchEvent(new window.KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}));
}

async function renderContextMenu(overrides: Partial<PreviewImageContextMenuProps> = {}) {
  const ContextMenu = await loadContextMenu();
  const host = document.createElement("div");
  host.dataset.testHost = "context-menu";
  document.body.appendChild(host);
  const root = createRoot(host);
  const calls = {copy: [] as string[], save: [] as string[], close: 0};
  const props: PreviewImageContextMenuProps = {
    target: {source: "https://example.com/image.png", x: 24, y: 32},
    onCopy: (source) => { calls.copy.push(source); },
    onSave: (source) => { calls.save.push(source); },
    onClose: () => {
      calls.close++;
    },
    ...overrides,
  };

  act(() => {
    root.render(<ContextMenu {...props} />);
  });
  const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
  assert.ok(menu, "context menu should be portalled to document.body");

  return {
    host,
    root,
    menu,
    calls,
    items: Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')),
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function menuItem(text: string): HTMLButtonElement {
  const item = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    .find((candidate) => candidate.textContent?.trim() === text);
  assert.ok(item, `menu item not found: ${text}`);
  return item;
}

test("resolves direct and descendant targets to an article image", () => {
  const articleRoot = document.createElement("article");
  const image = document.createElement("img");
  const imageChild = document.createElement("span");
  image.appendChild(imageChild);
  articleRoot.appendChild(image);

  assert.equal(resolvePreviewImage(image, articleRoot), image);
  assert.equal(resolvePreviewImage(imageChild, articleRoot), image);
});

test("rejects images outside the article and non-Element targets", () => {
  const articleRoot = document.createElement("article");
  const outsideImage = document.createElement("img");
  const textNode = document.createTextNode("image");

  assert.equal(resolvePreviewImage(outsideImage, articleRoot), null);
  assert.equal(resolvePreviewImage(textNode, articleRoot), null);
  assert.equal(resolvePreviewImage(null, articleRoot), null);
});

test("maps a resize overlay target back to its selected article image", () => {
  const articleRoot = document.createElement("article");
  const selectedImage = document.createElement("img");
  const outsideImage = document.createElement("img");
  const overlay = document.createElement("div");
  const resizeHandle = document.createElement("button");
  overlay.className = "vs-image-resize-overlay";
  overlay.appendChild(resizeHandle);
  articleRoot.appendChild(selectedImage);

  assert.equal(resolvePreviewImage(resizeHandle, articleRoot, selectedImage), selectedImage);
  assert.equal(resolvePreviewImage(resizeHandle, articleRoot, outsideImage), null);
  assert.equal(resolvePreviewImage(resizeHandle, articleRoot, null), null);
});

test("clamps a menu away from the viewport right and bottom edges", () => {
  assert.deepEqual(clampMenuPosition(790, 590, 200, 100, 800, 600), {
    left: 592,
    top: 492,
  });
});

test("clamps negative coordinates to the default viewport gap", () => {
  assert.deepEqual(clampMenuPosition(-40, -20, 200, 100, 800, 600), {
    left: 8,
    top: 8,
  });
});

test("keeps oversized menus at non-negative positions", () => {
  assert.deepEqual(clampMenuPosition(50, 40, 200, 100, 100, 80), {
    left: 8,
    top: 8,
  });
});

test("honors a custom viewport gap", () => {
  assert.deepEqual(clampMenuPosition(95, 75, 20, 20, 100, 80, 4), {
    left: 76,
    top: 56,
  });
});

test("portals exact ordered menu items with roles, Lucide icons, fixed positioning, and initial focus", async () => {
  const view = await renderContextMenu();
  try {
    assert.equal(view.menu.parentElement, document.body);
    assert.equal(view.menu.style.position, "fixed");
    assert.equal(view.menu.getAttribute("role"), "menu");
    assert.deepEqual(view.items.map((item) => item.textContent?.trim()), ["拷贝图片", "将图片另存为"]);
    assert.deepEqual(view.items.map((item) => item.getAttribute("role")), ["menuitem", "menuitem"]);
    assert.match(view.items[0].querySelector("svg")?.getAttribute("class") ?? "", /lucide-copy/);
    assert.match(view.items[1].querySelector("svg")?.getAttribute("class") ?? "", /lucide-save/);
    assert.equal(document.activeElement, view.items[0]);
  } finally {
    view.cleanup();
  }
});

test("measures before clamping to the viewport and forwards the target source to item callbacks", async () => {
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const originalHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  let menuMeasurements = 0;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("vs-preview-image-menu")) {
      menuMeasurements++;
      return {x: 0, y: 0, top: 0, left: 0, right: 180, bottom: 96, width: 180, height: 96, toJSON() { return {}; }};
    }
    return originalRect.call(this);
  };
  Object.defineProperty(window, "innerWidth", {configurable: true, value: 320});
  Object.defineProperty(window, "innerHeight", {configurable: true, value: 200});

  let view: Awaited<ReturnType<typeof renderContextMenu>> | null = null;
  try {
    view = await renderContextMenu({
      target: {source: "https://example.com/clamped.png", x: 310, y: 190},
    });
    assert.ok(menuMeasurements > 0, "menu should measure its rendered bounds");
    assert.equal(view.menu.style.left, "132px");
    assert.equal(view.menu.style.top, "96px");

    act(() => view?.items[0].click());
    act(() => view?.items[1].click());
    assert.deepEqual(view.calls.copy, ["https://example.com/clamped.png"]);
    assert.deepEqual(view.calls.save, ["https://example.com/clamped.png"]);
  } finally {
    view?.cleanup();
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
    if (originalHeight) Object.defineProperty(window, "innerHeight", originalHeight);
  }
});

test("cycles focus with ArrowDown and ArrowUp, and closes with Escape", async () => {
  const view = await renderContextMenu();
  try {
    act(() => dispatchKey(view.items[0], "ArrowDown"));
    assert.equal(document.activeElement, view.items[1]);
    act(() => dispatchKey(view.items[1], "ArrowDown"));
    assert.equal(document.activeElement, view.items[0]);
    act(() => dispatchKey(view.items[0], "ArrowUp"));
    assert.equal(document.activeElement, view.items[1]);
    act(() => dispatchKey(view.items[1], "Escape"));
    assert.equal(view.calls.close, 1);
  } finally {
    view.cleanup();
  }
});

test("dismisses on outside pointerdown, window blur, and any scroll while cleaning listeners on unmount", async () => {
  const view = await renderContextMenu();
  const outside = document.createElement("div");
  document.body.appendChild(outside);
  try {
    act(() => dispatchPointerDown(outside));
    act(() => window.dispatchEvent(new window.Event("blur")));
    act(() => outside.dispatchEvent(new window.Event("scroll")));
    assert.equal(view.calls.close, 3);

    view.cleanup();
    act(() => dispatchPointerDown(outside));
    act(() => window.dispatchEvent(new window.Event("blur")));
    act(() => outside.dispatchEvent(new window.Event("scroll")));
    assert.equal(view.calls.close, 3);
  } finally {
    if (view.host.isConnected) view.cleanup();
    outside.remove();
  }
});

test("stops menu pointer events from bubbling into preview selection handlers", async () => {
  const view = await renderContextMenu();
  let bubbledPointerDowns = 0;
  const onPointerDown = () => {
    bubbledPointerDowns++;
  };
  document.addEventListener("pointerdown", onPointerDown);
  try {
    act(() => dispatchPointerDown(view.items[0]));
    assert.equal(bubbledPointerDowns, 0);
    assert.equal(view.calls.close, 0);
  } finally {
    document.removeEventListener("pointerdown", onPointerDown);
    view.cleanup();
  }
});

interface PreviewRuntimeControls {
  copy: (source: string) => Promise<void>;
  save: (source: string) => Promise<SavePreviewImageResult>;
  copySources: string[];
  saveSources: string[];
  toasts: Array<{message: string; type: string}>;
  selectedModels: string[];
  resizeCalls: Array<{imageIndex: number; size: {width: string}}>;
  store: {
    themes: unknown[];
    codeThemeId: string;
    previewMode: string;
    selectedModelId: string | null;
    setSelectedModel: (modelId: string) => void;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __PREVIEW_IMAGE_MENU_TEST__: PreviewRuntimeControls;
}

function createPreviewRuntimeControls(): PreviewRuntimeControls {
  const controls: PreviewRuntimeControls = {
    copy: async () => {},
    save: async () => ({status: "saved", path: "C:/saved.png"}),
    copySources: [],
    saveSources: [],
    toasts: [],
    selectedModels: [],
    resizeCalls: [],
    store: {
      themes: [],
      codeThemeId: "default",
      previewMode: "responsive",
      selectedModelId: null,
      setSelectedModel: (modelId) => controls.selectedModels.push(modelId),
    },
  };
  return controls;
}

const previewRuntimePath = join(
  process.cwd(),
  "src",
  "components",
  "Preview",
  `.previewImageContextMenu.runtime-${process.pid}.mjs`,
);
let previewModulePromise: Promise<{Preview: PreviewComponent}> | null = null;

async function loadPreview(): Promise<PreviewComponent> {
  if (!previewModulePromise) {
    previewModulePromise = (async () => {
      const stubs = new Map<RegExp, string>([
        [/src[\\/]markdown[\\/]parser\.ts$/, "export function render(content) { return content; }"],
        [/src[\\/]store[\\/]index\.ts$/, [
          "export function useStore(selector) { return selector(globalThis.__PREVIEW_IMAGE_MENU_TEST__.store); }",
          "export function getThemeById() { return {css: ''}; }",
        ].join("\n")],
        [/src[\\/]utils[\\/]style\.ts$/, "export const STYLE_IDS = {markdown: 'test-markdown'}; export function replaceStyle() {}"],
        [/src[\\/]utils[\\/]imageProxy\.ts$/, "export function toProxyHtml(html) { return html; }"],
        [/src[\\/]markdown[\\/]mathjax\.ts$/, "export async function typesetMath() {}"],
        [/src[\\/]markdown[\\/]mermaid\.ts$/, "export async function renderMermaidCharts() {} export function reuseRenderedMermaidCharts(html) { return html; }"],
        [/src[\\/]components[\\/]StylePanel[\\/]elementMap\.ts$/, [
          "export const SELECTOR_PRIORITY = [{selector: 'img', modelId: 'image'}, {selector: 'p', modelId: 'p'}];",
          "export function modelIdFromElement(element) {",
          "  return SELECTOR_PRIORITY.find((entry) => element.closest(entry.selector))?.modelId ?? null;",
          "}",
        ].join("\n")],
        [/src[\\/]components[\\/]Preview[\\/]previewModes\.ts$/, "export function getPreviewMode() { return {width: null}; }"],
        [/src[\\/]markdown[\\/]codeThemes\.ts$/, "export function buildMarkdownCss() { return ''; }"],
        [/src[\\/]utils[\\/]previewImageActions\.ts$/, [
          "export async function copyPreviewImage(source) {",
          "  globalThis.__PREVIEW_IMAGE_MENU_TEST__.copySources.push(source);",
          "  return globalThis.__PREVIEW_IMAGE_MENU_TEST__.copy(source);",
          "}",
          "export async function savePreviewImageAs(source) {",
          "  globalThis.__PREVIEW_IMAGE_MENU_TEST__.saveSources.push(source);",
          "  return globalThis.__PREVIEW_IMAGE_MENU_TEST__.save(source);",
          "}",
        ].join("\n")],
        [/src[\\/]components[\\/]Toast[\\/]toast\.ts$/, [
          "export const toast = {show(message, type = 'info') {",
          "  globalThis.__PREVIEW_IMAGE_MENU_TEST__.toasts.push({message, type});",
          "}};",
        ].join("\n")],
      ]);
      const result = await build({
        stdin: {
          contents: 'export {default as Preview} from "./src/components/Preview/Preview.tsx";',
          resolveDir: process.cwd(),
          loader: "ts",
        },
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        packages: "external",
        plugins: [{
          name: "preview-image-menu-test-stubs",
          setup(pluginBuild) {
            for (const [filter, contents] of stubs) {
              pluginBuild.onLoad({filter}, () => ({contents, loader: "ts"}));
            }
          },
        }],
      });
      await writeFile(previewRuntimePath, result.outputFiles[0].contents);
      return import(`${pathToFileURL(previewRuntimePath).href}?test=${Date.now()}`) as Promise<{Preview: PreviewComponent}>;
    })();
  }
  const runtime = await previewModulePromise;
  return runtime.Preview;
}

after(async () => {
  await unlink(previewRuntimePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  Reflect.deleteProperty(globalThis, "__PREVIEW_IMAGE_MENU_TEST__");
});

function waitForPreviewRender() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 120));
}

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

async function renderPreview(content: string) {
  const Preview = await loadPreview();
  const controls = createPreviewRuntimeControls();
  globalThis.__PREVIEW_IMAGE_MENU_TEST__ = controls;
  const host = document.createElement("div");
  host.dataset.testHost = "preview";
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  const renderContent = async (nextContent: string, settle = true) => {
    await act(async () => {
      root.render(
        <Preview
          content={nextContent}
          markdownThemeId="default"
          onResizeImage={(imageIndex, size) => controls.resizeCalls.push({imageIndex, size})}
        />,
      );
    });
    if (settle) {
      await act(async () => {
        await waitForPreviewRender();
      });
    }
  };
  await renderContent(content);

  return {
    controls,
    host,
    root,
    renderContent,
    article() {
      const article = host.querySelector<HTMLElement>("#article");
      assert.ok(article, "article should render");
      return article;
    },
    openMenu(target: Element, coordinates = {clientX: 40, clientY: 52}) {
      const event = new window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        ...coordinates,
      });
      act(() => target.dispatchEvent(event));
      return event;
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
      document.body.querySelector('[role="menu"]')?.remove();
    },
  };
}

const IMAGE_HTML = [
  '<p id="paragraph">正文</p>',
  '<img data-vs-image-index="0" src="https://example.com/original.png" alt="示例">',
].join("");

test("Preview preserves the native context menu except for images inside #article", async () => {
  const view = await renderPreview(IMAGE_HTML);
  const outsideImage = document.createElement("img");
  document.body.appendChild(outsideImage);
  try {
    const paragraphEvent = view.openMenu(view.article().querySelector("#paragraph")!);
    assert.equal(paragraphEvent.defaultPrevented, false);
    assert.equal(document.body.querySelector('[role="menu"]'), null);

    const outsideEvent = new window.MouseEvent("contextmenu", {bubbles: true, cancelable: true});
    outsideImage.dispatchEvent(outsideEvent);
    assert.equal(outsideEvent.defaultPrevented, false);
    assert.equal(document.body.querySelector('[role="menu"]'), null);

    const imageEvent = view.openMenu(view.article().querySelector("img")!, {clientX: 73, clientY: 91});
    assert.equal(imageEvent.defaultPrevented, true);
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    assert.ok(menu);
    assert.equal(menu.style.left, "73px");
    assert.equal(menu.style.top, "91px");
  } finally {
    outsideImage.remove();
    view.cleanup();
  }
});

test("Preview article images are keyboard focusable and keep or receive an accessible name", async () => {
  const view = await renderPreview([
    '<img id="named-image" data-vs-image-index="0" src="https://example.com/named.png" alt="示例图片">',
    '<img id="fallback-image" data-vs-image-index="1" src="https://example.com/fallback.png">',
  ].join(""));
  try {
    const namedImage = view.article().querySelector<HTMLImageElement>("#named-image")!;
    const fallbackImage = view.article().querySelector<HTMLImageElement>("#fallback-image")!;

    assert.equal(namedImage.tabIndex, 0);
    assert.equal(namedImage.getAttribute("alt"), "示例图片");
    assert.equal(namedImage.getAttribute("aria-haspopup"), "menu");
    assert.equal(fallbackImage.tabIndex, 0);
    assert.match(fallbackImage.getAttribute("aria-label") ?? "", /图片/);
    assert.equal(fallbackImage.getAttribute("aria-haspopup"), "menu");
  } finally {
    view.cleanup();
  }
});

test("Preview opens the image menu from Shift+F10 and ContextMenu keyboard keys", async () => {
  const view = await renderPreview(IMAGE_HTML);
  try {
    const image = view.article().querySelector<HTMLImageElement>("img")!;
    image.getBoundingClientRect = () => ({x: 20, y: 30, left: 20, top: 30, right: 120, bottom: 80, width: 100, height: 50, toJSON() { return {}; }});
    image.focus();

    const shiftF10 = new window.KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => image.dispatchEvent(shiftF10));
    assert.equal(shiftF10.defaultPrevented, true);
    assert.ok(document.body.querySelector('[role="menu"]'));

    act(() => dispatchKey(document.activeElement!, "Escape"));
    image.focus();
    const contextMenuKey = new window.KeyboardEvent("keydown", {
      key: "ContextMenu",
      bubbles: true,
      cancelable: true,
    });
    act(() => image.dispatchEvent(contextMenuKey));
    assert.equal(contextMenuKey.defaultPrevented, true);
    assert.ok(document.body.querySelector('[role="menu"]'));
  } finally {
    view.cleanup();
  }
});

test("Preview restores focus to the source image when Escape closes the menu", async () => {
  const view = await renderPreview(IMAGE_HTML);
  try {
    const image = view.article().querySelector<HTMLImageElement>("img")!;
    image.focus();
    const openEvent = new window.KeyboardEvent("keydown", {
      key: "ContextMenu",
      bubbles: true,
      cancelable: true,
    });
    act(() => image.dispatchEvent(openEvent));
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    assert.ok(menu);
    assert.notEqual(document.activeElement, image);

    act(() => dispatchKey(document.activeElement!, "Escape"));
    assert.equal(document.body.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, image);
  } finally {
    view.cleanup();
  }
});

test("Preview copy and save close and restore image focus before awaiting their actions", async () => {
  const view = await renderPreview(IMAGE_HTML);
  const pendingCopy = deferred<void>();
  const pendingSave = deferred<SavePreviewImageResult>();
  view.controls.copy = () => pendingCopy.promise;
  view.controls.save = () => pendingSave.promise;
  try {
    const image = view.article().querySelector<HTMLImageElement>("img")!;

    view.openMenu(image);
    act(() => menuItem("拷贝图片").click());
    assert.equal(document.body.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, image);
    assert.deepEqual(view.controls.copySources, ["https://example.com/original.png"]);

    await act(async () => {
      pendingCopy.resolve();
      await pendingCopy.promise;
      await flushPromises();
    });

    view.openMenu(image);
    act(() => menuItem("将图片另存为").click());
    assert.equal(document.body.querySelector('[role="menu"]'), null);
    assert.equal(document.activeElement, image);
    assert.deepEqual(view.controls.saveSources, ["https://example.com/original.png"]);

    await act(async () => {
      pendingSave.resolve({status: "cancelled"});
      await pendingSave.promise;
      await flushPromises();
    });
  } finally {
    view.cleanup();
  }
});

test("Preview maps resize-overlay contextmenu back to its current article image", async () => {
  const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  const previousRaf = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const previousCancelRaf = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  class TestResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {configurable: true, value: TestResizeObserver});
  Object.defineProperty(globalThis, "requestAnimationFrame", {configurable: true, value: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }});
  Object.defineProperty(globalThis, "cancelAnimationFrame", {configurable: true, value: () => {}});

  const view = await renderPreview(IMAGE_HTML);
  try {
    const article = view.article();
    const image = article.querySelector<HTMLImageElement>("img")!;
    const articleBox = view.host.querySelector<HTMLElement>("#article-box")!;
    image.getBoundingClientRect = () => ({x: 20, y: 30, left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100, toJSON() { return {}; }});
    article.getBoundingClientRect = () => ({x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 500, width: 600, height: 500, toJSON() { return {}; }});
    articleBox.getBoundingClientRect = () => ({x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 540, width: 640, height: 540, toJSON() { return {}; }});

    act(() => image.dispatchEvent(new window.MouseEvent("mousemove", {bubbles: true})));
    const overlay = view.host.querySelector<HTMLElement>(".vs-image-resize-overlay");
    assert.ok(overlay, "resize overlay should be visible for the article image");

    const event = view.openMenu(overlay);
    assert.equal(event.defaultPrevented, true);
    assert.ok(document.body.querySelector('[role="menu"]'));
    await act(async () => {
      menuItem("拷贝图片").click();
      await flushPromises();
    });
    assert.deepEqual(view.controls.copySources, ["https://example.com/original.png"]);
  } finally {
    view.cleanup();
    if (previousResizeObserver) Object.defineProperty(globalThis, "ResizeObserver", previousResizeObserver);
    else Reflect.deleteProperty(globalThis, "ResizeObserver");
    if (previousRaf) Object.defineProperty(globalThis, "requestAnimationFrame", previousRaf);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (previousCancelRaf) Object.defineProperty(globalThis, "cancelAnimationFrame", previousCancelRaf);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  }
});

test("Preview menu interactions trigger the image action without entering the selection path", async () => {
  const view = await renderPreview(IMAGE_HTML);
  try {
    const paragraph = view.article().querySelector<HTMLElement>("#paragraph")!;
    act(() => paragraph.click());
    assert.deepEqual(view.controls.selectedModels, ["p"]);
    assert.equal(paragraph.classList.contains("preview-edit-selected"), true);

    view.openMenu(view.article().querySelector("img")!);
    const copyItem = menuItem("拷贝图片");
    await act(async () => {
      dispatchPointerDown(copyItem);
      copyItem.click();
      await flushPromises();
    });

    assert.deepEqual(view.controls.copySources, ["https://example.com/original.png"]);
    assert.deepEqual(view.controls.selectedModels, ["p"]);
    assert.equal(paragraph.classList.contains("preview-edit-selected"), true);
  } finally {
    view.cleanup();
  }
});

test("Preview keeps editable-element hover and style selection behavior", async () => {
  const view = await renderPreview(IMAGE_HTML);
  try {
    const paragraph = view.article().querySelector<HTMLElement>("#paragraph")!;

    act(() => paragraph.dispatchEvent(new window.MouseEvent("mousemove", {bubbles: true})));
    assert.equal(paragraph.classList.contains("preview-edit-hover"), true);

    act(() => paragraph.click());
    assert.deepEqual(view.controls.selectedModels, ["p"]);
    assert.equal(paragraph.classList.contains("preview-edit-selected"), true);
  } finally {
    view.cleanup();
  }
});

test("Preview keeps image resize handle pointer dragging wired to onResizeImage", async () => {
  const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  const previousRaf = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const previousCancelRaf = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  class TestResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {configurable: true, value: TestResizeObserver});
  Object.defineProperty(globalThis, "requestAnimationFrame", {configurable: true, value: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }});
  Object.defineProperty(globalThis, "cancelAnimationFrame", {configurable: true, value: () => {}});

  const view = await renderPreview(IMAGE_HTML);
  try {
    const article = view.article();
    const image = article.querySelector<HTMLImageElement>("img")!;
    const articleBox = view.host.querySelector<HTMLElement>("#article-box")!;
    image.getBoundingClientRect = () => ({x: 20, y: 30, left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100, toJSON() { return {}; }});
    article.getBoundingClientRect = () => ({x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500, toJSON() { return {}; }});
    articleBox.getBoundingClientRect = () => ({x: 0, y: 0, left: 0, top: 0, right: 440, bottom: 540, width: 440, height: 540, toJSON() { return {}; }});

    act(() => image.dispatchEvent(new window.MouseEvent("mousemove", {bubbles: true})));
    const handle = view.host.querySelector<HTMLElement>('[data-resize-handle="se"]');
    assert.ok(handle, "southeast resize handle should be visible");

    act(() => {
      handle.dispatchEvent(new window.MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 220,
        clientY: 130,
      }));
      document.dispatchEvent(new window.MouseEvent("pointermove", {
        bubbles: true,
        clientX: 300,
        clientY: 170,
      }));
      document.dispatchEvent(new window.MouseEvent("pointerup", {bubbles: true}));
    });

    assert.deepEqual(view.controls.resizeCalls, [{imageIndex: 0, size: {width: "70%"}}]);
  } finally {
    view.cleanup();
    if (previousResizeObserver) Object.defineProperty(globalThis, "ResizeObserver", previousResizeObserver);
    else Reflect.deleteProperty(globalThis, "ResizeObserver");
    if (previousRaf) Object.defineProperty(globalThis, "requestAnimationFrame", previousRaf);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (previousCancelRaf) Object.defineProperty(globalThis, "cancelAnimationFrame", previousCancelRaf);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  }
});

test("Preview closes before awaiting copy and uses currentSrc with the exact success Toast", async () => {
  const view = await renderPreview(IMAGE_HTML);
  const pendingCopy = deferred<void>();
  view.controls.copy = () => pendingCopy.promise;
  try {
    const image = view.article().querySelector<HTMLImageElement>("img")!;
    Object.defineProperty(image, "currentSrc", {configurable: true, value: "https://cdn.example.com/current.png"});
    view.openMenu(image);

    act(() => menuItem("拷贝图片").click());
    assert.deepEqual(view.controls.copySources, ["https://cdn.example.com/current.png"]);
    assert.equal(document.body.querySelector('[role="menu"]'), null, "menu must close before the action settles");
    assert.deepEqual(view.controls.toasts, []);

    await act(async () => {
      pendingCopy.resolve();
      await pendingCopy.promise;
      await flushPromises();
    });
    assert.deepEqual(view.controls.toasts, [{message: "图片已复制", type: "info"}]);
  } finally {
    view.cleanup();
  }
});

test("Preview reports exact copy and save failures, including a non-Error rejection message", async () => {
  const view = await renderPreview(IMAGE_HTML);
  try {
    const image = view.article().querySelector<HTMLImageElement>("img")!;
    view.controls.copy = async () => {
      throw new Error("剪贴板不可用");
    };
    view.openMenu(image);
    await act(async () => {
      menuItem("拷贝图片").click();
      await flushPromises();
    });
    assert.deepEqual(view.controls.toasts, [{message: "图片复制失败：剪贴板不可用", type: "error"}]);

    view.controls.save = async () => {
      throw {message: "磁盘只读"};
    };
    view.openMenu(image);
    await act(async () => {
      menuItem("将图片另存为").click();
      await flushPromises();
    });
    assert.deepEqual(view.controls.toasts, [
      {message: "图片复制失败：剪贴板不可用", type: "error"},
      {message: "图片保存失败：磁盘只读", type: "error"},
    ]);
  } finally {
    view.cleanup();
  }
});

test("Preview shows the exact saved Toast and stays silent when save is cancelled", async () => {
  const view = await renderPreview(IMAGE_HTML);
  try {
    const image = view.article().querySelector<HTMLImageElement>("img")!;
    view.controls.save = async () => ({status: "saved", path: "C:/saved.png"});
    view.openMenu(image);
    await act(async () => {
      menuItem("将图片另存为").click();
      await flushPromises();
    });
    assert.deepEqual(view.controls.toasts, [{message: "图片已保存", type: "info"}]);

    view.controls.toasts.length = 0;
    view.controls.save = async () => ({status: "cancelled"});
    view.openMenu(image);
    await act(async () => {
      menuItem("将图片另存为").click();
      await flushPromises();
    });
    assert.deepEqual(view.controls.toasts, []);
  } finally {
    view.cleanup();
  }
});

test("Preview safely closes without refocusing an image removed by article content rerender", async () => {
  const view = await renderPreview(IMAGE_HTML);
  try {
    const oldImage = view.article().querySelector<HTMLImageElement>("img")!;
    let focusCalls = 0;
    oldImage.focus = () => {
      focusCalls++;
    };
    view.openMenu(oldImage);
    assert.ok(document.body.querySelector('[role="menu"]'));

    await assert.doesNotReject(() => view.renderContent('<p id="updated">更新正文</p>', false));
    assert.equal(document.body.querySelector('[role="menu"]'), null);
    assert.equal(focusCalls, 0);

    await act(async () => {
      await waitForPreviewRender();
    });
    assert.equal(oldImage.isConnected, false);
    assert.equal(view.article().querySelector("#updated")?.textContent, "更新正文");
    assert.equal(focusCalls, 0);
  } finally {
    view.cleanup();
  }
});
