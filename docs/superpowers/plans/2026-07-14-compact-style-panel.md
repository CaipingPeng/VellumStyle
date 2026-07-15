# Compact Style Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将属性侧栏改成已确认的平衡网格布局，让同类短参数并排编辑，同时保持所有数据与保存行为不变。

**Architecture:** 仅在现有 `StylePanel.tsx` 中增加展示分类和 Grid 渲染，在 `controls.tsx` 中收紧输入控件。布局判断不改变 `StyleItem`、path 或 store 数据流。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、Node test runner。

---

### Task 1: 添加布局回归测试

**Files:**
- Create: `src/components/StylePanel/StylePanel.layout.test.ts`
- Test: `src/components/StylePanel/StylePanel.layout.test.ts`

- [ ] 写源结构测试，要求存在三列文字网格、四列方向网格、宽字段跨度和整行回退。
- [ ] 运行 `npm test -- src/components/StylePanel/StylePanel.layout.test.ts`，确认测试因布局尚未实现而失败。

### Task 2: 实现平衡网格布局

**Files:**
- Modify: `src/components/StylePanel/StylePanel.tsx`
- Modify: `src/components/StylePanel/controls.tsx`
- Test: `src/components/StylePanel/StylePanel.layout.test.ts`
- Test: `src/components/StylePanel/controls.test.ts`

- [ ] 在 `StylePanel.tsx` 内增加仅用于展示的字段分类常量或函数。
- [ ] 将顶层叶子字段按紧凑 Grid 排列，宽控件和未知控件使用安全跨度。
- [ ] 将 `marginPadding` 的方向字段按上、右、下、左渲染为四列。
- [ ] 收紧标签、区块间距和数值控件单位区域，保证 392px 面板内可编辑。
- [ ] 运行布局测试和 controls 测试，确认通过。

### Task 3: 回归验证

**Files:**
- Verify only

- [ ] 运行 `npm test`。
- [ ] 运行 `npm run build`。
- [ ] 检查 `git diff`，确认未修改 store、主题模型、保存流程和 `src-tauri`。
- [ ] 删除 `.superpowers/` 临时预览目录，避免把会话产物留在工作区。
