# CodeMirror 亮暗语法高亮设计

日期：2026-07-12
状态：已确认

## 背景

VellumStyle 已支持应用亮色与暗色模式。编辑器通过 `EditorView.theme` 和 `Compartment` 原位切换背景、文字、光标、选区与活动行，同时使用 `theme: "none"`，避免 `@uiw/react-codemirror` 的整套主题覆盖工作区语义色。

当前实现没有显式提供语法高亮主题，因此 `basicSetup` 始终回退到 CodeMirror 的 `defaultHighlightStyle`。该样式只面向亮色背景，其中 URL 与代码围栏信息串使用 `#219`。在暗色编辑器背景上，这些深紫色内容对比度不足。

## 目标

- 亮色编辑器继续使用 CodeMirror 官方亮色语法高亮。
- 暗色编辑器使用 CodeMirror 官方 One Dark 语法高亮。
- 统一覆盖 Markdown 与围栏内嵌语言的全部语义标签，不逐项修补颜色。
- 保留 VellumStyle 自己的编辑器背景、光标、选区、活动行和搜索面板样式。
- 亮暗切换继续原位重配置，不重建 CodeMirror，不丢失文档、选区、滚动位置或输入状态。
- 不影响文章预览、Markdown 主题及导出结果。

## 方案

扩展现有 `appearanceCompartment` 的职责，使其同时包含：

1. `EditorView.theme(...)`：负责 VellumStyle 编辑器外壳。
2. `syntaxHighlighting(...)`：负责 CodeMirror 语法配色。

配色映射：

| 应用外观 | 语法高亮 |
| --- | --- |
| `light` | `defaultHighlightStyle` |
| `dark` | `oneDarkHighlightStyle` |

`oneDarkHighlightStyle` 从 `@uiw/react-codemirror` 的公开导出获取。该包已经公开转出 CodeMirror 官方 `@codemirror/theme-one-dark` 能力，无需依赖未声明的传递依赖。

继续保留 `theme: "none"`。不启用完整 `oneDark` 或 `theme: "dark"`，因为整套主题会接管背景、面板、选区等表面样式，与应用工作区语义色产生竞争。

## 数据流

1. `App` 将 `appearanceMode` 传给 `MarkdownEditor`。
2. 编辑器首次创建时，`appearanceCompartment` 使用初始模式生成外观扩展和语法高亮扩展。
3. 模式变化时，仅派发 `appearanceCompartment.reconfigure(...)`。
4. CodeMirror 重新计算主题与语法装饰，但保留现有 `EditorState` 和 `EditorView`。

## 测试

采用测试先行：

1. 先增加失败的回归测试，要求编辑器显式使用 `syntaxHighlighting`。
2. 测试亮色映射到 `defaultHighlightStyle`，暗色映射到 `oneDarkHighlightStyle`。
3. 测试语法高亮和外壳主题位于同一个 `appearanceCompartment`，亮暗切换仍使用 `reconfigure`。
4. 保留 `theme: "none"` 的回归约束，防止整套 UIW 主题再次覆盖工作区表面。
5. 运行编辑器相关测试、完整测试和生产构建。
6. 在可用浏览器中检查链接、代码围栏信息串以及常见 Markdown/代码语法的计算颜色；若浏览器运行时不可用，明确记录限制，并使用 CodeMirror DOM 渲染检查作为替代证据。

## 非目标

- 不让用户选择额外的编辑器主题。
- 不将 Markdown 文章预览主题用于源码编辑器。
- 不自建一套需要长期维护的 Lezer 标签颜色表。
- 不修改文章预览和导出配色。
