# 同步滚动设计

> 项目：微信公众号排版工具
> 日期：2026-05-30
> 范围：编辑器 ↔ 预览的按行锚点双向同步滚动，默认常开、无开关。

## 目标

编辑器和预览左右分栏时，滚动一侧让另一侧跟随到内容对应位置，方便长文对照排版。

## 关键决策（已和用户确认）

- **按行锚点同步（精准）**，非按比例。理由：代码块在编辑器占几行、在预览渲染成一大块，按比例在长文会明显错位；按行号对齐才准。
- **双向同步**：滚编辑器→预览跟，滚预览→编辑器跟。用"最近哪边在主动滚"抢占主动权，避免互推振荡。
- **默认常开，不加开关**：符合精简偏好，不引入 store 状态和 UI。

## 架构

四个改动点，互相边界清晰：

### 1. 渲染管线注入 `data-line`（`src/markdown/parser.ts`）

加一个 markdown-it `core` ruler 规则，遍历**顶层** block token，把 `token.map[0]`（源码起始行，0-based）写到对应开标签的 `data-line` 属性。

- markdown-it 的 block token 本就带 `map: [startLine, endLine]`，无需改现有 12 个插件。
- 只标顶层块（`token.level === 0` 且 `token.map` 存在的 `*_open` / 自闭合 token），嵌套块不标，避免锚点过密。
- 规则插在渲染前（`core` 阶段末尾），不影响插件链顺序。

**输入**：已解析的 token 流。**输出**：带 `data-line` 的 token。**依赖**：markdown-it core API。

### 2. 复制时剥离 `data-line`（`src/markdown/converter.ts`）

`solveHtml` 读 `box.innerHTML` 后、juice 内联前，去掉所有 `data-line` 属性，保证粘进微信的 HTML 干净。

- 与现有"还原代理图片链"是同一处理点，新增一步正则/DOM 清理。
- data-line 本身是无害自定义属性，剥离只为产出整洁。

### 3. 同步引擎（新建 `src/utils/syncScroll.ts`）

纯函数 + 一个 `createScrollSync(editorScroller, previewScroller, getEditorTopLine, scrollEditorToLine)` 工厂，返回 `{ destroy }`。

**编辑器 → 预览**：
1. 取编辑器顶部可视行号 `line`。
2. 在预览 `previewScroller` 内查 `[data-line]` 元素，找到 `data-line ≤ line` 的最后一个 `prev` 和其后第一个 `next`。
3. 在 `prev`/`next` 的 `offsetTop` 与各自 `data-line` 之间按 `line` 线性插值，得到预览目标 `scrollTop`，设置之。

**预览 → 编辑器**：
1. 取预览顶部 `scrollTop`，找到首个 `offsetTop ≥ scrollTop` 元素的前一个作为 `prev`、它作 `next`，按 `scrollTop` 在两者间反插值出目标 `line`。
2. 调 `scrollEditorToLine(line)`（CodeMirror `view.dispatch({ effects: EditorView.scrollIntoView(...) })` 或直接设 `.cm-scroller` scrollTop）。

**防振荡**：
- 模块级 `lockUntil: number` 时间戳。主动方滚动触发同步时，设 `lockUntil = now + 80ms` 并写被动方 scrollTop。
- 两侧 scroll 事件处理器开头检查 `now < lockUntil` 则直接 return（说明本次滚动是程序触发的回弹，不当主动方）。
- 这样只有用户真正手动滚的一侧当主动方，程序设置引起的滚动不回传。

**输入**：两个滚动容器 + 编辑器行号读写回调。**输出**：副作用（设置 scrollTop）。**依赖**：DOM scroll 事件、`requestAnimationFrame` 节流。

### 4. 接线（`src/App.tsx` + 两组件）

- `MarkdownEditor`：`MarkdownEditorHandle` 增加 `getScroller(): HTMLElement | null`（返回 `.cm-scroller`）、`getTopLine(): number`、`scrollToLine(line: number): void`。基于已有的 `cmRef.current.view`。
- `Preview`：用 `forwardRef` 暴露外层滚动 div 的 ref（`getScroller(): HTMLElement | null`）。
- `App`：`useEffect` 里拿两个 ref，调 `createScrollSync(...)` 建立双向监听；effect cleanup 调 `destroy()` 解绑。依赖项为空数组（只建一次），ref 稳定。

## 数据流

```
用户滚编辑器
  → cm scroll 事件 → getTopLine() → 预览查 data-line 插值 → 设预览 scrollTop（lockUntil 锁住预览回传）

用户滚预览
  → div scroll 事件 → 顶部 scrollTop → 反查 data-line 得 line → scrollToLine() → 设 cm scrollTop（lockUntil 锁住编辑器回传）
```

## 错误与边界处理

- 预览无任何 `[data-line]`（空文档）：同步函数查不到锚点，直接 return，不报错。
- 编辑器或预览 scroller 尚未挂载（ref 为 null）：`createScrollSync` 跳过绑定。
- `line` 超出最后一个锚点：钳到最后一个元素的 offsetTop（滚到底）。
- 渲染节流 100ms 内 DOM 未更新：同步读的是当前 DOM 锚点，落后一帧可接受，下次滚动自纠正。

## 测试

主要靠人工浏览器手测（滚动是交互行为，单测价值低）：
- 长文（含大代码块、图片、表格）滚编辑器，预览块顶部大致对齐当前可视源码。
- 反向滚预览，编辑器跟随。
- 快速来回滚不出现互推抖动。
- `npx tsc --noEmit` 通过。
- 复制到微信，检查粘贴的 HTML 无 `data-line` 残留。

## 不做（YAGNI）

- 开关 UI / store 持久化（默认常开）。
- 平滑动画补间（直接设 scrollTop，瞬时对齐即可）。
- 字符级/像素级精确（行级足够）。
