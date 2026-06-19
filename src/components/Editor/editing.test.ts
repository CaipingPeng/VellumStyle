import {test} from "node:test";
import assert from "node:assert/strict";
import {
  wrapSelection,
  insertLink,
  prefixLines,
  insertCodeBlock,
  shouldReplaceEditorDoc,
  shouldQueueExternalValueDuringComposition,
  shouldHandleDirectTextInput,
  shouldRecoverCompositionTextInput,
  getFallbackChineseSymbolFromKey,
  getSelectionAfterRecoveredTextInput,
} from "./editing.ts";

test("wrap 有选区：包裹并选中原文字", () => {
  const doc = "你好世界";
  const r = wrapSelection(doc, 2, 4, "**", "**", "加粗文本");
  assert.equal(r.insert, "**世界**");
  assert.equal(r.selFrom, 4);
  assert.equal(r.selTo, 6);
});

test("wrap 无选区：插入占位符并选中占位符", () => {
  const doc = "abc";
  const r = wrapSelection(doc, 3, 3, "**", "**", "加粗文本");
  assert.equal(r.insert, "**加粗文本**");
  assert.equal(r.selFrom, 5);
  assert.equal(r.selTo, 5 + "加粗文本".length);
});

test("link 有选区：选区当链接文字，选中 url 占位", () => {
  const doc = "看这里";
  const r = insertLink(doc, 0, 3);
  assert.equal(r.insert, "[看这里](链接地址)");
  const urlStart = "[看这里](".length;
  assert.equal(r.selFrom, urlStart);
  assert.equal(r.selTo, urlStart + "链接地址".length);
});

test("link 无选区：选中链接文字占位", () => {
  const doc = "";
  const r = insertLink(doc, 0, 0);
  assert.equal(r.insert, "[链接文字](链接地址)");
  assert.equal(r.selFrom, 1);
  assert.equal(r.selTo, 1 + "链接文字".length);
});

test("prefix 单行：行首加前缀，光标折叠到块末尾（不选中语法符号）", () => {
  const doc = "标题";
  const r = prefixLines(doc, 0, 0, "## ");
  assert.equal(r.replaceFrom, 0);
  assert.equal(r.replaceTo, 2);
  assert.equal(r.insert, "## 标题");
  // 光标落在块末尾，不选中——这样可继续打字而不覆盖语法符号
  const end = "## 标题".length;
  assert.equal(r.selFrom, end);
  assert.equal(r.selTo, end);
});

test("prefix 空行加前缀：光标落在前缀之后可直接输入", () => {
  const doc = "";
  const r = prefixLines(doc, 0, 0, "## ");
  assert.equal(r.insert, "## ");
  assert.equal(r.selFrom, "## ".length);
  assert.equal(r.selTo, "## ".length);
});

test("prefix 多行：每行逐行加前缀，光标折叠到块末尾", () => {
  const doc = "甲\n乙\n丙";
  const r = prefixLines(doc, 0, 3, "- ");
  assert.equal(r.replaceFrom, 0);
  assert.equal(r.replaceTo, 3);
  assert.equal(r.insert, "- 甲\n- 乙");
  const end = r.replaceFrom + r.insert.length;
  assert.equal(r.selFrom, end);
  assert.equal(r.selTo, end);
});

test("codeBlock 无选区：插入围栏，光标落在中间空行", () => {
  const doc = "abc";
  const r = insertCodeBlock(doc, 3, 3);
  assert.equal(r.insert, "\n```\n\n```\n");
  // 光标落在第二个换行之后（中间空行起点）：from + len("\n```\n")
  const mid = 3 + "\n```\n".length;
  assert.equal(r.selFrom, mid);
  assert.equal(r.selTo, mid);
});

test("codeBlock 有选区：选区文字进围栏，选中该文字", () => {
  const doc = "代码";
  const r = insertCodeBlock(doc, 0, 2);
  assert.equal(r.insert, "\n```\n代码\n```\n");
  const start = "\n```\n".length;
  assert.equal(r.selFrom, start);
  assert.equal(r.selTo, start + "代码".length);
});

test("编辑器组合输入期间不使用外部 value 覆盖当前文档", () => {
  assert.equal(
    shouldReplaceEditorDoc({
      currentDoc: "你好，",
      incomingValue: "你好",
      composing: true,
    }),
    false,
  );
});

test("编辑器组合输入刚结束时不使用旧 value 覆盖中文标点", () => {
  assert.equal(
    shouldReplaceEditorDoc({
      currentDoc: "你好，",
      incomingValue: "你好",
      composing: false,
      compositionSettling: true,
    } as Parameters<typeof shouldReplaceEditorDoc>[0]),
    false,
  );
});

test("编辑器仅在外部文档内容不同且未组合输入时同步", () => {
  assert.equal(
    shouldReplaceEditorDoc({
      currentDoc: "旧文档",
      incomingValue: "新文档",
      composing: false,
    }),
    true,
  );
  assert.equal(
    shouldReplaceEditorDoc({
      currentDoc: "同一文档",
      incomingValue: "同一文档",
      composing: false,
    }),
    false,
  );
});

test("编辑器不把旧外部值回写覆盖刚提交的中文标点", () => {
  assert.equal(
    shouldReplaceEditorDoc({
      currentDoc: "你好，",
      incomingValue: "你好",
      composing: false,
      externalUpdate: false,
      lastEmittedValue: "你好，",
    } as Parameters<typeof shouldReplaceEditorDoc>[0]),
    false,
  );
});

test("编辑器忽略父级落后回声，避免覆盖后续中文输入", () => {
  assert.equal(
    shouldReplaceEditorDoc({
      currentDoc: "你好，世界",
      incomingValue: "你好，",
      composing: false,
      externalUpdate: true,
      lastEmittedValue: "你好，",
    } as Parameters<typeof shouldReplaceEditorDoc>[0]),
    false,
  );
});

test("编辑器收到真正外部文档变化时仍替换内容", () => {
  assert.equal(
    shouldReplaceEditorDoc({
      currentDoc: "当前文档",
      incomingValue: "新打开的文档",
      composing: false,
      externalUpdate: true,
      lastEmittedValue: "当前文档",
    } as Parameters<typeof shouldReplaceEditorDoc>[0]),
    true,
  );
});

test("编辑器组合输入期间不把组合开始前的旧 value 排队为外部更新", () => {
  assert.equal(
    shouldQueueExternalValueDuringComposition({
      incomingValue: "你好",
      currentDoc: "你好，",
      compositionStartValue: "你好",
      lastEmittedValue: "你好，",
    }),
    false,
  );
});

test("编辑器组合输入期间保留真正的外部文档更新", () => {
  assert.equal(
    shouldQueueExternalValueDuringComposition({
      incomingValue: "新打开的文档",
      currentDoc: "你好，",
      compositionStartValue: "你好",
      lastEmittedValue: "你好，",
    }),
    true,
  );
});

test("编辑器直接接管单个标点和符号输入，避开输入法首键丢失", () => {
  assert.equal(shouldHandleDirectTextInput({data: "，", inputType: "insertText"}), true);
  assert.equal(shouldHandleDirectTextInput({data: ",", inputType: "insertText"}), true);
  assert.equal(shouldHandleDirectTextInput({data: "￥", inputType: "insertText"}), true);
  assert.equal(shouldHandleDirectTextInput({data: "a", inputType: "insertText"}), false);
  assert.equal(shouldHandleDirectTextInput({data: "中", inputType: "insertText"}), false);
  assert.equal(shouldHandleDirectTextInput({data: " ", inputType: "insertText"}), false);
  assert.equal(shouldHandleDirectTextInput({data: "，。", inputType: "insertText"}), false);
  assert.equal(shouldHandleDirectTextInput({data: "，", inputType: "insertCompositionText"}), true);
  assert.equal(shouldHandleDirectTextInput({data: "中", inputType: "insertCompositionText"}), false);
});

test("编辑器在组合结束时恢复未落盘的单个标点和符号", () => {
  assert.equal(shouldRecoverCompositionTextInput({data: "，", startDoc: "你好", currentDoc: "你好"}), true);
  assert.equal(shouldRecoverCompositionTextInput({data: "。", startDoc: "你好", currentDoc: "你好"}), true);
  assert.equal(shouldRecoverCompositionTextInput({data: "￥", startDoc: "你好", currentDoc: "你好"}), true);
  assert.equal(shouldRecoverCompositionTextInput({data: "中", startDoc: "你好", currentDoc: "你好"}), false);
  assert.equal(shouldRecoverCompositionTextInput({data: "", startDoc: "你好", currentDoc: "你好"}), false);
  assert.equal(shouldRecoverCompositionTextInput({data: "，。", startDoc: "你好", currentDoc: "你好"}), false);
  assert.equal(shouldRecoverCompositionTextInput({data: "，", startDoc: "你好", currentDoc: "你好，"}), false);
});

test("编辑器从被输入法吞掉的符号 keyup 中恢复中文标点", () => {
  assert.equal(getFallbackChineseSymbolFromKey({key: ",", ctrlKey: false, altKey: false, metaKey: false}), "，");
  assert.equal(getFallbackChineseSymbolFromKey({key: ".", ctrlKey: false, altKey: false, metaKey: false}), "。");
  assert.equal(getFallbackChineseSymbolFromKey({key: "?", ctrlKey: false, altKey: false, metaKey: false}), "？");
  assert.equal(getFallbackChineseSymbolFromKey({key: "$", ctrlKey: false, altKey: false, metaKey: false}), "￥");
  assert.equal(getFallbackChineseSymbolFromKey({key: "a", ctrlKey: false, altKey: false, metaKey: false}), null);
  assert.equal(getFallbackChineseSymbolFromKey({key: ",", ctrlKey: true, altKey: false, metaKey: false}), null);
});

test("编辑器恢复符号输入后把光标放到新字符后面", () => {
  assert.equal(getSelectionAfterRecoveredTextInput({from: 2, text: "，"}), 3);
  assert.equal(getSelectionAfterRecoveredTextInput({from: 2, text: "￥"}), 3);
  assert.equal(getSelectionAfterRecoveredTextInput({from: 2, text: "🙂"}), 4);
});
