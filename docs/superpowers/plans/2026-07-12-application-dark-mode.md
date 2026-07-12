# Application Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加可持久化的亮/暗应用外观，并通过状态栏最右侧的单图标按钮切换，同时隔离文章预览与导出样式。

**Architecture:** 用纯 TypeScript 外观模型负责合法化、持久化预读和根元素同步；Zustand 作为运行期唯一状态源。暗色视觉通过根元素数据属性和语义 CSS token 实现，CodeMirror 用 Compartment 原位重配置，文章画布仍固定使用主题输出背景。

**Tech Stack:** React 18、TypeScript、Zustand、CodeMirror 6、Tailwind CSS、Node test runner、Lucide React

---

### Task 1: 外观领域模型

**Files:**
- Create: `src/appearance/appearanceMode.ts`
- Create: `src/appearance/appearanceMode.test.ts`

- [ ] 写失败测试，覆盖默认值、无效值回退、根属性与 `color-scheme` 同步、持久化 JSON 预读。
- [ ] 运行 `npm test -- --test-name-pattern="外观模式"`，确认因模块缺失失败。
- [ ] 实现 `AppearanceMode`、`sanitizeAppearanceMode`、`readPersistedAppearanceMode`、`applyAppearanceMode`。
- [ ] 重跑聚焦测试，确认通过。
- [ ] 提交 `test/feat: add application appearance model`。

### Task 2: Store 持久化

**Files:**
- Create: `src/store/appearanceState.test.ts`
- Modify: `src/store/index.ts`

- [ ] 写失败的源码契约测试，要求 store 默认亮色、提供 toggle、partialize 持久化并在 merge 时合法化。
- [ ] 运行该测试并确认失败。
- [ ] 向 `EditorState` 和 persist 配置加入外观状态。
- [ ] 重跑测试并确认通过。
- [ ] 提交 `feat: persist application appearance`。

### Task 3: 启动同步与状态栏开关

**Files:**
- Create: `src/components/Appearance/AppearanceToggle.tsx`
- Create: `src/components/Appearance/appearanceToggle.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`

- [ ] 写失败的契约测试，要求 React 挂载前应用持久化模式，并要求状态栏末尾按钮图标、提示、可访问状态和点击切换。
- [ ] 运行聚焦测试并确认失败。
- [ ] 在入口预应用模式，在 App effect 中同步 store；实现并接入 `AppearanceToggle`，放在状态栏最右侧。
- [ ] 重跑测试并确认通过。
- [ ] 提交 `feat: add status bar appearance toggle`。

### Task 4: CodeMirror 原位换色

**Files:**
- Create: `src/components/Editor/MarkdownEditor.appearance.test.ts`
- Modify: `src/components/Editor/MarkdownEditor.tsx`
- Modify: `src/App.tsx`

- [ ] 写失败测试，要求 editor 接收 mode、使用 appearance Compartment 重配置并声明 dark facet，不重新创建编辑器。
- [ ] 运行聚焦测试并确认失败。
- [ ] 增加 `appearanceMode` prop、主题扩展和 effect 重配置。
- [ ] 重跑编辑器相关测试并确认通过。
- [ ] 提交 `feat: adapt editor to application appearance`。

### Task 5: 暗色 tokens 与遗留浅色表面

**Files:**
- Create: `src/styles/appearanceStyle.test.ts`
- Modify: `src/styles/globals.css`
- Modify: `src/components/Import/ImportMarkdownDialog.tsx`
- Modify: `src/components/Publish/PublishDialog.tsx`
- Modify: `src/components/Upload/ImageMaterialPickerDialog.tsx`

- [ ] 写失败测试，要求暗色 token、搜索/图片控件语义表面，并禁止重点对话框继续使用硬编码浅色背景。
- [ ] 运行聚焦测试并确认失败。
- [ ] 增加暗色变量与必要覆盖，将应用 UI 的硬编码浅色类换成语义 token。
- [ ] 重跑样式及相关组件测试并确认通过。
- [ ] 提交 `style: add complete dark application palette`。

### Task 6: 预览隔离与全量验证

**Files:**
- Create: `src/components/Preview/previewAppearanceIsolation.test.ts`
- Verify: `src/components/Preview/Preview.tsx`
- Verify: `src/components/Theme/ThemeThumbnail.tsx`
- Verify: `src/utils/exportArticle.ts`

- [ ] 写回归测试，锁定文章画布和主题缩略图白色输出，并确保导出链路不读取应用外观。
- [ ] 运行聚焦测试并确认现有实现满足或按最小范围修正。
- [ ] 运行 `npm test`。
- [ ] 运行 `npm run build`。
- [ ] 运行 `git diff --check` 与 `git status --short`。
- [ ] 若浏览器工具可用，检查亮/暗两态、对话框、编辑器、预览隔离；否则明确说明未完成视觉工具验收。
- [ ] 提交 `test: protect preview appearance isolation`，并汇总结果。
