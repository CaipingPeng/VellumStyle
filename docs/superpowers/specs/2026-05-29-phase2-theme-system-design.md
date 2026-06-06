# Phase 2a — 主题系统（切换 + 持久化）设计

> 项目：微信公众号排版工具（mdnice 重写）
> 日期：2026-05-29
> 范围：Phase 2 的「切换 + 持久化」子集。自定义 CSS 编辑器（CodeMirror CSS 模式）**不在本轮**，留待下一轮。

## 1. 目标

让用户能在多个 markdown 主题、6 种代码主题（含 Mac 风格三色点装饰）之间切换，并在刷新后保留选择（含正在编辑的草稿）。

非目标（本轮明确不做）：
- 自定义 CSS 编辑器
- AI 主题生成
- 远程主题 API

## 2. 资产迁移（mdnice JS → TS）

### 2.1 代码主题（6 种）
从 `markdown-nice-master/src/template/code/*.js` 改写为 `src/themes/code/*.ts`：

| 文件 | id | 显示名 |
|---|---|---|
| atom-one-dark.ts（已有） | `atomOneDark` | atom-one-dark |
| atom-one-light.ts | `atomOneLight` | atom-one-light |
| github.ts | `github` | github |
| monokai.ts | `monokai` | monokai |
| vs2015.ts | `vs2015` | vs2015 |
| xcode.ts | `xcode` | xcode |

每个文件导出一段 CSS 字符串，选择器为 `.hljs*`（无 `#nice` 前缀，与现有 `atom-one-dark.ts` 一致）。去掉 mdnice 文件头部的版权注释块以减小体积（可选保留一行来源说明）。

### 2.2 Mac 风格（组合，不是 12 个独立主题）
Mac 变体 = 普通代码主题 CSS + 一段三色点装饰。对比 `macAtomOneDark.js` 与 `atomOneDark.js`，差异只是追加：

```css
#nice .custom code { padding-top: 15px; background: <主题代码背景色>; border-radius: 5px; }
#nice .custom:before { /* 顶部三色点 + 主题背景色 */ }
#nice .custom { border-radius: 5px; box-shadow: rgba(0,0,0,.55) 0 2px 10px; }
```

**关键决策**：不迁移 6 个 macCode 文件。改为 `src/themes/code/mac.ts` 导出 `macDecoration(bgColor: string): string` 函数，运行时拼到基础代码主题后面。每个代码主题在列表里附带自己的 `codeBg` 字段（代码块背景色）供 Mac 装饰用色。

**避免外部依赖**：mdnice 的三色点用远程 PNG（`https://my-wechat.mdnice.com/point.png`）。本项目改为纯 CSS 实现——用 `radial-gradient` 在 `:before` 里画三个圆点（红 #ff5f56 / 黄 #ffbd2e / 绿 #27c93f），无外链、复制到微信后也不依赖外部图床。

### 2.3 Markdown 主题（default + 2 个新增）
`src/themes/markdown/*.ts`，CSS 均在 `#nice` 命名空间下：

| 文件 | id | 显示名 | 风格 |
|---|---|---|---|
| default.ts（已有） | `default` | 默认主题 | 靠 basic 层，空/极简 |
| elegant.ts | `elegant` | 优雅杂志 | 大留白、衬线标题、淡色引用 |
| tech.ts | `tech` | 科技蓝 | 卡片化标题、蓝色强调、紧凑行距 |

新增主题只覆盖视觉层（标题、引用、链接、强调色、行距等），不改 HTML 结构。

## 3. 状态层（store + 持久化）

`src/store/index.ts` 改造：

```ts
interface EditorState {
  content: string;
  markdownThemeId: string;
  codeThemeId: string;      // 基础代码主题 id
  macStyle: boolean;        // 是否叠加 Mac 三色点
  setContent, setMarkdownTheme, setCodeTheme, setMacStyle;
}
```

- 用 Zustand `persist` middleware，localStorage key = `wechat-md-editor`。
- 持久化字段：`content` / `markdownThemeId` / `codeThemeId` / `macStyle`。
- `content` 持久化后，App 首屏逻辑改为：localStorage 有草稿则用草稿，否则才 fetch `/content.md`。
- 主题 id 容错：persist 恢复的 id 若不在当前列表（主题被删/改名），回退到默认。

## 4. 注入逻辑

- `src/themes/index.ts` 扩为完整列表，新增：
  - `markdownThemes: ThemeOption[]`（3 个）
  - `codeThemes: (ThemeOption & { codeBg: string })[]`（6 个）
  - `getMarkdownCss(id): string`、`getCodeCss(id, macStyle): string`（含容错回退）
- `src/utils/style.ts` 的 `replaceStyle` 不变。
- `Preview.tsx`：markdown 层用 `getMarkdownCss(markdownThemeId)`，code 层用 `getCodeCss(codeThemeId, macStyle)`。其余三层注入逻辑不变。

## 5. UI（Navbar 自定义下拉菜单）

新增 `src/components/Theme/ThemeMenu.tsx`：
- 两个下拉按钮：「主题」（选 markdown 主题）、「代码主题」（选 code 主题）。
- 「代码主题」下拉底部加一个「Mac 风格」勾选项，切换 `macStyle`。
- 自定义下拉（按钮 + 绝对定位面板 + 点击外部关闭），不引第三方组件库。
- 当前选中项打勾高亮。

`App.tsx`：
- Navbar 放入 `<ThemeMenu />`（在标题与 CopyButton 之间）。
- Footer 主题名改为读真实当前 markdown 主题名（`getMarkdownTheme(id).name`）。

## 6. 验证

- `npx tsc --noEmit` 通过。
- `npm run dev:web`：逐个切 markdown 主题、逐个切代码主题、勾/取消 Mac 风格，预览实时变化。
- 复制到微信验证 Mac 三色点用纯 CSS 内联后仍显示（juice 内联 `:before`，已开 `inlinePseudoElements`）。
- 刷新页面，确认主题选择、Mac 开关、草稿内容都保留。

## 7. 产出文件

新增：`src/themes/code/{atom-one-light,github,monokai,vs2015,xcode}.ts`、`src/themes/code/mac.ts`、`src/themes/markdown/{elegant,tech}.ts`、`src/components/Theme/ThemeMenu.tsx`
修改：`src/themes/index.ts`、`src/store/index.ts`、`src/components/Preview/Preview.tsx`、`src/App.tsx`
