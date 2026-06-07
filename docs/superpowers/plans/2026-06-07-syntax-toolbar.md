# 语法快捷工具栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在编辑器 navbar 加一组 Markdown 语法快捷按钮，点击插入/包裹对应语法（加粗、引用、代码块、标题下拉等）。

**Architecture:** 文本变换逻辑抽成纯函数 `editing.ts`（可单测）；`MarkdownEditor` 暴露 `wrapSelection`/`prefixLines`/`insertLink` 三个方法薄薄包一层 CodeMirror dispatch；新组件 `SyntaxToolbar` 渲染按钮组并调用编辑器方法，放进 App navbar 左侧。

**Tech Stack:** React 18 + TypeScript + CodeMirror 6 + lucide-react（图标）+ node:test（测试）。

设计依据：`docs/superpowers/specs/2026-06-07-syntax-toolbar-design.md`

---

## File Structure

- **Create** `src/components/Editor/editing.ts` — 纯文本变换函数（wrap/prefix/link），输入 doc+选区，输出新文本片段+新选区。
- **Create** `src/components/Editor/editing.test.ts` — 上述纯函数单测。
- **Modify** `src/components/Editor/MarkdownEditor.tsx` — `MarkdownEditorHandle` 增加 3 个方法，内部调 editing.ts + view.dispatch。
- **Create** `src/components/Toolbar/SyntaxToolbar.tsx` — 工具栏组件，含标题 H1-H4 下拉。
- **Modify** `src/App.tsx` — navbar 左侧渲染 SyntaxToolbar，标题缩短为「排版工具」。
- **Modify** `package.json` — 加 lucide-react 依赖。

---

## Task 1: 安装图标库

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 lucide-react**

Run: `cd "C:\Users\Administrator\Desktop\微信公众号排版工具" && npm install lucide-react`
Expected: package.json dependencies 多出 `lucide-react`，无报错。

- [ ] **Step 2: 验证可导入**

Run: `node --import tsx -e "import('lucide-react').then(m => console.log(typeof m.Bold))"`
Expected: 打印 `function`（或 `object`，确认 Bold 图标存在）。若不存在，查 lucide-react 实际导出名替换。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add lucide-react for toolbar icons"
```

---

## Task 2: 纯文本变换函数 — wrapSelection

**Files:**
- Create: `src/components/Editor/editing.ts`
- Test: `src/components/Editor/editing.test.ts`

变换函数统一返回 `{insert: string, selFrom: number, selTo: number}`，其中 `insert` 替换 `[from, to)` 区间，`selFrom`/`selTo` 是替换后文档里的新选区绝对位置。

- [ ] **Step 1: Write the failing test**

```ts
// src/components/Editor/editing.test.ts
import {test} from "node:test";
import assert from "node:assert/strict";
import {wrapSelection} from "./editing.ts";

test("wrap 有选区：包裹并选中原文字", () => {
  const doc = "你好世界";
  // 选中“世界”(from=2,to=4)
  const r = wrapSelection(doc, 2, 4, "**", "**", "加粗文本");
  assert.equal(r.insert, "**世界**");
  // 替换后选区应覆盖“世界”：from=2+2=4, to=4+2=6
  assert.equal(r.selFrom, 4);
  assert.equal(r.selTo, 6);
});

test("wrap 无选区：插入占位符并选中占位符", () => {
  const doc = "abc";
  const r = wrapSelection(doc, 3, 3, "**", "**", "加粗文本");
  assert.equal(r.insert, "**加粗文本**");
  assert.equal(r.selFrom, 5); // 3 + len("**")
  assert.equal(r.selTo, 5 + "加粗文本".length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，`wrapSelection` 未定义 / 模块不存在。

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/Editor/editing.ts

export interface EditResult {
  insert: string;
  selFrom: number;
  selTo: number;
}

// 行内包裹：有选区包裹选区文字（结果仍选中文字）；无选区插占位符并选中它。
export function wrapSelection(
  doc: string,
  from: number,
  to: number,
  before: string,
  after: string,
  placeholder: string,
): EditResult {
  const hasSel = to > from;
  const inner = hasSel ? doc.slice(from, to) : placeholder;
  const insert = before + inner + after;
  const selFrom = from + before.length;
  const selTo = selFrom + inner.length;
  return {insert, selFrom, selTo};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（两条 wrap 用例通过）。

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor/editing.ts src/components/Editor/editing.test.ts
git commit -m "feat: add wrapSelection text transform"
```

---

## Task 3: 纯文本变换函数 — insertLink

**Files:**
- Modify: `src/components/Editor/editing.ts`
- Test: `src/components/Editor/editing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 editing.test.ts
import {insertLink} from "./editing.ts";

test("link 有选区：选区当链接文字，选中 url 占位", () => {
  const doc = "看这里";
  const r = insertLink(doc, 0, 3); // 选中“看这里”
  assert.equal(r.insert, "[看这里](链接地址)");
  // url 占位在 ] ( 之后：偏移 = len("[看这里](") = 3+2 = 5... 用字符串算
  const urlStart = "[看这里](".length;
  assert.equal(r.selFrom, urlStart);
  assert.equal(r.selTo, urlStart + "链接地址".length);
});

test("link 无选区：选中链接文字占位", () => {
  const doc = "";
  const r = insertLink(doc, 0, 0);
  assert.equal(r.insert, "[链接文字](链接地址)");
  assert.equal(r.selFrom, 1); // "[".length
  assert.equal(r.selTo, 1 + "链接文字".length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，`insertLink` 未定义。

- [ ] **Step 3: Write minimal implementation**

```ts
// 追加到 editing.ts

// 链接：有选区→选区当文字、选中 url 占位；无选区→选中文字占位（url 随后填）。
export function insertLink(doc: string, from: number, to: number): EditResult {
  const hasSel = to > from;
  if (hasSel) {
    const text = doc.slice(from, to);
    const insert = `[${text}](链接地址)`;
    const urlStart = from + `[${text}](`.length;
    return {insert, selFrom: urlStart, selTo: urlStart + "链接地址".length};
  }
  const insert = "[链接文字](链接地址)";
  return {insert, selFrom: from + 1, selTo: from + 1 + "链接文字".length};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor/editing.ts src/components/Editor/editing.test.ts
git commit -m "feat: add insertLink text transform"
```

---

## Task 4: 纯文本变换函数 — prefixLines

**Files:**
- Modify: `src/components/Editor/editing.ts`
- Test: `src/components/Editor/editing.test.ts`

行级前缀需要把选区扩展到整行，所以返回的 `[from, to)` 替换区间不是原选区，而是"选区涉及的整行范围"。函数额外返回 `replaceFrom`/`replaceTo` 表示要替换的区间。

- [ ] **Step 1: Write the failing test**

```ts
// 追加到 editing.test.ts
import {prefixLines} from "./editing.ts";

test("prefix 单行：行首加前缀，光标后移", () => {
  const doc = "标题";
  const r = prefixLines(doc, 0, 0, "## ");
  assert.equal(r.replaceFrom, 0);
  assert.equal(r.replaceTo, 2); // 整行“标题”
  assert.equal(r.insert, "## 标题");
  // 新选区覆盖加前缀后的整行
  assert.equal(r.selFrom, 0);
  assert.equal(r.selTo, "## 标题".length);
});

test("prefix 多行：每行逐行加前缀", () => {
  const doc = "甲\n乙\n丙";
  // 选中“甲”到“乙”中间（from=0, to=3 含换行）
  const r = prefixLines(doc, 0, 3, "- ");
  assert.equal(r.replaceFrom, 0);
  assert.equal(r.replaceTo, 3); // “甲\n乙”
  assert.equal(r.insert, "- 甲\n- 乙");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL，`prefixLines` 未定义。

- [ ] **Step 3: Write minimal implementation**

```ts
// 追加到 editing.ts

export interface PrefixResult {
  replaceFrom: number;
  replaceTo: number;
  insert: string;
  selFrom: number;
  selTo: number;
}

// 行级前缀：把选区扩到涉及的整行，每行行首加 prefix。
export function prefixLines(
  doc: string,
  from: number,
  to: number,
  prefix: string,
): PrefixResult {
  // 选区起点所在行的行首
  const lineStart = doc.lastIndexOf("\n", from - 1) + 1;
  // 选区终点所在行的行尾（不含换行）；to===from 时取该行
  const nlAfter = doc.indexOf("\n", to);
  const lineEnd = nlAfter === -1 ? doc.length : nlAfter;
  const block = doc.slice(lineStart, lineEnd);
  const insert = block
    .split("\n")
    .map((ln) => prefix + ln)
    .join("\n");
  return {
    replaceFrom: lineStart,
    replaceTo: lineEnd,
    insert,
    selFrom: lineStart,
    selTo: lineStart + insert.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor/editing.ts src/components/Editor/editing.test.ts
git commit -m "feat: add prefixLines text transform"
```

---

## Task 5: 编辑器暴露 wrapSelection / insertLink / prefixLines

**Files:**
- Modify: `src/components/Editor/MarkdownEditor.tsx`

无单测（CodeMirror dispatch 靠手动验证）。纯函数已在 Task 2-4 测过。

- [ ] **Step 1: 扩展 MarkdownEditorHandle 接口**

在 `MarkdownEditorHandle`（约 7-16 行）的 `insertAtCursor` 之后加：

```ts
  // 行内包裹：有选区包裹，无选区插占位符并选中。
  wrapSelection: (before: string, after: string, placeholder: string) => void;
  // 插入链接：选区当文字，选中 url 占位。
  insertLink: () => void;
  // 行级前缀：选区涉及的每行行首加 prefix。
  prefixLines: (prefix: string) => void;
```

- [ ] **Step 2: 引入纯函数**

在文件顶部 import 区加：

```ts
import {wrapSelection as wrapSel, insertLink as insLink, prefixLines as prefixLn} from "./editing.ts";
```

- [ ] **Step 3: 在 useImperativeHandle 里实现三个方法**

在 `insertAtCursor` 实现之后、`getScroller` 之前插入：

```ts
      wrapSelection: (before, after, placeholder) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const {from, to} = view.state.selection.main;
        const doc = view.state.doc.toString();
        const r = wrapSel(doc, from, to, before, after, placeholder);
        view.dispatch({
          changes: {from, to, insert: r.insert},
          selection: {anchor: r.selFrom, head: r.selTo},
        });
        view.focus();
      },
      insertLink: () => {
        const view = cmRef.current?.view;
        if (!view) return;
        const {from, to} = view.state.selection.main;
        const doc = view.state.doc.toString();
        const r = insLink(doc, from, to);
        view.dispatch({
          changes: {from, to, insert: r.insert},
          selection: {anchor: r.selFrom, head: r.selTo},
        });
        view.focus();
      },
      prefixLines: (prefix) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const {from, to} = view.state.selection.main;
        const doc = view.state.doc.toString();
        const r = prefixLn(doc, from, to, prefix);
        view.dispatch({
          changes: {from: r.replaceFrom, to: r.replaceTo, insert: r.insert},
          selection: {anchor: r.selFrom, head: r.selTo},
        });
        view.focus();
      },
```

- [ ] **Step 4: 类型检查通过**

Run: `cd "C:\Users\Administrator\Desktop\微信公众号排版工具" && npx tsc -b --noEmit`
Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor/MarkdownEditor.tsx
git commit -m "feat: expose wrapSelection/insertLink/prefixLines on editor"
```

---

## Task 6: SyntaxToolbar 组件

**Files:**
- Create: `src/components/Toolbar/SyntaxToolbar.tsx`

无单测（纯 UI + 转调，逻辑已测）。

- [ ] **Step 1: 创建组件**

```tsx
// src/components/Toolbar/SyntaxToolbar.tsx
import {useState, useRef, useEffect, type RefObject} from "react";
import {
  Bold, Italic, Strikethrough, Code, Link, Heading,
  List, ListOrdered, Quote, SquareCode, Minus,
} from "lucide-react";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
}

const btnStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d9d9d9",
  borderRadius: 4,
  background: "#fff",
  color: "#333",
  cursor: "pointer",
  padding: 0,
};

const ICON = 16;

export default function SyntaxToolbar({editorRef}: Props) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingWrapRef = useRef<HTMLDivElement>(null);

  // 点击空白关闭标题下拉
  useEffect(() => {
    if (!headingOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!headingWrapRef.current?.contains(e.target as Node)) {
        setHeadingOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [headingOpen]);

  const ed = () => editorRef.current;

  const wrap = (b: string, a: string, ph: string) => () => ed()?.wrapSelection(b, a, ph);
  const prefix = (p: string) => () => ed()?.prefixLines(p);

  const pickHeading = (level: number) => {
    ed()?.prefixLines("#".repeat(level) + " ");
    setHeadingOpen(false);
  };

  return (
    <div style={{display: "flex", alignItems: "center", gap: 4}}>
      <button type="button" title="加粗" style={btnStyle} onClick={wrap("**", "**", "加粗文本")}>
        <Bold size={ICON} />
      </button>
      <button type="button" title="斜体" style={btnStyle} onClick={wrap("*", "*", "斜体文本")}>
        <Italic size={ICON} />
      </button>
      <button type="button" title="删除线" style={btnStyle} onClick={wrap("~~", "~~", "删除文本")}>
        <Strikethrough size={ICON} />
      </button>
      <button type="button" title="行内代码" style={btnStyle} onClick={wrap("`", "`", "代码")}>
        <Code size={ICON} />
      </button>
      <button type="button" title="链接" style={btnStyle} onClick={() => ed()?.insertLink()}>
        <Link size={ICON} />
      </button>

      {/* 标题下拉 */}
      <div ref={headingWrapRef} style={{position: "relative"}}>
        <button type="button" title="标题" style={btnStyle} onClick={() => setHeadingOpen((o) => !o)}>
          <Heading size={ICON} />
        </button>
        {headingOpen && (
          <div
            style={{
              position: "absolute",
              top: 34,
              left: 0,
              background: "#fff",
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              zIndex: 10,
              minWidth: 80,
            }}
          >
            {[1, 2, 3, 4].map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => pickHeading(lv)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "6px 12px",
                  border: "none",
                  background: "#fff",
                  textAlign: "left",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                H{lv}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" title="无序列表" style={btnStyle} onClick={prefix("- ")}>
        <List size={ICON} />
      </button>
      <button type="button" title="有序列表" style={btnStyle} onClick={prefix("1. ")}>
        <ListOrdered size={ICON} />
      </button>
      <button type="button" title="引用" style={btnStyle} onClick={prefix("> ")}>
        <Quote size={ICON} />
      </button>
      <button type="button" title="代码块" style={btnStyle} onClick={() => ed()?.insertAtCursor("\n```\n\n```\n")}>
        <SquareCode size={ICON} />
      </button>
      <button type="button" title="分割线" style={btnStyle} onClick={() => ed()?.insertAtCursor("\n---\n")}>
        <Minus size={ICON} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查通过**

Run: `cd "C:\Users\Administrator\Desktop\微信公众号排版工具" && npx tsc -b --noEmit`
Expected: 无类型错误。若某图标名不存在（如 `SquareCode`），查 lucide-react 文档换成实际导出名（备选 `Code2`/`FileCode`）。

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/SyntaxToolbar.tsx
git commit -m "feat: add SyntaxToolbar component"
```

---

## Task 7: 接入 App navbar（左语法 / 右全局分段）

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: import SyntaxToolbar**

在 import 区（约第 9 行 StylePanel import 后）加：

```ts
import SyntaxToolbar from "./components/Toolbar/SyntaxToolbar.tsx";
```

- [ ] **Step 2: 改造 navbar 内部为左右分段**

把 header 内现有内容（`<span>微信公众号排版工具</span>` 那段标题 + 右侧按钮 `<div>`）替换为：

```tsx
        <div style={{display: "flex", alignItems: "center", gap: 12}}>
          <span style={{fontWeight: 600, color: "#1e6bb8", whiteSpace: "nowrap"}}>排版工具</span>
          <SyntaxToolbar editorRef={editorRef} />
        </div>
        <div style={{display: "flex", alignItems: "center", gap: 12}}>
          <UploadButton onPick={handleUploadFile} />
          <ImportButton />
          <ThemeMenu />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              height: 30,
              padding: "0 12px",
              fontSize: 13,
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              background: "#fff",
              color: "#333",
              cursor: "pointer",
            }}
          >
            设置
          </button>
          <CopyButton />
        </div>
```

（header 本身已是 `justifyContent: "space-between"`，两个 div 自动左右分布。）

- [ ] **Step 3: 类型检查通过**

Run: `cd "C:\Users\Administrator\Desktop\微信公众号排版工具" && npx tsc -b --noEmit`
Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire SyntaxToolbar into navbar"
```

---

## Task 8: 手动验证

**Files:** 无（运行验证）

- [ ] **Step 1: 启动应用**

Run: `cd "C:\Users\Administrator\Desktop\微信公众号排版工具" && npm run dev`
Expected: Vite 起服务，浏览器打开无报错。

- [ ] **Step 2: 逐项验证（在编辑器里操作）**

- [ ] 选中一段文字点加粗 → 变 `**文字**` 且文字仍选中；空选区点加粗 → 插 `**加粗文本**` 且“加粗文本”被选中
- [ ] 斜体 / 删除线 / 行内代码 同理
- [ ] 选中文字点链接 → `[文字](链接地址)` 且“链接地址”被选中；空选区 → `[链接文字](链接地址)` 选中“链接文字”
- [ ] 标题按钮点开下拉 → 选 H2 → 当前行变 `## …`；点空白处下拉关闭
- [ ] 选中多行点无序列表 → 每行行首加 `- `；有序列表加 `1. `；引用加 `> `
- [ ] 代码块 → 插入 ` ``` ` 围栏，光标在中间空行；分割线 → 插 `---`
- [ ] 每个操作后右侧预览实时更新、主题样式正常
- [ ] navbar 窗口缩窄时左右两组不重叠错乱

- [ ] **Step 3: 全量测试 + 类型检查最终确认**

Run: `cd "C:\Users\Administrator\Desktop\微信公众号排版工具" && npm test && npx tsc -b --noEmit`
Expected: 所有测试 PASS，无类型错误。

- [ ] **Step 4: 更新 PROGRESS.md（若项目惯例需要）**

检查 `PROGRESS.md` 是否记录功能进展；若是，追加一条语法工具栏完成记录并 commit。

---

## Self-Review 结果

- **Spec 覆盖**：选区包裹(T2)、链接(T3)、行级前缀(T4)、编辑器方法(T5)、11 按钮+标题 H1-H4 下拉+lucide 图标(T6)、navbar 左右分段+标题缩短(T7)、手动验证(T8)。YAGNI 项（快捷键/激活态/表格图片按钮）未做，符合 spec。
- **占位符**：无 TBD，每个代码步骤含完整代码。
- **类型一致**：`EditResult`(wrap/link) 与 `PrefixResult`(prefix) 区分明确；编辑器方法名 `wrapSelection`/`insertLink`/`prefixLines` 在 T5/T6 一致；图标名在 T6 标注了备选以防 lucide 导出名不符。
