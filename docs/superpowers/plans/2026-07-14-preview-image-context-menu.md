# Preview Image Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-item context menu to preview images that copies the selected image to the native clipboard or saves its original bytes through a system Save As dialog.

**Architecture:** React owns target detection, menu lifecycle, positioning, dialogs, and Toast feedback. A focused TypeScript utility bridges to two Tauri commands: Rust fetches and validates image sources for Save As, and fetches/decodes them to RGBA before using Tauri's clipboard-manager plugin for native image copying. Pure helpers isolate URL restoration, positioning, and filename behavior for deterministic tests.

**Tech Stack:** React 18, TypeScript, Node test runner + jsdom, Tauri 2, Rust, reqwest, image-rs, resvg, tauri-plugin-dialog, tauri-plugin-clipboard-manager.

---

## File map

- Create `src/components/Preview/previewImageContextMenu.ts`: pure target/source/position helpers and menu state types.
- Create `src/components/Preview/PreviewImageContextMenu.tsx`: portal-rendered, keyboard-accessible two-item menu.
- Create `src/components/Preview/previewImageContextMenu.test.tsx`: helper and menu lifecycle tests.
- Create `src/utils/previewImageActions.ts`: Tauri command/dialog/write bridge with dependency injection for tests.
- Create `src/utils/previewImageActions.test.ts`: copy/save success, cancellation, proxy URL, and failure tests.
- Modify `src/components/Preview/Preview.tsx`: wire delegated `contextmenu`, dismissal events, menu actions, and Toasts without disturbing resize logic.
- Modify `src/utils/imageProxy.ts` and create `src/utils/imageProxy.test.ts`: restore a single proxy image URL.
- Modify `src/styles/globals.css` and `src/styles/scrollbarStyle.test.ts`: menu styling and style regression assertions.
- Create `src-tauri/src/preview_image.rs`: source loading, format sniffing, metadata, rasterization, clipboard copy, and Rust tests.
- Modify `src-tauri/src/lib.rs`: initialize clipboard plugin and register commands.
- Modify `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`: Rust dependencies/features.
- Modify `src-tauri/capabilities/default.json`: grant only `clipboard-manager:allow-write-image` if frontend plugin invocation is retained; omit this permission if copying remains entirely inside the custom Rust command.

## Fixed implementation decisions

- Supported original formats in v1: PNG (`image/png`, `.png`), JPEG (`image/jpeg`, `.jpg`), GIF (`image/gif`, `.gif`), WebP (`image/webp`, `.webp`), and SVG (`image/svg+xml`, `.svg`).
- Maximum source size: 15 MiB, enforced while streaming and before decoding data URLs.
- HTTP client: 8-second connect timeout, 20-second total timeout, at most 5 redirects.
- Raster decode guard: maximum 40 million pixels and maximum dimension 16,384; SVG uses the same pixel/dimension limits before allocation.
- Accepted source schemes: `http`, `https`, and `data:image/...`; all others fail.
- Save As preserves validated original bytes. If the user manually chooses a different extension, the chosen path is respected; the filter/default filename guide the correct choice, but bytes are never silently transcoded during save.
- Clipboard copying uses native RGBA image data via `tauri-plugin-clipboard-manager`; raster formats decode their first/default frame, while SVG is rendered with scripts and external resource loading disabled by resvg/usvg.

### Task 1: Proxy restoration and context-menu primitives

**Files:**
- Modify: `src/utils/imageProxy.ts`
- Create: `src/components/Preview/previewImageContextMenu.ts`
- Create: `src/components/Preview/previewImageContextMenu.test.tsx`
- Create: `src/utils/imageProxy.test.ts`

- [ ] **Step 1: Write failing tests for single-URL restoration**

Cover both Windows `http://wximg.localhost/?url=` and non-Windows `wximg://localhost/?url=` forms, malformed encoding, and ordinary URLs. Expected behavior is original URL on valid proxy input and unchanged source otherwise.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/components/Preview/previewImageContextMenu.test.tsx src/utils/imageProxy.test.ts`
Expected: FAIL because `fromProxyImageUrl` and context helpers do not exist.

- [ ] **Step 3: Implement pure helpers**

Add:

```ts
export interface PreviewImageMenuTarget { source: string; x: number; y: number }
export function resolvePreviewImage(target: EventTarget | null, articleRoot: HTMLElement, overlayImage?: HTMLImageElement | null): HTMLImageElement | null
export function clampMenuPosition(x: number, y: number, menuWidth: number, menuHeight: number, viewportWidth: number, viewportHeight: number, gap?: number): {left: number; top: number}
```

`resolvePreviewImage` accepts a direct/descendant image only when contained by `articleRoot`, and maps `.vs-image-resize-overlay` back to the currently selected overlay image. `fromProxyImageUrl` must safely catch malformed percent encoding.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/utils/imageProxy.ts src/utils/imageProxy.test.ts src/components/Preview/previewImageContextMenu.ts src/components/Preview/previewImageContextMenu.test.tsx
git commit -m "test: define preview image context menu behavior"
```

### Task 2: Native image source loading and clipboard pipeline

**Files:**
- Create: `src-tauri/src/preview_image.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`

- [ ] **Step 1: Add failing Rust tests for format and safety rules**

Unit-test pure functions with in-memory fixtures for PNG, JPEG, GIF, WebP, and SVG. Cover MIME/signature precedence, suggested-name sanitization, malformed/oversized data URLs, unsupported protocol, first-frame raster decode, SVG render, pixel limits, and valid PNG clipboard raster output dimensions.

- [ ] **Step 2: Run the focused Rust tests and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml preview_image -- --nocapture`
Expected: FAIL because the module and functions do not exist.

- [ ] **Step 3: Add minimal dependencies**

Add `tauri-plugin-clipboard-manager = "2.3.2"`; add a direct `image = { version = "0.25.10", default-features = false, features = ["png", "jpeg", "gif", "webp"] }`; extend reqwest with `stream`; reuse existing `base64`, `url`, `urlencoding`, and `resvg`.

- [ ] **Step 4: Implement bounded source loading**

Define serializable metadata:

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewImageAsset {
    bytes: Vec<u8>,
    mime_type: String,
    file_name: String,
    extension: String,
}
```

Implement HTTP streaming with 15 MiB hard stop and response status checks. Requests to the exact existing WeChat image hosts `mmbiz.qpic.cn` and `mmbiz.qlogo.cn` must set `Referer: https://mp.weixin.qq.com` (and may upgrade HTTP to HTTPS as the existing proxy does); redirects, timeouts, streaming limits, and format validation still apply. Parse base64 and percent-encoded data URLs with the same hard stop. Sniff bytes and validate that they decode as one of the fixed supported formats; do not trust URL extensions or response MIME alone. Add HTTP fixture coverage for the WeChat Referer, non-success status, non-image response, redirect limit, timeout, and streaming overflow.

- [ ] **Step 5: Implement decode and native copy command**

Expose:

```rust
#[tauri::command]
pub async fn get_preview_image_asset(source: String) -> Result<PreviewImageAsset, String>

#[tauri::command]
pub async fn copy_preview_image(app: tauri::AppHandle, source: String) -> Result<(), String>
```

Raster formats become bounded RGBA. SVG is parsed/rendered through resvg into RGBA. `copy_preview_image` calls `app.clipboard().write_image(&tauri::image::Image::new_owned(...))`; it returns only after clipboard success.

- [ ] **Step 6: Register plugin and commands**

Initialize `tauri_plugin_clipboard_manager::init()` and add both commands to `generate_handler!`. Because the webview never invokes the plugin command directly, do not grant broad clipboard read permissions.

- [ ] **Step 7: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml preview_image -- --nocapture`
Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/preview_image.rs
git commit -m "feat: add native preview image pipeline"
```

### Task 3: TypeScript copy and Save As actions

**Files:**
- Create: `src/utils/previewImageActions.ts`
- Create: `src/utils/previewImageActions.test.ts`

- [ ] **Step 1: Write failing action tests**

Use dependency injection to verify:

- copy restores proxy URL and invokes `copy_preview_image`;
- Web mode rejects with a clear message;
- Save As requests metadata, opens the dialog with detected extension/default name, and writes exact bytes;
- cancellation returns `cancelled` and does not write;
- dialog/invoke/write failures propagate without success status;
- SVG Save As keeps original SVG bytes;
- manually changed extension is respected as the selected destination path.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/utils/previewImageActions.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the action boundary**

Export `copyPreviewImage(source)` and `savePreviewImageAs(source)`. Dynamically import the dialog only in Tauri mode. Use `invoke<PreviewImageAsset>("get_preview_image_asset", ...)`, `invoke("copy_preview_image", ...)`, and existing `write_export_file`. Return a discriminated Save result (`saved` or `cancelled`) so cancellation cannot be mistaken for failure.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/utils/previewImageActions.ts src/utils/previewImageActions.test.ts
git commit -m "feat: add preview image copy and save actions"
```

### Task 4: Menu component, Preview wiring, and styling

**Files:**
- Create: `src/components/Preview/PreviewImageContextMenu.tsx`
- Modify: `src/components/Preview/previewImageContextMenu.test.tsx`
- Modify: `src/components/Preview/Preview.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/styles/scrollbarStyle.test.ts`

- [ ] **Step 1: Add failing menu and integration tests**

Test the exact item order/text, `role="menu"` / `role="menuitem"`, viewport clamping after measurement, item callbacks, Escape, outside pointerdown, window blur, and scroll dismissal. Add source-level or DOM integration coverage proving `Preview` intercepts context menu only for article images and closes state on content rerender.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/components/Preview/previewImageContextMenu.test.tsx src/styles/scrollbarStyle.test.ts`
Expected: FAIL before component/wiring/styles exist.

- [ ] **Step 3: Implement the portal menu**

Render into `document.body` with `position: fixed`, measure in `useLayoutEffect`, clamp to an 8 px viewport gap, focus the first item, support ArrowUp/ArrowDown and Escape, and stop menu pointer events from reaching preview selection logic. Use Lucide `Copy` and `Save` icons and existing color variables.

- [ ] **Step 4: Wire Preview event delegation and action feedback**

Add `onContextMenu` to the article box. Capture `currentSrc || src`, including overlay-to-image mapping. Close the menu before awaiting an action. Show exactly:

- success copy: `图片已复制`
- success save: `图片已保存`
- copy failure: `图片复制失败：${message}`
- save failure: `图片保存失败：${message}`

Do not Toast on Save As cancellation. Clear menu state in the existing content rerender effect and on preview scroll/blur/outside/Escape.

- [ ] **Step 5: Add isolated styles**

Add `.vs-preview-image-menu` and item/focus/hover rules using `--bg`, `--border`, `--text`, and `--accent-subtle`; keep the menu outside `#article` so article theme CSS cannot restyle it.

- [ ] **Step 6: Run focused tests**

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/Preview/Preview.tsx src/components/Preview/PreviewImageContextMenu.tsx src/components/Preview/previewImageContextMenu.test.tsx src/styles/globals.css src/styles/scrollbarStyle.test.ts
git commit -m "feat: add preview image context menu"
```

### Task 5: Full regression and desktop verification

**Files:**
- Modify if needed: only files already in this plan
- Update: `docs/PROGRESS.md` only if this repository's current convention requires feature-log entries

- [ ] **Step 1: Run all frontend tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: TypeScript and Vite build succeed with no new warnings/errors.

- [ ] **Step 3: Run all Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests PASS.

- [ ] **Step 4: Run formatting checks**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
Expected: PASS. If it fails, run `cargo fmt --manifest-path src-tauri/Cargo.toml`, then repeat tests.

- [ ] **Step 5: Perform Windows Tauri smoke test where automation permits**

Launch `npm run tauri -- dev`, right-click representative PNG/JPEG/GIF/SVG/WeChat images, verify copy can paste into Paint or a chat input, and verify Save As produces openable files. If GUI automation cannot access the native clipboard/dialog reliably, report this manual-only check explicitly rather than claiming it passed.

- [ ] **Step 6: Inspect final diff and status**

Run: `git diff HEAD~3 --check` and `git status --short`.
Expected: no whitespace errors; only intended changes remain.

- [ ] **Step 7: Commit any final test/document adjustments**

```powershell
git add src/components/Preview src/utils/imageProxy.ts src/utils/imageProxy.test.ts src/utils/previewImageActions.ts src/utils/previewImageActions.test.ts src/styles/globals.css src/styles/scrollbarStyle.test.ts src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/preview_image.rs docs/PROGRESS.md
git commit -m "test: verify preview image actions"
```



