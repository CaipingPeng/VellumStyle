# 语法快捷工具栏设计

日期：2026-06-07

## 目标

在编辑器顶部 navbar 加一组 Markdown 语法快捷按钮（加粗、引用、代码块等），点击即插入/包裹对应语法，降低用户记忆 Markdown 语法的成本。对标 Typora / 语雀的工具栏体验。

## 关键决策（已与用户确认）

1. **选区行为**：点击按钮时若有选区，包裹选中文本并保持选中；无选区时插入占位符并选中占位符。
2. **按钮范围**：标准套餐——加粗、斜体、删除线、行内代码、链接、标题（下拉 H1-H4）、无序列表、有序列表、引用、代码块、分割线。
3. **位置**：复用顶部 navbar，左侧放语法按钮组，右侧保留现有全局按钮（上传/导入/主题/设置/复制），中间分隔。navbar 标题缩短为「排版工具」腾出横向空间。
4. **图标库**：`lucide-react`（tree-shakeable，只打包用到的图标）。
5. **标题按钮**：下拉列表，支持 H1-H4 四级。

## 架构

### 新增组件 `src/components/Toolbar/SyntaxToolbar.tsx`

- 接收 `editorRef: RefObject<MarkdownEditorHandle>`（App 已有该 ref）。
- 渲染语法按钮组，按钮 onClick 调用 `editorRef.current` 上的对应方法。
- 标题按钮是一个下拉（点击展开 H1-H4 菜单，选中后调 `prefixLines`）。
- 样式复用 navbar 现有 inline style 风格（`height:30`、`border:1px solid #d9d9d9`、`borderRadius:4`）；语法按钮做成方形图标按钮（约 30×30），编为一组。

### 编辑器新增能力 `MarkdownEditorHandle`

现有 `insertAtCursor(text)` 只能"替换选区为一段文本"，做不到包裹与行首前缀。新增两个方法：

- **`wrapSelection(before, after, placeholder)`** —— 行内语法（加粗/斜体/删除线/行内代码）。
  - 有选区：替换为 `before + 选区 + after`，新选区覆盖原选区文本（不含标记），即结果仍选中文字内容。
  - 无选区：插入 `before + placeholder + after`，选中 placeholder。
- **`prefixLines(prefix)`** —— 行级语法（标题/列表/引用）。
  - 给选区涉及的每一行行首加 `prefix`（如 `## ` / `- ` / `1. ` / `> `）。
  - 无选区时给光标所在行加。
  - 多行选中时逐行加。

块插入（代码块、分割线）复用现有 `insertAtCursor`。

### 链接的特殊分支

链接不走通用 `wrapSelection`：它把选区当成链接文字，结果为 `[选区文字](url)`，光标/选区落在 `url` 占位符上（方便接着粘贴地址）。新增第三个方法：

- **`insertLink()`** —— 有选区：`[选区](链接地址)`，选中 `链接地址`；无选区：`[链接文字](链接地址)`，选中 `链接文字`（先让用户填文字，url 随后）。

> 实现说明：`insertLink` 与 `wrapSelection` 内部可共用一个"插入并指定新选区范围"的底层逻辑，但对外是独立方法，签名清晰。

## 按钮清单

| 按钮 | lucide 图标 | 调用方法 | 插入内容 / 占位符 |
|---|---|---|---|
| 加粗 | `Bold` | `wrapSelection` | `**…**`，占位「加粗文本」 |
| 斜体 | `Italic` | `wrapSelection` | `*…*`，占位「斜体文本」 |
| 删除线 | `Strikethrough` | `wrapSelection` | `~~…~~`，占位「删除文本」 |
| 行内代码 | `Code` | `wrapSelection` | `` `…` ``，占位「代码」 |
| 链接 | `Link` | `insertLink` | `[…](链接地址)` |
| 标题（下拉） | `Heading` | `prefixLines` | H1-H4 → `# `/`## `/`### `/`#### ` |
| 无序列表 | `List` | `prefixLines` | 每行 `- ` |
| 有序列表 | `ListOrdered` | `prefixLines` | 每行 `1. ` |
| 引用 | `Quote` | `prefixLines` | 每行 `> ` |
| 代码块 | `SquareCode` | `insertAtCursor` | 插 ` ```\n选区\n``` `，无选区光标落中间 |
| 分割线 | `Minus` | `insertAtCursor` | 插 `\n---\n` |

（图标名以 lucide-react 实际导出为准，构建时核对。）

## 数据流

用户点击按钮 → SyntaxToolbar 调 `editorRef.current.<method>(...)` → 方法内 `view.dispatch` 改文档并设置新选区 → CodeMirror 触发 onChange → 既有渲染管线（markdown-it → 预览）自动更新。工具栏不持有任何状态（标题下拉的开合除外）。

## 纯逻辑抽离与测试

`wrapSelection` / `prefixLines` / `insertLink` 的文本变换是纯逻辑：输入 `(doc, selectionFrom, selectionTo, 参数)` → 输出 `(newText 片段, newSelectionFrom, newSelectionTo)`。

- 抽成纯函数放 `src/components/Editor/editing.ts`，CodeMirror 的 `view.dispatch` 在 `MarkdownEditor.tsx` 里薄薄包一层调用。
- 单测放 `src/components/Editor/editing.test.ts`，与项目现有 `compileModel.test.ts` / `elementMap.test.ts` 风格一致（tsx 跑）。
- 覆盖：有选区/无选区、单行/多行、行级前缀的多行逐行、链接选区落点。
- CodeMirror dispatch 与下拉交互靠手动验证（启动应用实操）。

## 错误处理

- 所有方法在 `view` 未就绪时直接 return（与现有 `insertAtCursor` 一致）。
- 无其他外部依赖，无需额外错误处理。

## 不做（YAGNI）

- 不做快捷键绑定（Ctrl+B 等）——本次只做按钮，快捷键后续单独提。
- 不做表格/图片/任务列表/脚注按钮——图片已有上传按钮，其余非高频。
- 不做按钮的"激活态高亮"（光标在加粗文本内时 B 高亮）——需解析光标上下文，成本高，后续再说。
