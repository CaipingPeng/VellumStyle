# 编辑器语法快捷键与可逆格式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 Markdown 语法按钮补充 Typora 兼容的跨平台快捷键，并让按钮与快捷键共享支持上下文感知取消的统一语法命令。

**Architecture:** 新增 `syntaxActions.ts` 作为动作与平台快捷键注册表，新增 `syntaxCommands.ts` 作为唯一 CodeMirror 命令执行层；保留 `editing.ts` 负责纯文本变换。`MarkdownEditor` 注册高优先级 keymap 并通过句柄暴露 `runSyntaxAction`，`SyntaxToolbar` 只提交动作标识，因此点击和键盘始终走同一 transaction。

**Tech Stack:** React 18、TypeScript、CodeMirror 6（`@codemirror/state`、`@codemirror/view`、`@codemirror/language`、`@codemirror/lang-markdown`）、Node test runner、tsx、jsdom。

**Design spec:** `docs/superpowers/specs/2026-07-17-syntax-shortcuts-toggle-design.md`

---

## File map

- Create: `src/components/Editor/syntaxActions.ts`
  - `SyntaxAction` 联合类型、完整动作列表、Typora 平台键位、CodeMirror keymap 工厂。
- Create: `src/components/Editor/syntaxActions.test.ts`
  - 动作覆盖、平台键位和 keymap 分派测试。
- Create: `src/components/Editor/syntaxCommands.ts`
  - 唯一语法命令入口；语法树上下文判断；transaction 构造；行内、行级、代码块及插入型动作分派。
- Create: `src/components/Editor/syntaxCommands.test.ts`
  - 使用真实 CodeMirror Markdown `EditorState` 验证命令结果、选区和上下文切换。
- Modify: `src/components/Editor/editing.ts`
  - 新增行级语法纯变换和通用文本 change 类型；保留现有插入辅助函数。
- Modify: `src/components/Editor/editing.test.ts`
  - 标题、列表、引用的添加、取消、转换和多行边界测试。
- Modify: `src/components/Editor/MarkdownEditor.tsx`
  - 注册语法 keymap；句柄新增 `runSyntaxAction`；移除工具栏不再需要的旧句柄方法。
- Create: `src/components/Editor/MarkdownEditor.syntaxActions.test.tsx`
  - 验证句柄和键盘都能通过统一命令修改编辑器，且其他输入框不受影响。
- Modify: `src/components/Toolbar/SyntaxToolbar.tsx`
  - 所有语法按钮改为提交 `SyntaxAction`。
- Create: `src/components/Toolbar/SyntaxToolbar.test.tsx`
  - 验证按钮和 H1–H4 菜单映射到正确动作。

---

### Task 1: 建立语法动作与 Typora 快捷键注册表

**Files:**
- Create: `src/components/Editor/syntaxActions.ts`
- Create: `src/components/Editor/syntaxActions.test.ts`

- [ ] **Step 1: 写动作覆盖和精确键位的失败测试**

```ts
// src/components/Editor/syntaxActions.test.ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {
  SYNTAX_ACTIONS,
  SYNTAX_SHORTCUTS,
  createSyntaxKeymap,
  type SyntaxAction,
} from "./syntaxActions.ts";

const expected = [
  ["bold", "Ctrl-b", "Ctrl-b", "Cmd-b"],
  ["italic", "Ctrl-i", "Ctrl-i", "Cmd-i"],
  ["strikethrough", "Shift-Alt-5", "Shift-Alt-5", "Ctrl-Shift-`"],
  ["inlineCode", "Ctrl-Shift-`", "Ctrl-Shift-`", "Cmd-Shift-`"],
  ["link", "Ctrl-k", "Ctrl-k", "Cmd-k"],
  ["heading1", "Ctrl-1", "Ctrl-1", "Cmd-1"],
  ["heading2", "Ctrl-2", "Ctrl-2", "Cmd-2"],
  ["heading3", "Ctrl-3", "Ctrl-3", "Cmd-3"],
  ["heading4", "Ctrl-4", "Ctrl-4", "Cmd-4"],
  ["orderedList", "Ctrl-Shift-[", "Ctrl-Shift-[", "Cmd-Alt-o"],
  ["unorderedList", "Ctrl-Shift-]", "Ctrl-Shift-]", "Cmd-Alt-u"],
  ["blockquote", "Ctrl-Shift-q", "Ctrl-Shift-q", "Cmd-Alt-q"],
  ["codeBlock", "Ctrl-Shift-k", "Ctrl-Shift-k", "Cmd-Alt-c"],
  ["horizontalRule", "Ctrl-Shift-h", "Ctrl-Shift-h", "Cmd-Shift-h"],
] as const;

test("语法动作完整覆盖现有十四项语法按钮", () => {
  assert.equal(SYNTAX_ACTIONS.length, 14);
  assert.deepEqual(SYNTAX_SHORTCUTS.map(({action}) => action), SYNTAX_ACTIONS);
});

test("快捷键除分割线外精确兼容 Typora 的平台映射", () => {
  assert.deepEqual(
    SYNTAX_SHORTCUTS.map(({action, win, linux, mac}) => [action, win, linux, mac]),
    expected,
  );
});

test("keymap 将按键分派到对应 SyntaxAction", () => {
  const calls: SyntaxAction[] = [];
  const bindings = createSyntaxKeymap((_view, action) => {
    calls.push(action);
    return true;
  });
  assert.equal(bindings.length, 14);
  assert.equal(bindings[0].run?.({} as never), true);
  assert.deepEqual(calls, ["bold"]);
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run:

```bash
npm test -- src/components/Editor/syntaxActions.test.ts
```

Expected: FAIL，提示无法导入 `./syntaxActions.ts`。

- [ ] **Step 3: 实现动作类型、键位常量和 keymap 工厂**

```ts
// src/components/Editor/syntaxActions.ts
import type {EditorView, KeyBinding} from "@codemirror/view";

export const SYNTAX_ACTIONS = [
  "bold", "italic", "strikethrough", "inlineCode", "link",
  "heading1", "heading2", "heading3", "heading4",
  "orderedList", "unorderedList", "blockquote", "codeBlock", "horizontalRule",
] as const;

export type SyntaxAction = (typeof SYNTAX_ACTIONS)[number];

export interface SyntaxShortcut {
  action: SyntaxAction;
  win: string;
  linux: string;
  mac: string;
}

export const SYNTAX_SHORTCUTS: readonly SyntaxShortcut[] = [
  {action: "bold", win: "Ctrl-b", linux: "Ctrl-b", mac: "Cmd-b"},
  {action: "italic", win: "Ctrl-i", linux: "Ctrl-i", mac: "Cmd-i"},
  {action: "strikethrough", win: "Shift-Alt-5", linux: "Shift-Alt-5", mac: "Ctrl-Shift-`"},
  {action: "inlineCode", win: "Ctrl-Shift-`", linux: "Ctrl-Shift-`", mac: "Cmd-Shift-`"},
  {action: "link", win: "Ctrl-k", linux: "Ctrl-k", mac: "Cmd-k"},
  {action: "heading1", win: "Ctrl-1", linux: "Ctrl-1", mac: "Cmd-1"},
  {action: "heading2", win: "Ctrl-2", linux: "Ctrl-2", mac: "Cmd-2"},
  {action: "heading3", win: "Ctrl-3", linux: "Ctrl-3", mac: "Cmd-3"},
  {action: "heading4", win: "Ctrl-4", linux: "Ctrl-4", mac: "Cmd-4"},
  {action: "orderedList", win: "Ctrl-Shift-[", linux: "Ctrl-Shift-[", mac: "Cmd-Alt-o"},
  {action: "unorderedList", win: "Ctrl-Shift-]", linux: "Ctrl-Shift-]", mac: "Cmd-Alt-u"},
  {action: "blockquote", win: "Ctrl-Shift-q", linux: "Ctrl-Shift-q", mac: "Cmd-Alt-q"},
  {action: "codeBlock", win: "Ctrl-Shift-k", linux: "Ctrl-Shift-k", mac: "Cmd-Alt-c"},
  {action: "horizontalRule", win: "Ctrl-Shift-h", linux: "Ctrl-Shift-h", mac: "Cmd-Shift-h"},
];

export type SyntaxActionRunner = (view: EditorView, action: SyntaxAction) => boolean;

export function createSyntaxKeymap(runAction: SyntaxActionRunner): KeyBinding[] {
  return SYNTAX_SHORTCUTS.map(({action, win, linux, mac}) => ({
    win,
    linux,
    mac,
    run: (view) => runAction(view, action),
  }));
}
```

- [ ] **Step 4: 运行目标测试并确认通过**

Run: `npm test -- src/components/Editor/syntaxActions.test.ts`

Expected: 3 tests PASS。

- [ ] **Step 5: 提交动作注册表**

```bash
git add src/components/Editor/syntaxActions.ts src/components/Editor/syntaxActions.test.ts
git commit -m "feat: add Typora syntax shortcut registry"
```

---

### Task 2: 实现标题、列表与引用的纯文本切换

**Files:**
- Modify: `src/components/Editor/editing.ts`
- Modify: `src/components/Editor/editing.test.ts`

- [ ] **Step 1: 为标题切换写失败测试**

在 `editing.test.ts` 导入 `toggleLineSyntax`，增加：

```ts
function applyTextChanges(doc: string, changes: readonly {from: number; to: number; insert: string}[]) {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to), doc);
}

test("标题支持添加、同级取消和跨级替换", () => {
  assert.equal(applyTextChanges("正文", toggleLineSyntax("正文", 0, 0, {type: "heading", level: 2})), "## 正文");
  assert.equal(applyTextChanges("## 正文", toggleLineSyntax("## 正文", 3, 3, {type: "heading", level: 2})), "正文");
  assert.equal(applyTextChanges("# 正文", toggleLineSyntax("# 正文", 2, 2, {type: "heading", level: 2})), "## 正文");
});
```

- [ ] **Step 2: 运行测试并确认 `toggleLineSyntax` 未定义**

Run: `npm test -- src/components/Editor/editing.test.ts`

Expected: FAIL，导出不存在。

- [ ] **Step 3: 在 `editing.ts` 增加行级 change 模型和标题实现**

```ts
export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export type LineSyntax =
  | {type: "heading"; level: 1 | 2 | 3 | 4}
  | {type: "orderedList"}
  | {type: "unorderedList"}
  | {type: "blockquote"};

interface SelectedLine {
  from: number;
  text: string;
}

const headingPattern = /^([\t ]{0,3})(#{1,6})(?:[\t ]+|$)/;
const listPattern = /^([\t ]*)(?:(?:[-+*])[\t ]+|(?:\d+)[.)][\t ]+)/;
const orderedListPattern = /^([\t ]*)\d+[.)][\t ]+/;
const unorderedListPattern = /^([\t ]*)[-+*][\t ]+/;
const quotePattern = /^([\t ]*)>[\t ]?/;
const indentPattern = /^[\t ]*/;

function selectedLines(doc: string, anchor: number, head: number): SelectedLine[] {
  const selectionFrom = Math.min(anchor, head);
  const selectionTo = Math.max(anchor, head);
  const inclusiveTo = selectionTo > selectionFrom && doc[selectionTo - 1] === "\n"
    ? selectionTo - 1
    : selectionTo;
  let lineFrom = doc.lastIndexOf("\n", Math.max(0, selectionFrom - 1)) + 1;
  const lines: SelectedLine[] = [];

  while (lineFrom <= inclusiveTo) {
    const newline = doc.indexOf("\n", lineFrom);
    const lineTo = newline === -1 ? doc.length : newline;
    lines.push({from: lineFrom, text: doc.slice(lineFrom, lineTo)});
    if (newline === -1) break;
    lineFrom = newline + 1;
  }
  return lines;
}

function prefixChange(line: SelectedLine, match: RegExpMatchArray, insert: string): TextChange {
  const indentLength = match[1].length;
  return {
    from: line.from + indentLength,
    to: line.from + match[0].length,
    insert,
  };
}

export function toggleLineSyntax(
  doc: string,
  anchor: number,
  head: number,
  syntax: LineSyntax,
): TextChange[] {
  const collapsed = anchor === head;
  const lines = selectedLines(doc, anchor, head);
  const targets = lines.filter((line) => collapsed || line.text.trim().length > 0);
  if (targets.length === 0) return [];

  if (syntax.type === "heading") {
    const targetMark = "#".repeat(syntax.level);
    const matches = targets.map((line) => line.text.match(headingPattern));
    const remove = matches.every((match) => match?.[2] === targetMark);
    return targets.map((line, index) => {
      const match = matches[index];
      if (match) return prefixChange(line, match, remove ? "" : `${targetMark} `);
      const indentLength = line.text.match(indentPattern)?.[0].length ?? 0;
      return {from: line.from + indentLength, to: line.from + indentLength, insert: `${targetMark} `};
    });
  }

  if (syntax.type === "blockquote") {
    const matches = targets.map((line) => line.text.match(quotePattern));
    const remove = matches.every(Boolean);
    return targets.map((line, index) => {
      const match = matches[index];
      if (remove && match) return prefixChange(line, match, "");
      const indentLength = line.text.match(indentPattern)?.[0].length ?? 0;
      return {from: line.from + indentLength, to: line.from + indentLength, insert: "> "};
    });
  }

  const targetPattern = syntax.type === "orderedList" ? orderedListPattern : unorderedListPattern;
  const targetPrefix = syntax.type === "orderedList" ? "1. " : "- ";
  const targetMatches = targets.map((line) => line.text.match(targetPattern));
  const remove = targetMatches.every(Boolean);
  return targets.map((line, index) => {
    const anyListMatch = line.text.match(listPattern);
    if (remove && targetMatches[index]) return prefixChange(line, targetMatches[index]!, "");
    if (anyListMatch) return prefixChange(line, anyListMatch, targetPrefix);
    const indentLength = line.text.match(indentPattern)?.[0].length ?? 0;
    return {from: line.from + indentLength, to: line.from + indentLength, insert: targetPrefix};
  });
}
```

这些 helper 保持为 `editing.ts` 的文件内私有函数，不引入 CodeMirror 类型。`toggleLineSyntax` 返回按行升序且互不重叠的 change；Task 4 再由 CodeMirror `ChangeSet` 统一映射选区。

- [ ] **Step 4: 运行测试，确认标题用例通过且旧编辑测试不回归**

Run: `npm test -- src/components/Editor/editing.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 为列表和引用写失败测试**

```ts
test("列表支持同类取消和有序无序互转并保留缩进", () => {
  assert.equal(applyTextChanges("  内容", toggleLineSyntax("  内容", 2, 2, {type: "unorderedList"})), "  - 内容");
  assert.equal(applyTextChanges("  - 内容", toggleLineSyntax("  - 内容", 4, 4, {type: "unorderedList"})), "  内容");
  assert.equal(applyTextChanges("- 内容", toggleLineSyntax("- 内容", 2, 2, {type: "orderedList"})), "1. 内容");
  assert.equal(applyTextChanges("1. 内容", toggleLineSyntax("1. 内容", 3, 3, {type: "unorderedList"})), "- 内容");
});

test("引用每次只增减一层", () => {
  assert.equal(applyTextChanges("内容", toggleLineSyntax("内容", 0, 0, {type: "blockquote"})), "> 内容");
  assert.equal(applyTextChanges("> 内容", toggleLineSyntax("> 内容", 2, 2, {type: "blockquote"})), "内容");
  assert.equal(applyTextChanges("> > 内容", toggleLineSyntax("> > 内容", 4, 4, {type: "blockquote"})), "> 内容");
});

test("多行列表忽略空行且选区结束在下一行行首时不处理下一行", () => {
  const doc = "甲\n\n乙";
  assert.equal(applyTextChanges(doc, toggleLineSyntax(doc, 0, 3, {type: "unorderedList"})), "- 甲\n\n乙");
});
```

- [ ] **Step 6: 运行测试并确认列表/引用分支失败**

Run: `npm test -- src/components/Editor/editing.test.ts`

Expected: 新增用例 FAIL。

- [ ] **Step 7: 完成列表与引用变换**

实现规则：

```ts
const listPattern = /^([\t ]*)(?:(?:[-+*])[\t ]+|(?:\d+)[.)][\t ]+)/;
const quotePattern = /^([\t ]*)>[\t ]?/;
```

- 同类列表所有非空行都匹配时移除标记。
- 否则把另一类列表标记替换为 `1. ` 或 `- `；普通行在缩进后插入。
- 引用所有非空行都有 `> ` 时每行移除一层，否则每个非空行添加一层。
- collapsed 空行插入对应标记；多行选区空行保持为空。

- [ ] **Step 8: 运行编辑纯逻辑测试**

Run: `npm test -- src/components/Editor/editing.test.ts`

Expected: 全部 PASS。

- [ ] **Step 9: 提交行级切换逻辑**

```bash
git add src/components/Editor/editing.ts src/components/Editor/editing.test.ts
git commit -m "feat: add reversible line syntax transforms"
```

---

### Task 3: 建立统一命令层并实现上下文感知的行内切换

**Files:**
- Create: `src/components/Editor/syntaxCommands.ts`
- Create: `src/components/Editor/syntaxCommands.test.ts`

- [ ] **Step 1: 写真实 Markdown 语法树上的行内切换失败测试**

```ts
// src/components/Editor/syntaxCommands.test.ts
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
```

- [ ] **Step 2: 运行测试并确认模块不存在**

Run: `npm test -- src/components/Editor/syntaxCommands.test.ts`

Expected: FAIL，无法导入 `syntaxCommands.ts`。

- [ ] **Step 3: 实现语法树节点定位与行内 transaction**

`syntaxCommands.ts` 的公开 API：

```ts
import {syntaxTree} from "@codemirror/language";
import {EditorSelection, type EditorState, type TransactionSpec} from "@codemirror/state";
import type {EditorView} from "@codemirror/view";
import {insertLink, wrapSelection} from "./editing.ts";
import type {SyntaxAction} from "./syntaxActions.ts";

export function createSyntaxActionTransaction(
  state: EditorState,
  action: SyntaxAction,
): TransactionSpec | null;

export function runSyntaxAction(view: EditorView, action: SyntaxAction): boolean {
  if (view.state.readOnly) return false;
  const spec = createSyntaxActionTransaction(view.state, action);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
```

行内配置：

```ts
const inlineActions = {
  bold: {node: "StrongEmphasis", mark: "EmphasisMark", before: "**", after: "**", placeholder: "加粗文本"},
  italic: {node: "Emphasis", mark: "EmphasisMark", before: "*", after: "*", placeholder: "斜体文本"},
  strikethrough: {node: "Strikethrough", mark: "StrikethroughMark", before: "~~", after: "~~", placeholder: "删除文本"},
  inlineCode: {node: "InlineCode", mark: "CodeMark", before: "`", after: "`", placeholder: "代码"},
} as const;
```

实现要点：

1. 从 `selection.main.from` 与 `to - 1`（collapsed 时用同一位置）向父节点上溯。
2. 只接受名称匹配且完整包含整个选区的最小节点。
3. 用节点的首尾 mark 子节点确定实际分隔符范围，从而兼容 `_斜体_`、`__加粗__` 和多反引号行内代码。
4. 取消时以两个有序 change 删除首尾 mark；把原 anchor/head 夹在内部内容范围后通过 `state.changes(changes).mapPos(...)` 映射，保留选区方向。
5. 找不到完整节点时复用 `wrapSelection` 添加语法；选区为反向时按原方向构造 `EditorSelection.single(anchor, head)`。
6. transaction 添加 `userEvent: "input.format"` 和 `scrollIntoView: true`。

- [ ] **Step 4: 运行行内命令测试**

Run: `npm test -- src/components/Editor/syntaxCommands.test.ts`

Expected: 当前 3 tests PASS。

- [ ] **Step 5: 增加畸形语法、反向选区和跨节点测试**

```ts
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
```

- [ ] **Step 6: 运行并修正边界映射直至通过**

Run: `npm test -- src/components/Editor/syntaxCommands.test.ts`

Expected: 全部 PASS。

- [ ] **Step 7: 提交统一命令层的行内部分**

```bash
git add src/components/Editor/syntaxCommands.ts src/components/Editor/syntaxCommands.test.ts
git commit -m "feat: add context-aware inline syntax toggles"
```

---

### Task 4: 把标题、列表和引用接入统一命令并保持选区

**Files:**
- Modify: `src/components/Editor/syntaxCommands.ts`
- Modify: `src/components/Editor/syntaxCommands.test.ts`

- [ ] **Step 1: 写行级命令与选区映射的失败测试**

```ts
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
```

- [ ] **Step 2: 运行并确认行级动作尚未实现**

Run: `npm test -- src/components/Editor/syntaxCommands.test.ts`

Expected: 新增 tests FAIL。

- [ ] **Step 3: 接入 `toggleLineSyntax` 并统一映射 selection**

在 `createSyntaxActionTransaction` 中映射：

```ts
const lineSyntaxByAction = {
  heading1: {type: "heading", level: 1},
  heading2: {type: "heading", level: 2},
  heading3: {type: "heading", level: 3},
  heading4: {type: "heading", level: 4},
  orderedList: {type: "orderedList"},
  unorderedList: {type: "unorderedList"},
  blockquote: {type: "blockquote"},
} as const;
```

- 把 `state.doc.toString()`、原 `anchor/head` 和目标类型交给 `toggleLineSyntax`。
- 用 `const changeSet = state.changes(changes)` 创建变化。
- collapsed selection 的位置使用 `mapPos(pos, 1)`，让插入在光标之前的前缀把光标推到正文等效位置。
- 非 collapsed selection 按 anchor/head 的方向分别选择关联值，确保涉及行不丢失并保持方向。
- 返回一个包含 `changes: changeSet`、显式 `EditorSelection`、`userEvent: "input.format"` 的 transaction spec。

- [ ] **Step 4: 运行目标测试**

Run: `npm test -- src/components/Editor/syntaxCommands.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 运行纯逻辑和命令两组测试**

Run:

```bash
npm test -- src/components/Editor/editing.test.ts src/components/Editor/syntaxCommands.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交行级命令接入**

```bash
git add src/components/Editor/syntaxCommands.ts src/components/Editor/syntaxCommands.test.ts
git commit -m "feat: connect reversible block syntax commands"
```

---

### Task 5: 实现围栏代码块上下文取消与插入型动作

**Files:**
- Modify: `src/components/Editor/syntaxCommands.ts`
- Modify: `src/components/Editor/syntaxCommands.test.ts`

- [ ] **Step 1: 写代码块上下文取消的失败测试**

```ts
test("代码块完整选中或光标位于正文时取消围栏", () => {
  const doc = "```js\nconst x = 1;\n```";
  assert.equal(applyAction(doc, "codeBlock", 0, doc.length).doc, "const x = 1;");
  assert.equal(applyAction(doc, "codeBlock", 10).doc, "const x = 1;");
});

test("光标位于语言标识和首尾围栏时也取消", () => {
  const doc = "```ts\n代码\n```";
  assert.equal(applyAction(doc, "codeBlock", 4).doc, "代码");
  assert.equal(applyAction(doc, "codeBlock", 1).doc, "代码");
  assert.equal(applyAction(doc, "codeBlock", doc.length - 1).doc, "代码");
});

test("局部选区位于同一代码块内部时取消并映射选区", () => {
  const doc = "```\nabcdef\n```";
  const result = applyAction(doc, "codeBlock", 5, 8);
  assert.deepEqual(result, {doc: "abcdef", anchor: 1, head: 4});
});

test("波浪线围栏可以取消", () => {
  assert.equal(applyAction("~~~js\ncode\n~~~", "codeBlock", 8).doc, "code");
});
```

- [ ] **Step 2: 运行并确认代码块仍只有添加行为或未实现**

Run: `npm test -- src/components/Editor/syntaxCommands.test.ts`

Expected: 新增 tests FAIL。

- [ ] **Step 3: 实现 `FencedCode` 定位和取消**

实现私有函数 `findEnclosingNode(state, "FencedCode", from, to)`，复用 Task 3 的包含范围判断。

对找到的节点：

1. 获取第一和最后一个 `CodeMark`。
2. 用 `state.doc.lineAt(openMark.from).to + 1` 得到正文起点。
3. 用关闭围栏所在行 `from`，并去掉紧邻关闭围栏、仅用于结束正文的一个换行，得到正文终点。
4. 以一个 change 将完整 `FencedCode` 节点替换为正文文本；语言标识自然随开围栏行一起删除。
5. 把 anchor/head 夹在正文范围后换算为 `node.from + (position - contentFrom)`，保持方向。
6. 光标位于开围栏、语言标识或闭围栏时分别映射到正文开始或结束。

找不到唯一包含整个选区的完整 `FencedCode` 时，复用现有 `insertCodeBlock` 添加围栏。

- [ ] **Step 4: 增加跨块和不完整围栏保护测试**

```ts
test("跨多个代码块不猜测取消而是包裹选区", () => {
  const doc = "```\n甲\n```\n\n```\n乙\n```";
  const result = applyAction(doc, "codeBlock", 4, doc.length - 4);
  assert.match(result.doc, /```[\s\S]*```[\s\S]*```/);
  assert.notEqual(result.doc, "甲\n\n乙");
});

test("不完整围栏不被破坏性删除", () => {
  const result = applyAction("```\n未闭合", "codeBlock", 5);
  assert.match(result.doc, /未闭合/);
  assert.ok(result.doc.length > "```\n未闭合".length);
});
```

- [ ] **Step 5: 实现链接和分割线分支并写测试**

```ts
test("链接与分割线保持插入型", () => {
  assert.equal(applyAction("文字", "link", 0, 2).doc, "[文字](链接地址)");
  assert.equal(applyAction("正文", "horizontalRule", 2).doc, "正文\n---\n");
});
```

- `link` 复用 `insertLink`。
- `horizontalRule` 使用现有文本 `"\n---\n"` 替换当前选区。
- 两者不查询或移除现有语法节点。

- [ ] **Step 6: 运行统一命令测试**

Run: `npm test -- src/components/Editor/syntaxCommands.test.ts`

Expected: 全部 PASS。

- [ ] **Step 7: 提交代码块和插入动作**

```bash
git add src/components/Editor/syntaxCommands.ts src/components/Editor/syntaxCommands.test.ts
git commit -m "feat: add fenced code toggle and insert actions"
```

---

### Task 6: 把统一命令和高优先级 keymap 接入 MarkdownEditor

**Files:**
- Modify: `src/components/Editor/MarkdownEditor.tsx`
- Create: `src/components/Editor/MarkdownEditor.syntaxActions.test.tsx`

- [ ] **Step 1: 写 MarkdownEditor 句柄集成失败测试**

```tsx
// src/components/Editor/MarkdownEditor.syntaxActions.test.tsx
import assert from "node:assert/strict";
import {test} from "node:test";
import React, {act, createRef} from "react";
import {createRoot} from "react-dom/client";
import MarkdownEditor, {type MarkdownEditorHandle} from "./MarkdownEditor.tsx";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

test("runSyntaxAction 通过统一命令修改文档", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const ref = createRef<MarkdownEditorHandle>();
  const changes: string[] = [];
  await act(async () => {
    root.render(<MarkdownEditor ref={ref} value="" appearanceMode="light" onChange={(value) => changes.push(value)} />);
  });
  try {
    act(() => ref.current?.runSyntaxAction("bold"));
    assert.equal(changes[changes.length - 1], "**加粗文本**");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
```

- [ ] **Step 2: 运行并确认句柄缺少 `runSyntaxAction`**

Run: `npm test -- src/components/Editor/MarkdownEditor.syntaxActions.test.tsx`

Expected: TypeScript/运行时 FAIL。

- [ ] **Step 3: 修改句柄并注册 keymap**

在 `MarkdownEditor.tsx`：

```ts
import {createSyntaxKeymap, type SyntaxAction} from "./syntaxActions.ts";
import {runSyntaxAction} from "./syntaxCommands.ts";
```

将句柄中的四个工具栏专用方法：

- `wrapSelection`
- `insertLink`
- `prefixLines`
- `insertCodeBlock`

替换为：

```ts
runSyntaxAction: (action: SyntaxAction) => void;
```

保留 `insertAtCursor`（上传图片仍使用）、`undo`、`redo` 和滚动 API。

在 `useImperativeHandle` 中：

```ts
runSyntaxAction: (action) => {
  const view = viewRef.current;
  if (!view) return;
  runSyntaxAction(view, action);
  view.focus();
},
```

在 extensions 中把搜索和语法键位放在同一个最高优先级 keymap，避免多个 `Prec.highest` 顺序含糊：

```ts
Prec.highest(keymap.of([
  {key: "Ctrl-h", run: openLocalizedSearchPanel},
  ...createSyntaxKeymap(runSyntaxAction),
])),
```

删除 `MarkdownEditor.tsx` 中不再直接使用的 `wrapSel`、`insLink`、`prefixLn`、`insCode` 导入及旧句柄实现。

- [ ] **Step 4: 运行句柄测试和既有编辑器测试**

Run:

```bash
npm test -- src/components/Editor/MarkdownEditor.syntaxActions.test.tsx src/components/Editor/MarkdownEditor.search.test.ts src/components/Editor/MarkdownEditor.appearance.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 5: 增加聚焦 keydown 测试**

在新测试文件渲染受控小包装组件，聚焦 `.cm-content` 后分发可冒泡且可取消的键盘事件：

```ts
const event = new KeyboardEvent("keydown", {key: "b", ctrlKey: true, bubbles: true, cancelable: true});
content.dispatchEvent(event);
assert.equal(event.defaultPrevented, true);
assert.equal(changes[changes.length - 1], "**加粗文本**");
```

另在页面普通 `<input>` 上分发同一事件，断言 `defaultPrevented === false` 且文档未变化，证明没有全局监听。

- [ ] **Step 6: 运行集成测试**

Run: `npm test -- src/components/Editor/MarkdownEditor.syntaxActions.test.tsx`

Expected: 全部 PASS。

- [ ] **Step 7: 提交编辑器接入**

```bash
git add src/components/Editor/MarkdownEditor.tsx src/components/Editor/MarkdownEditor.syntaxActions.test.tsx
git commit -m "feat: register syntax commands in markdown editor"
```

---

### Task 7: 将工具栏迁移到统一 SyntaxAction

**Files:**
- Modify: `src/components/Toolbar/SyntaxToolbar.tsx`
- Create: `src/components/Toolbar/SyntaxToolbar.test.tsx`

- [ ] **Step 1: 写按钮动作映射失败测试**

创建假的 `MarkdownEditorHandle`，其中 `runSyntaxAction` 把动作写入数组；其余必需方法用空函数补齐。渲染 `SyntaxToolbar` 后依次点击标题明确的按钮：

```tsx
const expected = [
  ["加粗", "bold"],
  ["斜体", "italic"],
  ["删除线", "strikethrough"],
  ["行内代码", "inlineCode"],
  ["链接", "link"],
  ["无序列表", "unorderedList"],
  ["有序列表", "orderedList"],
  ["引用", "blockquote"],
  ["代码块", "codeBlock"],
  ["分割线", "horizontalRule"],
] as const;

for (const [title, action] of expected) {
  const button = container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  assert.ok(button, title);
  act(() => button.click());
  assert.equal(calls[calls.length - 1], action);
}
```

标题菜单单独打开后，在 portal 中点击 H1–H4，断言分别提交 `heading1` 至 `heading4`。撤销/重做仍调用原句柄，不计入语法动作。

- [ ] **Step 2: 运行并确认当前按钮仍调用旧方法**

Run: `npm test -- src/components/Toolbar/SyntaxToolbar.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 迁移工具栏**

在 `SyntaxToolbar.tsx`：

```ts
import type {SyntaxAction} from "../Editor/syntaxActions.ts";

const run = (action: SyntaxAction) => () => ed()?.runSyntaxAction(action);
const pickHeading = (level: 1 | 2 | 3 | 4) => {
  ed()?.runSyntaxAction(`heading${level}` as SyntaxAction);
  setHeadingOpen(false);
};
```

按钮映射：

```tsx
<IconButton title="加粗" onClick={run("bold")}>...</IconButton>
<IconButton title="斜体" onClick={run("italic")}>...</IconButton>
<IconButton title="删除线" onClick={run("strikethrough")}>...</IconButton>
<IconButton title="行内代码" onClick={run("inlineCode")}>...</IconButton>
<IconButton title="链接" onClick={run("link")}>...</IconButton>
<IconButton title="无序列表" onClick={run("unorderedList")}>...</IconButton>
<IconButton title="有序列表" onClick={run("orderedList")}>...</IconButton>
<IconButton title="引用" onClick={run("blockquote")}>...</IconButton>
<IconButton title="代码块" onClick={run("codeBlock")}>...</IconButton>
<IconButton title="分割线" onClick={run("horizontalRule")}>...</IconButton>
```

上传图片、撤销、重做和标题菜单视觉结构保持不变。

为避免类型断言，可以增加类型安全 helper：

```ts
const headingActions = ["heading1", "heading2", "heading3", "heading4"] as const;
```

菜单按 `headingActions.map(...)` 渲染，这是推荐实现。

- [ ] **Step 4: 运行工具栏与编辑器集成测试**

Run:

```bash
npm test -- src/components/Toolbar/SyntaxToolbar.test.tsx src/components/Workspace/EditorWorkspacePanel.test.ts src/components/Editor/MarkdownEditor.syntaxActions.test.tsx
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交工具栏统一入口**

```bash
git add src/components/Toolbar/SyntaxToolbar.tsx src/components/Toolbar/SyntaxToolbar.test.tsx
git commit -m "refactor: route syntax toolbar through shared actions"
```

---

### Task 8: 完整回归、构建和桌面手动验证

**Files:**
- Modify only if verification exposes a defect in files already listed above.

- [ ] **Step 1: 运行语法功能相关测试**

Run:

```bash
npm test -- src/components/Editor/editing.test.ts src/components/Editor/syntaxActions.test.ts src/components/Editor/syntaxCommands.test.ts src/components/Editor/MarkdownEditor.syntaxActions.test.tsx src/components/Toolbar/SyntaxToolbar.test.tsx
```

Expected: 全部 PASS，无 warning 或未处理的 `act(...)` 错误。

- [ ] **Step 2: 运行项目全部测试**

Run: `npm test`

Expected: exit code 0，全部测试通过。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`

Expected: `tsc -b && vite build` exit code 0；无未使用导入、类型错误或打包失败。

- [ ] **Step 4: 检查代码和工作区状态**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；只显示本任务预期文件，或在全部提交后为空。

- [ ] **Step 5: 在桌面应用中手动验证 Windows 键位**

Run: `npm run tauri`

依次验证：

1. 编辑器聚焦时 `Ctrl+B`、`Ctrl+I`、`Alt+Shift+5`、`Ctrl+Shift+反引号`、`Ctrl+K`。
2. `Ctrl+1` 至 `Ctrl+4` 切换标题，同级再次执行恢复正文。
3. `Ctrl+Shift+[`、`Ctrl+Shift+]` 在有序/无序列表之间转换并可取消。
4. `Ctrl+Shift+Q` 切换引用。
5. `Ctrl+Shift+K` 在完整选中代码块、光标位于正文、语言标识和围栏行时取消。
6. `Ctrl+Shift+H` 插入分割线。
7. 点击对应工具栏按钮得到与快捷键相同的结果。
8. 设置、发布和搜索输入框聚焦时，上述按键不修改正文。
9. 每次语法操作执行一次撤销即可完整还原。

macOS 键位由自动化注册表测试覆盖；若有 macOS 环境，再执行一次真实按键冒烟测试。

- [ ] **Step 6: 如验证修复了问题，重跑相关测试后提交最终修复**

```bash
git add src/components/Editor src/components/Toolbar
git commit -m "fix: harden syntax shortcut edge cases"
```

仅在确有修复时创建该提交；不要创建空提交。

---

## Completion checklist

- [ ] 14 个语法动作都有平台键位，除分割线外与 Typora 官方默认值一致。
- [ ] 快捷键只在 CodeMirror 聚焦时生效。
- [ ] 工具栏和快捷键都调用 `runSyntaxAction`。
- [ ] 行内格式支持选区、光标上下文和嵌套层级切换。
- [ ] 标题、列表和引用支持添加、取消与转换。
- [ ] 代码块支持完整选中或定位在块内取消，且保留正文和选区。
- [ ] 链接与分割线保持插入型。
- [ ] 单次撤销还原单次操作。
- [ ] `npm test` 与 `npm run build` 通过。
