import assert from "node:assert/strict";
import {test} from "node:test";

type PreviewImageContextMenuModule = {
  resolvePreviewImage?: (
    target: EventTarget | null,
    articleRoot: HTMLElement,
    overlayImage?: HTMLImageElement | null,
  ) => HTMLImageElement | null;
  clampMenuPosition?: (
    x: number,
    y: number,
    menuWidth: number,
    menuHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    gap?: number,
  ) => {left: number; top: number};
};

const modulePromise = import("./previewImageContextMenu.ts")
  .then((module) => module as PreviewImageContextMenuModule)
  .catch(() => ({} as PreviewImageContextMenuModule));

async function loadHelpers() {
  const module = await modulePromise;
  assert.equal(
    typeof module.resolvePreviewImage,
    "function",
    "resolvePreviewImage must be exported",
  );
  assert.equal(
    typeof module.clampMenuPosition,
    "function",
    "clampMenuPosition must be exported",
  );
  return module as Required<PreviewImageContextMenuModule>;
}

test("resolves direct and descendant targets to an article image", async () => {
  const {resolvePreviewImage} = await loadHelpers();
  const articleRoot = document.createElement("article");
  const image = document.createElement("img");
  const imageChild = document.createElement("span");
  image.appendChild(imageChild);
  articleRoot.appendChild(image);

  assert.equal(resolvePreviewImage(image, articleRoot), image);
  assert.equal(resolvePreviewImage(imageChild, articleRoot), image);
});

test("rejects images outside the article and non-Element targets", async () => {
  const {resolvePreviewImage} = await loadHelpers();
  const articleRoot = document.createElement("article");
  const outsideImage = document.createElement("img");
  const textNode = document.createTextNode("image");

  assert.equal(resolvePreviewImage(outsideImage, articleRoot), null);
  assert.equal(resolvePreviewImage(textNode, articleRoot), null);
  assert.equal(resolvePreviewImage(null, articleRoot), null);
});

test("maps a resize overlay target back to its selected article image", async () => {
  const {resolvePreviewImage} = await loadHelpers();
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

test("clamps a menu away from the viewport right and bottom edges", async () => {
  const {clampMenuPosition} = await loadHelpers();

  assert.deepEqual(clampMenuPosition(790, 590, 200, 100, 800, 600), {
    left: 592,
    top: 492,
  });
});

test("clamps negative coordinates to the default viewport gap", async () => {
  const {clampMenuPosition} = await loadHelpers();

  assert.deepEqual(clampMenuPosition(-40, -20, 200, 100, 800, 600), {
    left: 8,
    top: 8,
  });
});

test("keeps oversized menus at non-negative positions", async () => {
  const {clampMenuPosition} = await loadHelpers();

  assert.deepEqual(clampMenuPosition(50, 40, 200, 100, 100, 80), {
    left: 8,
    top: 8,
  });
});

test("honors a custom viewport gap", async () => {
  const {clampMenuPosition} = await loadHelpers();

  assert.deepEqual(clampMenuPosition(95, 75, 20, 20, 100, 80, 4), {
    left: 76,
    top: 56,
  });
});
