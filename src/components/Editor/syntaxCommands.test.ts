import assert from "node:assert/strict";
import {test} from "node:test";
import {markdown, markdownLanguage} from "@codemirror/lang-markdown";
import {EditorState} from "@codemirror/state";
import {createSyntaxActionTransaction} from "./syntaxCommands.ts";
import type {SyntaxAction} from "./syntaxActions.ts";

function applyAction(doc: string, action: SyntaxAction, anchor: number, head = anchor) {
  const state = EditorState.create({
    doc,
    selection: {anchor, head},
    extensions: [markdown({base: markdownLanguage})],
  });
  const spec = createSyntaxActionTransaction(state, action);
  assert.ok(spec, `missing transaction for ${action}`);
  const next = state.update(spec).state;
  return {
    doc: next.doc.toString(),
    anchor: next.selection.main.anchor,
    head: next.selection.main.head,
  };
}

test("加粗选区后再次执行取消并保留选区", () => {
  const added = applyAction("文字", "bold", 0, 2);
  assert.deepEqual(added, {doc: "**文字**", anchor: 2, head: 4});
  const removed = applyAction(added.doc, "bold", added.anchor, added.head);
  assert.deepEqual(removed, {doc: "文字", anchor: 0, head: 2});
});

test("光标位于格式内部时取消对应外层格式", () => {
  assert.equal(applyAction("**文字**", "bold", 3).doc, "文字");
  assert.equal(applyAction("*文字*", "italic", 2).doc, "文字");
  assert.equal(applyAction("~~文字~~", "strikethrough", 3).doc, "文字");
  assert.equal(applyAction("`文字`", "inlineCode", 2).doc, "文字");
});

test("嵌套格式只取消目标节点", () => {
  const doc = "**加粗 *斜体* 文字**";
  assert.equal(applyAction(doc, "italic", 8).doc, "**加粗 斜体 文字**");
  assert.equal(applyAction(doc, "bold", 8).doc, "加粗 *斜体* 文字");
});

test("下划线和多反引号标记按语法树边界取消", () => {
  assert.equal(applyAction("__加粗__", "bold", 3).doc, "加粗");
  assert.equal(applyAction("_斜体_", "italic", 2).doc, "斜体");
  assert.equal(applyAction("``a`b``", "inlineCode", 4).doc, "a`b");
});

test("不完整语法不执行破坏性取消", () => {
  assert.deepEqual(applyAction("**未闭合", "bold", 3), {
    doc: "**未**加粗文本**闭合",
    anchor: 5,
    head: 9,
  });
});

test("反向选区添加和取消时保持方向", () => {
  const added = applyAction("文字", "bold", 2, 0);
  assert.deepEqual(added, {doc: "**文字**", anchor: 4, head: 2});
  const removed = applyAction(added.doc, "bold", added.anchor, added.head);
  assert.deepEqual(removed, {doc: "文字", anchor: 2, head: 0});
});

test("跨两个独立加粗节点时包裹整体而非猜测批量取消", () => {
  assert.equal(applyAction("**甲**和**乙**", "bold", 2, 10).doc, "****甲**和**乙****");
});


test("标题同级取消、跨级转换且光标保持在正文位置", () => {
  assert.deepEqual(applyAction("正文", "heading2", 1), {doc: "## 正文", anchor: 4, head: 4});
  assert.deepEqual(applyAction("## 正文", "heading2", 4), {doc: "正文", anchor: 1, head: 1});
  assert.equal(applyAction("# 正文", "heading2", 3).doc, "## 正文");
});

test("多行列表立即再次执行可以取消并保持反向选区", () => {
  const added = applyAction("甲\n乙", "unorderedList", 3, 0);
  assert.equal(added.doc, "- 甲\n- 乙");
  assert.ok(added.anchor > added.head);
  const removed = applyAction(added.doc, "unorderedList", added.anchor, added.head);
  assert.equal(removed.doc, "甲\n乙");
  assert.ok(removed.anchor > removed.head);
});

test("有序无序列表直接互转", () => {
  assert.equal(applyAction("- 内容", "orderedList", 3).doc, "1. 内容");
  assert.equal(applyAction("1. 内容", "unorderedList", 4).doc, "- 内容");
});

test("多层引用每次只取消一层", () => {
  assert.equal(applyAction("> > 内容", "blockquote", 5).doc, "> 内容");
});
