import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const appSource = readFile(new URL("./App.tsx", import.meta.url), "utf8");

test("全局顶栏只保留抽屉开关，语法工具栏归属编辑器", async () => {
  const source = await appSource;
  const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
  assert.doesNotMatch(header, /<SyntaxToolbar/);
  assert.match(header, /aria-pressed=\{sidebarOpen\}/);
  assert.match(header, /aria-pressed=\{outlineOpen\}/);
  assert.match(source, /<EditorWorkspacePanel/);
});

test("双抽屉可独立渲染且顺序稳定地位于核心分栏之前", async () => {
  const source = await appSource;
  const documents = source.indexOf('key="documents"');
  const docTree = source.indexOf("<DocTree />", documents);
  const outline = source.indexOf('key="outline"');
  const outlineNav = source.indexOf("<OutlineNav", outline);
  const split = source.indexOf("<WorkspaceSplit");
  assert.ok(documents >= 0 && docTree > documents);
  assert.ok(outline > docTree && outlineNav > outline);
  assert.ok(split > outlineNav);
  assert.ok((source.match(/<AnimatePresence initial=\{false\}>/g) ?? []).length >= 2);
  assert.doesNotMatch(source, /sidebarOpen\s*\?[^:]+:\s*<OutlineNav/s);
});

test("预览无标题栏且模式切换器和浮动样式面板保持原位", async () => {
  const source = await appSource;
  const footer = source.slice(source.indexOf("<footer"), source.indexOf("</footer>"));
  assert.match(footer, /<PreviewModeToggle variant="status"/);
  assert.match(source, /data-workspace-panel="preview"/);
  assert.doesNotMatch(source, /data-preview-toolbar/);
  assert.ok(source.indexOf("<StylePanel />") > source.indexOf("<Preview"));
  assert.match(source, /<StylePanel \/>[\s\S]*<\/div>/);
});
