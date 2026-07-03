import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const cssRule = (css: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
};

const cssRuleLast = (css: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = Array.from(css.matchAll(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, "g")));
  assert.ok(matches.length > 0, `missing CSS rule for ${selector}`);
  return matches[matches.length - 1][1];
};

test("主编辑和预览滚动条默认隐藏，hover 后显现", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

  assert.match(css, /\.cm-scroller/);
  assert.match(css, /\.cm-editor\s*\{/);
  assert.match(css, /\.cm-editor\.cm-focused\s*\{/);
  assert.match(css, /\.editor-preview-scrollbar/);
  assert.match(css, /height:\s*100%/);
  assert.match(css, /overflow:\s*auto/);
  assert.match(css, /outline:\s*none/);
  assert.match(css, /scrollbar-color:\s*transparent transparent/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /::-webkit-scrollbar-thumb/);
  assert.match(css, /::-webkit-scrollbar-thumb:active/);
});

test("CodeMirror 接收 Tauri CSP nonce，避免打包版动态样式被拦截", async () => {
  const source = await readFile(new URL("../components/Editor/MarkdownEditor.tsx", import.meta.url), "utf8");

  assert.match(source, /EditorView\.cspNonce\.of/);
  assert.match(source, /getCodeMirrorCspNonce/);
});

test("CodeMirror 搜索替换面板使用不挤压正文的浮层工具条", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

  assert.match(css, /\.cm-editor\s+\.cm-panel\.cm-search/);
  assert.match(css, /position:\s*absolute/);
  assert.match(css, /left:\s*50%/);
  assert.match(css, /transform:\s*translateX\(-50%\)/);
  assert.match(css, /z-index:\s*20/);
  assert.match(css, /max-width:\s*calc\(100% - 24px\)/);
  assert.match(css, /rgba\(248,\s*250,\s*252,\s*0\.06\)/);
  assert.match(css, /rgba\(248,\s*250,\s*252,\s*0\.12\)/);
  assert.match(css, /backdrop-filter:\s*blur\(6px\)\s*saturate\(1\.16\)/);
  assert.match(css, /border:\s*1px solid var\(--border\)/);
  assert.match(css, /border-radius:\s*var\(--radius-lg\)/);
  assert.match(css, /inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.40\)/);
  assert.match(css, /grid-template-columns:\s*auto\s*auto\s*auto\s*auto\s*auto\s*auto\s*minmax\(16px,\s*1fr\)\s*88px\s*28px/);
  assert.match(css, /justify-items:\s*start/);
  assert.match(css, /align-items:\s*center/);
  assert.match(css, /\.cm-search\s+input\.cm-textfield/);
  assert.match(css, /\.cm-search\s+button\.cm-button/);
  assert.match(cssRule(css, ".cm-editor .cm-search button.cm-button"), /font-size:\s*13px/);
  assert.match(css, /\.cm-search\s+button\[name="next"\]/);
  assert.match(css, /grid-column:\s*2/);
  assert.match(css, /\.cm-search\s+button\[name="next"\]::before/);
  assert.match(css, /content:\s*"↓"/);
  assert.match(css, /\.cm-search\s+button\[name="prev"\]/);
  assert.match(css, /\.cm-search\s+button\[name="prev"\]::before/);
  assert.match(css, /content:\s*"↑"/);
  assert.match(css, /\.cm-search\s+button\[name="replace"\]/);
  assert.match(css, /\.cm-search\s+button\[name="replaceAll"\]/);
  assert.match(css, /grid-column:\s*8/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"next\"]"), /grid-column:\s*1/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"next\"]"), /grid-row:\s*2/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"prev\"]"), /grid-column:\s*2/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"prev\"]"), /grid-row:\s*2/);
  assert.doesNotMatch(cssRule(css, ".cm-editor .cm-search button[name=\"prev\"]"), /display:\s*none/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /grid-column:\s*3/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /grid-row:\s*2/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /height:\s*28px/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /align-self:\s*center/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /font-size:\s*13px/);
  assert.doesNotMatch(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /span\s*2|height:\s*100%/);
  assert.match(css, /\.cm-search\s+button\[name="close"\]/);
  assert.match(css, /grid-row:\s*1/);
  assert.doesNotMatch(css, /button\[name="close"\][\s\S]*?grid-row:\s*1\s*\/\s*span\s*2/);
  assert.doesNotMatch(css, /button\[name="close"\][\s\S]*?align-self:\s*stretch/);
  assert.match(css, /\.cm-search\s+label/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /align-self:\s*center/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /font-family:\s*inherit/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /font-size:\s*13px/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /font:\s*inherit/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /box-sizing:\s*border-box/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /justify-content:\s*flex-start/);
  assert.match(cssRuleLast(css, ".cm-editor .cm-panel.cm-search label"), /justify-content:\s*flex-start\s*!important/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /line-height:\s*28px/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /height:\s*28px/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /border:\s*1px solid var\(--border-strong\)/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /border-radius:\s*var\(--radius\)/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /background:\s*rgba\(255,\s*255,\s*255,\s*0\.5\)/);
  assert.match(cssRule(css, ".cm-editor .cm-search label"), /padding:\s*0 9px/);
  assert.match(css, /\.cm-editor\s+\.cm-panel\.cm-search\s+label/);
  assert.match(cssRule(css, ".cm-editor .cm-panel.cm-search label"), /font-size:\s*13px/);
  assert.match(cssRule(css, ".cm-editor .cm-panel.cm-search label"), /margin:\s*0/);
  assert.match(cssRule(css, ".cm-editor .cm-panel.cm-search label"), /height:\s*28px/);
  assert.match(cssRuleLast(css, ".cm-editor .cm-panel.cm-search label"), /font-size:\s*13px\s*!important/);
  assert.match(cssRuleLast(css, ".cm-editor .cm-panel.cm-search label"), /margin:\s*0\s*!important/);
  assert.match(cssRuleLast(css, ".cm-editor .cm-panel.cm-search label"), /line-height:\s*28px\s*!important/);
  assert.match(cssRule(css, ".cm-editor .cm-search label:has(input[name=\"case\"])"), /grid-column:\s*4/);
  assert.match(cssRule(css, ".cm-editor .cm-search label:has(input[name=\"case\"])"), /grid-row:\s*2/);
  assert.match(cssRule(css, ".cm-editor .cm-search label:has(input[name=\"re\"])"), /grid-column:\s*5/);
  assert.match(cssRule(css, ".cm-editor .cm-search label:has(input[name=\"re\"])"), /grid-row:\s*2/);
  assert.match(cssRule(css, ".cm-editor .cm-search label:has(input[name=\"word\"])"), /grid-column:\s*6/);
  assert.match(cssRule(css, ".cm-editor .cm-search label:has(input[name=\"word\"])"), /grid-row:\s*2/);
  assert.match(css, /\.cm-search\s+input\[type="checkbox"\]/);
  assert.match(cssRule(css, ".cm-editor .cm-search input[type=\"checkbox\"]"), /display:\s*block/);
  assert.match(cssRule(css, ".cm-editor .cm-search input[type=\"checkbox\"]"), /appearance:\s*none/);
  assert.match(cssRule(css, ".cm-editor .cm-search input[type=\"checkbox\"]"), /flex:\s*0\s+0\s+16px/);
  assert.match(cssRule(css, ".cm-editor .cm-search input[type=\"checkbox\"]"), /margin:\s*0/);
  assert.match(cssRule(css, ".cm-editor .cm-search input[type=\"checkbox\"]"), /align-self:\s*center/);
  assert.match(cssRule(css, ".cm-editor .cm-search input[type=\"checkbox\"]"), /transform:\s*translateY\(0\)/);
  assert.match(cssRule(css, ".cm-editor .cm-panel.cm-search input[type=\"checkbox\"]"), /flex:\s*0\s+0\s+16px/);
  assert.match(cssRule(css, ".cm-editor .cm-panel.cm-search input[type=\"checkbox\"]"), /margin:\s*0/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"close\"]"), /position:\s*static/);
  assert.match(css, /\.cm-search\s+input\[type="checkbox"\]:checked::after/);
  assert.match(css, /\.cm-searchMatch-selected/);
  // 拖拽手柄、更高透明度、中间行左对齐
  assert.match(css, /\.cm-search\s+\.od-search-drag-handle/);
  assert.match(css, /cursor:\s*grab/);
  assert.match(css, /padding:\s*24px 10px 10px/);
  assert.match(css, /height:\s*24px/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /text-align:\s*left/);
  assert.match(css, /\.od-search-drag-handle \.od-grip[\s\S]*?opacity:\s*0\.6/);
  assert.match(cssRule(css, ".cm-editor .cm-search button[name=\"select\"]"), /justify-content:\s*flex-start/);
});

test("预览滚动容器提供滚动条样式挂点", async () => {
  const source = await readFile(new URL("../components/Preview/Preview.tsx", import.meta.url), "utf8");

  assert.match(source, /className="editor-preview-scrollbar"/);
});

test("图片缩放手柄使用低遮挡角标、透明热区和拖拽反馈", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
  const source = await readFile(new URL("../components/Preview/Preview.tsx", import.meta.url), "utf8");

  assert.match(source, /resizingHandle/);
  assert.match(source, /vs-image-resize-size-badge/);
  assert.match(source, /widthPercent/);
  assert.match(source, /is-resizing/);

  assert.match(cssRule(css, ".vs-image-resize-overlay"), /border:\s*1px solid rgba\(94,\s*106,\s*210,\s*0\.78\)/);
  assert.match(cssRule(css, ".vs-image-resize-overlay"), /box-shadow:[\s\S]*0 0 0 5px rgba\(94,\s*106,\s*210,\s*0\.08\)/);
  assert.match(cssRule(css, ".vs-image-resize-overlay.is-resizing"), /border-color:\s*var\(--accent-hover\)/);
  assert.match(css, /\.vs-image-resize-size-badge/);
  assert.match(cssRule(css, ".vs-image-resize-handle"), /width:\s*32px/);
  assert.match(cssRule(css, ".vs-image-resize-handle"), /height:\s*32px/);
  assert.match(cssRule(css, ".vs-image-resize-handle"), /background:\s*transparent/);
  assert.match(css, /\.vs-image-resize-handle::before/);
  assert.match(cssRule(css, ".vs-image-resize-handle::before"), /width:\s*14px/);
  assert.match(cssRule(css, ".vs-image-resize-handle-nw::before"), /border-top-width:\s*2px/);
  assert.match(cssRule(css, ".vs-image-resize-handle-nw::before"), /border-left-width:\s*2px/);
  assert.match(cssRule(css, ".vs-image-resize-handle-se::before"), /border-right-width:\s*2px/);
  assert.match(cssRule(css, ".vs-image-resize-handle-se::before"), /border-bottom-width:\s*2px/);
});

test("MathJax 行间公式有静态居中样式兜底", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

  assert.match(css, /#article\s+mjx-container\[jax="SVG"\]\[display="true"\]/);
  assert.match(css, /text-align:\s*center/);
  assert.match(css, /margin:\s*1em 0/);
});
