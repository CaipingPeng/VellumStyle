import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";

const read = (relativePath: string) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("文档树、大纲和编辑器使用统一面板表面与 42px 头部基线", async () => {
  const [docTree, outline, editorPanel] = await Promise.all([
    read("../DocTree/DocTree.tsx"),
    read("../Outline/OutlineNav.tsx"),
    read("./EditorWorkspacePanel.tsx"),
  ]);

  assert.match(docTree, /workspace-panel workspace-documents-panel/);
  assert.match(docTree, /h-\[42px\]/);
  assert.match(outline, /workspace-panel workspace-outline-panel/);
  assert.match(outline, /h-\[42px\]/);
  assert.match(editorPanel, /workspace-editor-toolbar[^"\n]*h-\[42px\]/);
});

test("语法工具栏使用 18px 语义分隔线", async () => {
  const source = await read("../Toolbar/SyntaxToolbar.tsx");
  assert.match(source, /aria-hidden="true"/);
  assert.match(source, /h-\[18px\] w-px flex-none bg-border/);
});

test("发布和复制到微信保持并列实心主按钮", async () => {
  const [publish, copy, mainToolbar] = await Promise.all([
    read("../Publish/PublishButton.tsx"),
    read("../Copy/CopyButton.tsx"),
    read("../Toolbar/MainToolbar.tsx"),
  ]);

  assert.match(publish, /variant="primary"/);
  assert.match(copy, /variant="primary"/);
  assert.ok(mainToolbar.indexOf("<PublishButton") < mainToolbar.indexOf("<CopyButton"));
  assert.equal((mainToolbar.match(/data-measure="(?:publish|copy)"[\s\S]*?<Button variant="primary"/g) ?? []).length, 2);
});

test("Markdown 编辑器明确关闭行号与折叠槽", async () => {
  const source = await read("../Editor/MarkdownEditor.tsx");
  assert.match(source, /basicSetup:\s*\{[\s\S]*?lineNumbers:\s*false/);
  assert.match(source, /foldGutter:\s*false/);
  assert.doesNotMatch(source, /\blineNumbers\s*\(\s*\)/);
});
