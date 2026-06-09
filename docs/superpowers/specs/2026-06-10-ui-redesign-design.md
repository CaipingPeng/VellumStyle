# UI 重设计：Linear/Figma 式现代工具型界面

**日期**：2026-06-10
**分支**：feature/UI
**范围**：主界面 chrome（顶栏/工具栏/侧栏/状态栏/对话框/面板/Toast）全部重设计。预览区（`#nice` 内容）不动。

## 背景与目标

现状前端是"2015 通用后台"风格：全站硬编码 `#1e6bb8` 蓝、`#d9d9d9` 灰边、`#333` 文字、圆角 4px，每个组件各自复制一份 `btnStyle`（17 处内联 style），无 hover/无动效。Tailwind 已安装但闲置。

**目标**：重塑为 Linear/Figma 式现代工具型审美——精致灰度 + 冷蓝紫强调（极克制）+ 丝滑编排动画。工具型界面的"克制"本身是强设计观点：chrome 应隐形、不抢内容，强调色面积压到最小。

**用户已确认的方向决策**：
- 明暗：浅色优先，CSS 变量预留暗色（本次不做暗色切换）
- 强调色：冷蓝紫 `#5E6AD2`（Linear 同款）
- 动效：丰富编排动画
- 范围：全部一次改完
- 动画实现：Framer Motion（编排）+ CSS transition（微动效）
- 样式方案：启用 Tailwind

## 设计语言

### Token 体系（唯一颜色来源）

全部定义在 `src/styles/globals.css` 的 `:root`，并在 `tailwind.config.js` 映射为 utility。组件不再硬编码任何颜色。

```
强调色
  --accent: #5E6AD2
  --accent-hover: #4F5BC4
  --accent-subtle: rgba(94,106,210, 0.08)   选中/hover 底色
中性灰阶
  --bg: #FFFFFF
  --bg-secondary: #FAFAFB
  --bg-tertiary: #F4F4F6      侧栏/面板背景
  --border: #EBEBEF
  --border-strong: #E0E0E6
文字
  --text: #1A1A1E             近黑，比现状 #333 更深
  --text-secondary: #6B6B76
  --text-muted: #9B9BA6
状态
  --success: #2BA471
  --danger: #E5484D
聚焦环
  --ring: rgba(94,106,210, 0.4)   3px
圆角
  --radius-sm: 6px  --radius: 8px  --radius-lg: 12px
阴影（柔和、低对比，Linear 风）
  --shadow-sm/md/lg
动效
  --ease: cubic-bezier(0.16, 1, 0.3, 1)
  时长 130ms（微动效）/ 160ms（编排）
```

暗色预留：所有变量在 `:root`，未来加 `.dark { ... }` 覆盖即可，组件零改动。

### 字体（有意保持克制）

- UI 正文用系统字体栈（工具型应隐形，不抢内容）——刻意决策，非偷懒。
- 状态栏数字/文档计数用 `font-variant-numeric: tabular-nums`。
- 编辑器代码字体：现状无显式设置（用浏览器默认 monospace），本次不引入字体文件，保持现状。

### 氛围细节（工具型版本，不干扰内容）

- 不用渐变 mesh / 噪点（会干扰内容预览）。
- 卡片/对话框：极柔阴影 + 可选 1px 半透明顶高光。
- 文本选区用 `--accent-subtle`，聚焦环用半透明 accent。
- 侧栏/面板用 `#FAFAFB`/`#F4F4F6` 的微妙分层，弱化生硬边框分割。

### 相对现状的关键视觉变化

边框变浅（`#EBEBEF` 取代 `#d9d9d9`）、圆角加大（6/8px 取代 4px）、文字主色加深为近黑、强调色面积压到最小（只在主按钮/选中/聚焦环）。

## 架构

### 新增基础设施

- `src/styles/globals.css`：扩充 `:root` 全部 Token、selection 样式、聚焦环样式。
- `tailwind.config.js`：`theme.extend` 把 Token 映射成 utility（`bg-accent`、`text-secondary`、`rounded-md`、`shadow-md`、`duration-fast` 等）。**注意 `preflight: false` 必须保留**（防止 Tailwind reset 污染预览区 `#nice`）——意味着组件样式要自给自足，不能依赖 Tailwind 基础 reset。
- `src/components/ui/`（新目录）：复用原子组件
  - `Button.tsx`：primary（`bg-accent` 实心）/ secondary（透明+浅边）/ ghost 变体，含聚焦环、hover、active。
  - `IconButton.tsx`：透明底，hover `bg-tertiary`，active 微缩放，无边框（Linear 风）。
  - `Dialog.tsx`：统一对话框基座（遮罩 + Framer Motion 进出场 + 标题栏 + 关闭按钮 + 底部按钮区）。
  - `Menu.tsx`：下拉菜单基座（Framer Motion fade+scale，菜单项 hover 高亮，点击外部关闭）。
- 新依赖：`framer-motion`。

### 改造文件

- `App.tsx`：顶栏 Navbar（高 50→52、毛玻璃 `bg/80 + backdrop-blur`、极浅底边）、主体、状态栏 Footer。
- `components/Toolbar/SyntaxToolbar.tsx`：改用 `IconButton` + `Menu`。
- `components/DocTree/DocTree.tsx` + `TreeNode.tsx` + `DraftInput.tsx`：背景 `--bg-tertiary`，展开/折叠用 `AnimatePresence` 高度滑动，节点 hover/选中用 `--accent-subtle`，首次加载 stagger 入场。
- `components/StylePanel/StylePanel.tsx` + `controls.tsx`：分层卡片，控件分组用间距，打开/关闭滑入。
- `components/Toast/Toaster.tsx`：`AnimatePresence` 滑入滑出 + stagger，`--success`/`--danger` 左条。
- `components/Settings/SettingsDialog.tsx`、`Import/ImportMarkdownDialog.tsx`、`Publish/PublishDialog.tsx`：改用 `Dialog` 基座。
- `components/Theme/ThemeMenu.tsx`、`ThemePickerDialog.tsx`：菜单用 `Menu`，对话框用 `Dialog`。
- 各按钮包装：`Upload/UploadButton.tsx`、`Import/ImportButton.tsx`、`Copy/CopyButton.tsx`、`Publish/PublishButton.tsx` 改用 `Button`/`IconButton`。

### 迁移策略

1. 先建 Token（globals.css + tailwind.config.js）。
2. 再建 `ui/` 原子组件。
3. 自底向上替换调用点：内联 `style` → Tailwind `className` / 原子组件。
4. 预览区 `Preview.tsx` 渲染的 `#nice` 内容**完全不动**（公众号所见即所得，动了破坏复制兼容性）。
5. 全局 `.cm-*` 编辑器样式保留不动。

### 动效分工

- Framer Motion：对话框进出场（opacity+scale 0.96→1+y 8→0，130ms）、侧栏展开/折叠、列表 stagger、Toast 进出场、菜单 fade+scale。
- CSS transition：按钮 hover/active、聚焦环渐现、选中态切换。

## 验证

- `tsc -b` + `npm run build` 通过。
- 视觉验收由用户打开软件确认。

## 风险

1. **framer-motion 安装可能触发 @types/node 被 prune** → build 挂（已知地雷）。装完立即 `tsc -b` 验证；缺失则补装 `@types/node`。
2. 改 className 时误删 CodeMirror/预览相关全局样式会破坏编辑器/预览 → `.cm-*` 与预览样式保留不动。
3. `preflight: false` 已有意禁用，组件不能依赖 Tailwind reset，样式需自给自足。
4. Tailwind 此前未真正使用，确认 `content` 扫到所有 `.tsx`（现配置已正确）。

## 不做（YAGNI）

- 暗色主题切换（只预留 CSS 变量）。
- 引入字体文件（用系统栈）。
- 预览区 `#nice` 主题样式（不在本次范围）。
