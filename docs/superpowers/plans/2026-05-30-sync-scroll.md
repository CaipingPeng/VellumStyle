# 同步滚动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 编辑器与预览按源码行号双向同步滚动，默认常开、无开关。

**Architecture:** markdown-it core 规则给顶层渲染块打 `data-line`（源码起始行）；新建 `syncScroll.ts` 双向引擎，用 `lockUntil` 时间戳防互推振荡；App 把编辑器与预览的滚动容器接到引擎；复制时剥离 `data-line` 保证微信 HTML 干净。

**Tech Stack:** React 18、CodeMirror 6（`@uiw/react-codemirror`）、markdown-it 14、TypeScript、Vite。

**项目验证方式（重要）：** 本项目无测试框架，不是 git 仓库。验证 = `npx tsc --noEmit` 通过 + 浏览器手测。**不写自动化测试、不执行 git commit。** 每个任务以「类型检查通过」为完成标志，最后统一人工手测。

> spec: `docs/superpowers/specs/2026-05-30-sync-scroll-design.md`

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/markdown/data-line.ts` | markdown-it 插件：给顶层 block token 注入 `data-line` 属性 | 新建 |
| `src/markdown/parser.ts` | 插件链尾部挂载 data-line 插件 | 修改 |
| `src/markdown/converter.ts` | 复制前剥离 `data-line` 属性 | 修改 |
| `src/utils/syncScroll.ts` | 双向同步引擎（行号↔scrollTop 插值 + 防振荡） | 新建 |
| `src/components/Editor/MarkdownEditor.tsx` | handle 暴露 getScroller/getTopLine/scrollToLine | 修改 |
| `src/components/Preview/Preview.tsx` | forwardRef 暴露滚动容器 getScroller | 修改 |
| `src/App.tsx` | 持两个 ref，useEffect 接线 createScrollSync | 修改 |

---

## Task 1: data-line markdown-it 插件

给每个顶层 block token 的开标签注入 `data-line="<源码起始行>"`。markdown-it 的 block token 自带 `token.map = [startLine, endLine]`（0-based）。

**Files:**
- Create: `src/markdown/data-line.ts`

- [ ] **Step 1: 写插件**

`src/markdown/data-line.ts`:

```typescript
import type MarkdownIt from "markdown-it";

// 给顶层 block token 注入 data-line（源码起始行，0-based），供同步滚动按行对齐。
// markdown-it 的 block token 自带 token.map=[startLine,endLine]；只标 level===0 的块，
// 避免嵌套块锚点过密。插在 core 阶段末尾，不影响插件链顺序。
export default function dataLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push("inject_data_line", (state) => {
    for (const token of state.tokens) {
      if (token.level === 0 && token.map && token.nesting !== -1) {
        token.attrSet("data-line", String(token.map[0]));
      }
    }
    return true;
  });
}
```

- [ ] **Step 2: 挂载到 parser**

`src/markdown/parser.ts` — 在文件顶部 import 区（其它自定义插件 import 之后，约第 22 行 `import imsize` 之后）加：

```typescript
import dataLine from "./data-line.ts";
```

在插件链末尾（`.use(imsize)` 那一句之后）追加：

```typescript
parser.use(dataLine); // 13. 顶层块注入 data-line（同步滚动用）
```

注意：`.use(imsize);` 当前以分号结尾，单独再起一行 `parser.use(dataLine);` 即可，不要去改原链式调用。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。

- [ ] **Step 4: 手动验证渲染输出带 data-line**

启动 `npm run dev:web`，打开页面，F12 在预览区 `#nice` 下检查：顶层 `<p>`/`<h1>`/`<pre>` 等元素带 `data-line="数字"` 属性。
不需要每个块都有（行内/嵌套块不标），但顶层标题、段落、代码块应该有。

---

## Task 2: 复制时剥离 data-line

`data-line` 是预览专用属性，不应进入粘贴到微信的 HTML。

**Files:**
- Modify: `src/markdown/converter.ts:28-30`

- [ ] **Step 1: 加剥离逻辑**

`src/markdown/converter.ts` — 当前第 28-30 行是：

```typescript
  let html = box.innerHTML;
  // 预览里 mmbiz 图走了代理 src，复制前还原成原始 mmbiz 链（微信域名下正常显示）
  html = fromProxyHtml(html);
```

改为（在 `fromProxyHtml` 之后加一行剥离）：

```typescript
  let html = box.innerHTML;
  // 预览里 mmbiz 图走了代理 src，复制前还原成原始 mmbiz 链（微信域名下正常显示）
  html = fromProxyHtml(html);
  // 剥离同步滚动用的 data-line，避免污染粘贴到微信的 HTML
  html = html.replace(/\s*data-line="\d+"/g, "");
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。

- [ ] **Step 3: 手动验证**

页面点「复制到微信」后，把剪贴板内容粘到纯文本编辑器（或 F12 console 看），确认无 `data-line` 残留。（此步可与最终手测合并。）

---

## Task 3: 同步引擎 syncScroll.ts

双向：编辑器↔预览按行锚点插值，`lockUntil` 时间戳防互推。

**Files:**
- Create: `src/utils/syncScroll.ts`

- [ ] **Step 1: 写引擎**

`src/utils/syncScroll.ts`:

```typescript
// 编辑器 ↔ 预览 双向同步滚动引擎（按源码行号对齐）。
// 预览侧 DOM 的顶层块带 data-line（见 markdown/data-line.ts）；
// 编辑器侧由调用方提供「取顶部可视行 / 滚到某行」回调。

export interface ScrollSyncOptions {
  // 编辑器滚动容器（CodeMirror 的 .cm-scroller）
  editorScroller: HTMLElement;
  // 预览滚动容器（Preview 外层 overflow:auto 的 div）
  previewScroller: HTMLElement;
  // 取编辑器顶部可视行号（0-based，与 data-line 同基准）
  getEditorTopLine: () => number;
  // 把编辑器滚到指定行（0-based）
  scrollEditorToLine: (line: number) => void;
}

const LOCK_MS = 80;

export function createScrollSync(opts: ScrollSyncOptions): {destroy: () => void} {
  const {editorScroller, previewScroller, getEditorTopLine, scrollEditorToLine} = opts;
  // 程序触发的滚动会回弹 scroll 事件；lockUntil 期内忽略被动方事件，避免互推。
  let lockUntil = 0;
  let rafId = 0;

  // 读预览所有锚点元素，按 data-line 升序返回 {line, top}。
  const anchors = (): {line: number; top: number}[] => {
    const els = previewScroller.querySelectorAll<HTMLElement>("[data-line]");
    const list: {line: number; top: number}[] = [];
    for (const el of els) {
      const line = Number(el.getAttribute("data-line"));
      if (!Number.isNaN(line)) {
        list.push({line, top: el.offsetTop});
      }
    }
    list.sort((a, b) => a.line - b.line);
    return list;
  };

  // 编辑器 → 预览：按顶部行号在锚点间线性插值出预览 scrollTop。
  const syncEditorToPreview = () => {
    const list = anchors();
    if (list.length === 0) {
      return;
    }
    const line = getEditorTopLine();
    // 找 line <= 当前的最后一个锚点 prev，及其后第一个 next
    let prev = list[0];
    let next = list[list.length - 1];
    for (let i = 0; i < list.length; i++) {
      if (list[i].line <= line) {
        prev = list[i];
        next = list[i + 1] ?? list[i];
      } else {
        break;
      }
    }
    let top: number;
    if (next.line === prev.line) {
      top = prev.top;
    } else {
      const ratio = (line - prev.line) / (next.line - prev.line);
      top = prev.top + ratio * (next.top - prev.top);
    }
    lockUntil = Date.now() + LOCK_MS;
    previewScroller.scrollTop = top;
  };

  // 预览 → 编辑器：按预览 scrollTop 反插值出行号，滚编辑器到该行。
  const syncPreviewToEditor = () => {
    const list = anchors();
    if (list.length === 0) {
      return;
    }
    const st = previewScroller.scrollTop;
    let prev = list[0];
    let next = list[list.length - 1];
    for (let i = 0; i < list.length; i++) {
      if (list[i].top <= st) {
        prev = list[i];
        next = list[i + 1] ?? list[i];
      } else {
        break;
      }
    }
    let line: number;
    if (next.top === prev.top) {
      line = prev.line;
    } else {
      const ratio = (st - prev.top) / (next.top - prev.top);
      line = prev.line + ratio * (next.line - prev.line);
    }
    lockUntil = Date.now() + LOCK_MS;
    scrollEditorToLine(Math.round(line));
  };

  const onEditorScroll = () => {
    if (Date.now() < lockUntil) {
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(syncEditorToPreview);
  };

  const onPreviewScroll = () => {
    if (Date.now() < lockUntil) {
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(syncPreviewToEditor);
  };

  editorScroller.addEventListener("scroll", onEditorScroll, {passive: true});
  previewScroller.addEventListener("scroll", onPreviewScroll, {passive: true});

  return {
    destroy() {
      cancelAnimationFrame(rafId);
      editorScroller.removeEventListener("scroll", onEditorScroll);
      previewScroller.removeEventListener("scroll", onPreviewScroll);
    },
  };
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。此任务无运行验证，由 Task 6 接线后整体手测。

---

## Task 4: MarkdownEditor 暴露滚动接口

handle 增加 `getScroller` / `getTopLine` / `scrollToLine`，基于已有 `cmRef.current.view`。

**Files:**
- Modify: `src/components/Editor/MarkdownEditor.tsx:7-10`（接口）、`:24-33`（useImperativeHandle）

- [ ] **Step 1: 扩展 handle 接口**

`src/components/Editor/MarkdownEditor.tsx` — 当前接口（第 7-10 行）：

```typescript
export interface MarkdownEditorHandle {
  // 在当前光标处插入文本（替换选区）。供工具栏上传按钮调用。
  insertAtCursor: (text: string) => void;
}
```

改为：

```typescript
export interface MarkdownEditorHandle {
  // 在当前光标处插入文本（替换选区）。供工具栏上传按钮调用。
  insertAtCursor: (text: string) => void;
  // 编辑器滚动容器（.cm-scroller），供同步滚动监听
  getScroller: () => HTMLElement | null;
  // 顶部可视行号（0-based，与渲染 data-line 同基准）
  getTopLine: () => number;
  // 滚动编辑器使指定行（0-based）出现在视口顶部
  scrollToLine: (line: number) => void;
}
```

- [ ] **Step 2: 实现三个方法**

同文件，`useImperativeHandle`（当前第 24-33 行）：

```typescript
    useImperativeHandle(ref, () => ({
      insertAtCursor: (text) => {
        const view = cmRef.current?.view;
        if (!view) {
          return;
        }
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      },
    }));
```

改为：

```typescript
    useImperativeHandle(ref, () => ({
      insertAtCursor: (text) => {
        const view = cmRef.current?.view;
        if (!view) {
          return;
        }
        view.dispatch(view.state.replaceSelection(text));
        view.focus();
      },
      getScroller: () => cmRef.current?.view?.scrollDOM ?? null,
      getTopLine: () => {
        const view = cmRef.current?.view;
        if (!view) {
          return 0;
        }
        // 视口顶部像素对应的块行号（CodeMirror 行 1-based，转 0-based 与 data-line 对齐）
        const top = view.scrollDOM.scrollTop;
        const blockInfo = view.lineBlockAtHeight(top);
        return view.state.doc.lineAt(blockInfo.from).number - 1;
      },
      scrollToLine: (line) => {
        const view = cmRef.current?.view;
        if (!view) {
          return;
        }
        const docLine = Math.min(Math.max(line + 1, 1), view.state.doc.lines);
        const pos = view.state.doc.line(docLine).from;
        view.dispatch({effects: EditorView.scrollIntoView(pos, {y: "start"})});
      },
    }));
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。`EditorView` 已在文件顶部导入（`import {EditorView} from "@codemirror/view"`），无需新增 import。

---

## Task 5: Preview 暴露滚动容器

Preview 改 `forwardRef`，暴露外层 `overflow:auto` div 的 getScroller。

**Files:**
- Modify: `src/components/Preview/Preview.tsx:1`（import）、`:17`（组件签名）、`:48-54`（return + ref）

- [ ] **Step 1: 改 import + 定义 handle 类型**

`src/components/Preview/Preview.tsx` — 第 1 行：

```typescript
import {useEffect, useRef, useState} from "react";
```

改为：

```typescript
import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
```

在 `interface Props {...}` 之后（约第 12 行后）新增：

```typescript
export interface PreviewHandle {
  // 预览滚动容器（外层 overflow:auto 的 div），供同步滚动监听
  getScroller: () => HTMLElement | null;
}
```

- [ ] **Step 2: 组件改 forwardRef + 暴露 ref**

当前组件签名（第 17 行）：

```typescript
export default function Preview({content, markdownThemeId, useCustom, customCss}: Props) {
```

return 块（第 48-54 行）：

```typescript
  return (
    <div style={{height: "100%", overflowY: "auto", background: "#fff"}}>
      <div id="nice-rich-text-box" style={{padding: "24px 32px", minHeight: "100%"}}>
        <section id="nice" dangerouslySetInnerHTML={{__html: html}} />
      </div>
    </div>
  );
}
```

整体改为（包住组件体为 forwardRef，加 scrollRef + useImperativeHandle）：

```typescript
const Preview = forwardRef<PreviewHandle, Props>(
  ({content, markdownThemeId, useCustom, customCss}, ref) => {
    const [html, setHtml] = useState("");
    const timer = useRef<number | undefined>(undefined);
    const scrollRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      getScroller: () => scrollRef.current,
    }));

    // 基础层只注入一次
    useEffect(() => {
      replaceStyle(STYLE_IDS.basic, basic);
    }, []);

    // 主题层 + 代码层随主题/自定义状态切换（代码高亮跟随当前 markdown 主题）
    useEffect(() => {
      replaceStyle(STYLE_IDS.markdown, getEffectiveMarkdownCss(markdownThemeId, useCustom, customCss));
      replaceStyle(STYLE_IDS.code, getCodeCss(markdownThemeId));
    }, [markdownThemeId, useCustom, customCss]);

    // 内容渲染，100ms 节流
    useEffect(() => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        setHtml(toProxyHtml(render(content)));
      }, RENDER_THROTTLE_MS);
      return () => {
        if (timer.current) {
          window.clearTimeout(timer.current);
        }
      };
    }, [content]);

    return (
      <div ref={scrollRef} style={{height: "100%", overflowY: "auto", background: "#fff"}}>
        <div id="nice-rich-text-box" style={{padding: "24px 32px", minHeight: "100%"}}>
          <section id="nice" dangerouslySetInnerHTML={{__html: html}} />
        </div>
      </div>
    );
  },
);

Preview.displayName = "Preview";

export default Preview;
```

注意：原来组件体内 `const [html...` / `timer` / 三个 `useEffect` 的内容**不变**，只是缩进进 forwardRef 回调、`scrollRef` + `useImperativeHandle` 是新增、return 的最外层 div 加 `ref={scrollRef}`。`RENDER_THROTTLE_MS` 常量留在文件顶层不动。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。`import type` 的 Props 调用方（App）下个任务会改，此处单独 tsc 可能因 App 用法暂不报错（App 仍按旧用法）；若报错，继续 Task 6 修复后再统一检查。

---

## Task 6: App 接线同步引擎

App 持有 editorRef（已有）+ 新增 previewRef，useEffect 建立 createScrollSync。

**Files:**
- Modify: `src/App.tsx:1-10`（import）、`:13-15`（ref/state）、新增 useEffect、`:84-90`（Preview 加 ref）

- [ ] **Step 1: 改 import**

`src/App.tsx` — 第 3 行：

```typescript
import Preview from "./components/Preview/Preview.tsx";
```

改为：

```typescript
import Preview, {type PreviewHandle} from "./components/Preview/Preview.tsx";
```

确认第 8 行已有 `import {useStore}`，第 1 行 `import {useEffect, useRef, useState} from "react";`（useEffect/useRef 已在）。顶部加：

```typescript
import {createScrollSync} from "./utils/syncScroll.ts";
```

- [ ] **Step 2: 加 previewRef + 接线 effect**

当前（第 13-15 行）：

```typescript
  const {content, markdownThemeId, useCustom, customCss, setContent} = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);
```

改为：

```typescript
  const {content, markdownThemeId, useCustom, customCss, setContent} = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
```

在「首次加载默认教程内容」那个 useEffect 之后（第 45 行 `}, [setContent]);` 之后）新增同步接线 effect：

```typescript
  // 编辑器 ↔ 预览 双向同步滚动。延迟到下一帧拿 scroller（CodeMirror 挂载后）。
  useEffect(() => {
    const editor = editorRef.current;
    const preview = previewRef.current;
    const editorScroller = editor?.getScroller();
    const previewScroller = preview?.getScroller();
    if (!editor || !editorScroller || !previewScroller) {
      return;
    }
    const sync = createScrollSync({
      editorScroller,
      previewScroller,
      getEditorTopLine: () => editor.getTopLine(),
      scrollEditorToLine: (line) => editor.scrollToLine(line),
    });
    return () => sync.destroy();
  }, []);
```

- [ ] **Step 3: Preview 传 ref**

当前（第 84-90 行）：

```typescript
          <Preview
            content={content}
            markdownThemeId={markdownThemeId}
            useCustom={useCustom}
            customCss={customCss}
          />
```

改为：

```typescript
          <Preview
            ref={previewRef}
            content={content}
            markdownThemeId={markdownThemeId}
            useCustom={useCustom}
            customCss={customCss}
          />
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。

- [ ] **Step 5: 处理「CodeMirror 挂载时机」边界**

若 Step 4 通过但手测时同步不生效，最可能是 effect 跑时 `.cm-scroller` 还没挂载（`getScroller()` 返回 null，effect 直接 return 且不重试）。修复：把接线 effect 改为带一次 `requestAnimationFrame` 重试：

```typescript
  useEffect(() => {
    let sync: {destroy: () => void} | null = null;
    let raf = 0;
    const attach = () => {
      const editor = editorRef.current;
      const preview = previewRef.current;
      const editorScroller = editor?.getScroller();
      const previewScroller = preview?.getScroller();
      if (!editor || !editorScroller || !previewScroller) {
        raf = requestAnimationFrame(attach);
        return;
      }
      sync = createScrollSync({
        editorScroller,
        previewScroller,
        getEditorTopLine: () => editor.getTopLine(),
        scrollEditorToLine: (line) => editor.scrollToLine(line),
      });
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      sync?.destroy();
    };
  }, []);
```

先用 Step 2 的简单版；手测发现不生效再换成本步的重试版。

---

## Task 7: 整体手动验证

**Files:** 无（验证任务）

- [ ] **Step 1: 类型检查全量通过**

Run: `npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 2: 启动并手测**

Run: `npm run dev:web`，打开 `http://localhost:5173`（或自动切换的端口），用默认长文（含标题、段落、大代码块、图片、表格）逐项验证：

- [ ] 滚动编辑器，预览跟随：当前可视源码块对应的渲染块大致出现在预览顶部。
- [ ] 滚动预览，编辑器跟随：反向同样对齐。
- [ ] 快速来回滚动两侧，不出现持续互推抖动（lockUntil 生效）。
- [ ] 大代码块处不严重错位（按行锚点优于按比例的关键场景）。
- [ ] 点「复制到微信」→ 粘到纯文本/F12 看剪贴板，确认无 `data-line` 残留。
- [ ] F12 检查预览 `#nice` 下顶层块带 `data-line`。

- [ ] **Step 3: 更新 PROGRESS.md**

在 PROGRESS.md 适当位置（Phase 4 段落附近）记录：同步滚动已实现，方案=按行锚点 data-line + 双向 + lockUntil 防振荡，默认常开无开关，复制时剥离 data-line。标注验证状态（tsc 通过 + 人工手测结果）。

---

## 实现说明（给执行者）

- **不写自动化测试、不 git commit**：本项目无测试框架、非 git 仓库。每个 Task 的「完成」= 类型检查通过；功能正确性靠 Task 7 人工手测。
- **行号基准统一 0-based**：data-line 用 `token.map[0]`（0-based）；CodeMirror doc.line 是 1-based，getTopLine/scrollToLine 里已做 ±1 转换，务必保持一致。
- **任务顺序**：1→2→3→4→5→6→7。Task 3（引擎）不依赖组件，可与 Task 1/2 并行，但接线（Task 6）必须在 4/5 之后。
