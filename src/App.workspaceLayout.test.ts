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

test("状态栏保留完整信息并只用细竖线分隔相邻项目", async () => {
  const source = await appSource;
  const footer = source.slice(source.indexOf("<footer"), source.indexOf("</footer>"));
  for (const label of ["文档 ", "行数 ", "字数 ", "主题 ", "代码 "]) {
    assert.match(footer, new RegExp(label));
  }
  assert.match(footer, /formatSaveStatus/);
  assert.match(footer, /formatCloudSyncStatus/);
  assert.match(footer, /<PreviewModeToggle variant="status"/);
  assert.equal((footer.match(/<StatusDivider \/>/g) ?? []).length, 7);
});

test("预览面板提供克制的活动边框触发点", async () => {
  const source = await appSource;
  const preview = source.slice(source.indexOf('aria-label="文章预览"'), source.indexOf("</section>", source.indexOf('aria-label="文章预览"')));
  assert.match(preview, /workspace-preview-panel/);
  assert.match(preview, /tabIndex=\{-1\}/);
  assert.match(preview, /onPointerDown=/);
});
