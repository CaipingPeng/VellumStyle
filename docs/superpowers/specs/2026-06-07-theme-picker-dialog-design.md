# 主题选择器对话框（带缩略图预览）设计

日期：2026-06-07

## 目标

把当前的文字下拉式主题切换（`ThemeMenu.tsx` 列主题名）改为一个**不带遮罩的居中浮层**：网格卡片，每张卡片显示主题名 + 该主题**真实渲染**的效果缩略图 +「使用」按钮，底部分页。参考截图 `Snipaste_2026-06-07_00-14-50.png`。

## 关键决策

### 缩略图：真实渲染（选择器改写），不用静态截图

每张缩略图用当前渲染管线 + 该主题 scoped 后的 CSS 现场渲染一段固定示例 Markdown。

**Why：** 截图方案对「用户自己丢进文件夹的 CSS 主题」失效（没有截图），而用户可扩展主题是本桌面成品的核心价值。真实渲染对内置 + 用户主题一视同仁，且改主题样式后缩略图自动更新，零维护。

### 浮层无遮罩、居中

不渲染半透明背景层，只渲染居中白色面板（`position: fixed` 居中 + `box-shadow`），右上角 ✕。点面板外或 ✕ 关闭。

## 技术核心：CSS 选择器改写（scopeCss）

主题 CSS + basic 层都用 `#nice` 命名空间，整页只有一个 `#nice` 和一个生效的全局主题 `<style>`。要在同一弹窗里同时渲染多个不同主题的缩略图，必须把每个缩略图的 CSS 改写到该卡片唯一的 scope class（如 `.tp-elegant`）。

主题 CSS 有两类选择器，都要处理：
- `#nice p` → `.tp-elegant p`（`#nice` 替换为 scope class）
- 裸选择器 `.hljs`、`.hljs-keyword`（无 `#nice` 前缀）→ `.tp-elegant .hljs`（前面补 scope）

basic 层（全是 `#nice`）同样 scope，否则缩略图缺基础样式（段落间距等）会乱。

**实现：** 轻量 CSS 解析。按 `}` 切规则块；每条规则的选择器部分按逗号分隔，对每个 selector：以 `#nice` 开头则替换 `#nice` 为 `.scope`，否则前面加 `.scope `。跳过 `@` 规则（如 `@media`）和空块。

**范围隔离：** scopeCss 只在对话框内使用。复制管线 `converter.ts` 仍读全局四层 `<style>`，零改动。

**TDD：** 先写测试覆盖 `#nice` 前缀替换、裸 `.hljs` 补 scope、逗号多选择器、`@media` 跳过、空块跳过。

## 组件结构

`src/components/Theme/` 下：

- **`scopeCss.ts`** — 选择器改写工具（纯函数，先 TDD）。
- **`sampleContent.ts`** — 固定示例 Markdown：二级标题 + 一段正文 + 一句引用 + 行内代码，体现标题/正文/引用/代码四种样式差异。
- **`ThemeThumbnail.tsx`** — 单卡缩略图：
  - 入参 `scope` class + scoped CSS（basic + 主题）。
  - `useEffect` 注入局部 `<style>`（卸载时删除，带 scope class 不污染全局）。
  - 渲染区 `<div class="tp-xxx">` 内塞 `render(示例Markdown)` 的 HTML。
  - 外层固定尺寸 + `overflow: hidden`，内容 `transform: scale()` 缩小成「缩小版正文」。
- **`ThemePickerDialog.tsx`** — 浮层：
  - 无遮罩居中面板，右上角 ✕，复用 `useClickOutside` 点外关闭。
  - CSS grid 网格，每卡 = 缩略图 + 主题名 + 「使用」按钮，当前主题卡高亮。
  - 底部分页 `‹ 1 2 3 ›`，每页固定 N 张（初定 8）。
  - 角落「打开主题文件夹」按钮：沿用 `openThemesDir` + 重新 `loadAllThemes`。
  - 点「使用」→ `setMarkdownTheme(id)` + 关闭。

`ThemeMenu.tsx` 改为：点「主题 ▾」直接打开 `ThemePickerDialog`，不再文字下拉。

## 不改动

复制管线（`converter.ts`）、全局四层 `<style>`、store 结构全部零改动。scope 改写只活在对话框内。

## 收尾

实现完成后更新 `docs/PROGRESS.md`，记录本次主题选择器对话框的变更。
