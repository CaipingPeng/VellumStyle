# Phase 2a 主题系统（切换 + 持久化）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户能在多个 markdown 主题、6 种代码主题（含 Mac 三色点）间切换，刷新后保留选择和草稿。

**Architecture:** 沿用 mdnice 四层 `<style>` 注入方案。代码主题做成「基础主题 CSS + Mac 装饰函数」组合，避免 12 个文件。状态用 Zustand persist 持久化到 localStorage。Mac 三色点用纯 CSS（radial-gradient），无外链图片。

**Tech Stack:** React 18 + TypeScript + Zustand + Vite。

**测试约定（重要）：** 本项目无单测框架（Phase 1 即如此），验证手段为 `npx tsc --noEmit` + 浏览器手测。每个任务的 gate 是类型检查通过；最终整体浏览器手测。项目非 git 仓库，**不做 commit 步骤**。

---

## 文件结构

新增：
- `src/themes/code/atom-one-light.ts` `github.ts` `monokai.ts` `vs2015.ts` `xcode.ts` — 各导出一段 `.hljs*` CSS 字符串
- `src/themes/code/mac.ts` — 导出 `macDecoration(bgColor: string): string`
- `src/themes/markdown/elegant.ts` `tech.ts` — 各导出 `#nice` 命名空间 CSS
- `src/components/Theme/ThemeMenu.tsx` — 两个下拉菜单 + Mac 勾选

修改：
- `src/themes/index.ts` — 完整主题列表 + `getMarkdownCss` / `getCodeCss` / 查找辅助
- `src/store/index.ts` — 加 `macStyle` + persist
- `src/components/Preview/Preview.tsx` — code 层改用 `getCodeCss`
- `src/App.tsx` — Navbar 接入 ThemeMenu，footer 读真实主题名

---

## Task 1: 迁移 5 个代码主题文件

**Files:**
- Create: `src/themes/code/atom-one-light.ts` `github.ts` `monokai.ts` `vs2015.ts` `xcode.ts`
- 参考源: `markdown-nice-master/src/template/code/{atomOneLight,github,monokai,vs2015,xcode}.js`

**迁移规则（对每个文件）：**
1. 读取源 `.js` 文件，取其 CSS 正文（去掉顶部 `/* ... */` 版权注释块）。
2. 把 `export default \`...\`;` 改为命名导出 `export const <name> = \`...\`;`，导出名见下表。
3. CSS 内容**逐字保留**（选择器、颜色、空格不改），只去注释块。

| 新文件 | 导出名 |
|---|---|
| atom-one-light.ts | `atomOneLight` |
| github.ts | `github` |
| monokai.ts | `monokai` |
| vs2015.ts | `vs2015` |
| xcode.ts | `xcode` |

- [ ] **Step 1:** 逐个 Read 源文件，按规则写出 5 个新 `.ts` 文件。文件首行加一行注释：`// 代码高亮主题：<名>（迁移自 mdnice <源文件名>）。`
- [ ] **Step 2:** 类型检查

Run: `npx tsc --noEmit`
Expected: 通过（新文件仅导出字符串常量，未被引用也不报错）

---

## Task 2: Mac 装饰函数

**Files:**
- Create: `src/themes/code/mac.ts`

Mac 风格 = 基础代码主题 + 顶部三色点容器。纯 CSS 画点，背景色由参数传入（与各主题代码背景一致）。

- [ ] **Step 1: 写 mac.ts**

```ts
// Mac 风格代码块装饰：顶部三色点 + 圆角阴影。纯 CSS（radial-gradient），无外链图片。
// bgColor 传入当前代码主题的代码块背景色，保证三色点条与代码块同底色。
export function macDecoration(bgColor: string): string {
  return `
#nice .custom {
  border-radius: 5px;
  box-shadow: rgba(0, 0, 0, 0.55) 0px 2px 10px;
}
#nice .custom code {
  padding-top: 15px;
  background: ${bgColor};
  border-radius: 5px;
}
#nice .custom:before {
  content: "";
  display: block;
  height: 30px;
  width: 100%;
  margin-bottom: -7px;
  border-radius: 5px 5px 0 0;
  background-color: ${bgColor};
  background-image:
    radial-gradient(circle, #ff5f56 6px, transparent 6.5px),
    radial-gradient(circle, #ffbd2e 6px, transparent 6.5px),
    radial-gradient(circle, #27c93f 6px, transparent 6.5px);
  background-repeat: no-repeat;
  background-position: 14px 10px, 34px 10px, 54px 10px;
}`;
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过

---

## Task 3: 2 个新 markdown 主题

**Files:**
- Create: `src/themes/markdown/elegant.ts` `tech.ts`

只覆盖视觉层，所有选择器在 `#nice` 下，不改 HTML 结构。

- [ ] **Step 1: 写 elegant.ts（优雅杂志风）**

```ts
// Markdown 主题：优雅杂志（大留白、衬线标题、淡色引用）。
export const elegant = `#nice {
  font-family: Georgia, "Songti SC", serif;
  line-height: 1.9;
  color: #3a3a3a;
}
#nice h1, #nice h2, #nice h3 {
  font-family: Georgia, "Songti SC", serif;
  font-weight: 700;
  color: #222;
}
#nice h1 { font-size: 26px; text-align: center; margin: 1.6em 0 0.8em; }
#nice h2 { font-size: 22px; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
#nice h3 { font-size: 18px; }
#nice p { margin: 1.2em 0; letter-spacing: 0.3px; }
#nice blockquote {
  border-left: 3px solid #d8c7a0;
  background: #faf8f3;
  color: #6b6b6b;
  font-style: italic;
  padding: 0.6em 1em;
}
#nice a { color: #9a7b4f; border-bottom: 1px solid #d8c7a0; }
#nice strong { color: #222; }`;
```

- [ ] **Step 2: 写 tech.ts（科技蓝风）**

```ts
// Markdown 主题：科技蓝（卡片化标题、蓝色强调、紧凑行距）。
export const tech = `#nice {
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.7;
  color: #2c3e50;
}
#nice h1, #nice h2, #nice h3 { font-weight: 600; color: #1a2b3c; }
#nice h1 { font-size: 24px; margin: 1.4em 0 0.7em; }
#nice h2 {
  font-size: 20px;
  background: linear-gradient(90deg, #1e6eee 0%, #5aa9ff 100%);
  color: #fff;
  padding: 0.4em 0.8em;
  border-radius: 6px;
}
#nice h3 { font-size: 17px; border-left: 4px solid #1e6eee; padding-left: 0.5em; }
#nice p { margin: 1em 0; }
#nice blockquote {
  border-left: 4px solid #1e6eee;
  background: #f0f6ff;
  color: #34506b;
  padding: 0.6em 1em;
  border-radius: 0 6px 6px 0;
}
#nice a { color: #1e6eee; }
#nice strong { color: #1e6eee; }
#nice code { color: #c7254e; background: #f0f6ff; padding: 2px 4px; border-radius: 3px; }`;
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过

---

## Task 4: 主题列表与查找/拼装函数

**Files:**
- Modify: `src/themes/index.ts`（整体重写）

把所有主题汇总成列表，提供按 id 取 CSS 的函数（含容错回退）。代码主题带 `codeBg` 字段供 Mac 装饰用色。

代码背景色取值（来自各主题 `.hljs` background）：atomOneDark `#282c34`、atomOneLight `#fafafa`、github `#f8f8f8`、monokai `#272822`、vs2015 `#1E1E1E`、xcode `#fff`。

- [ ] **Step 1: 重写 index.ts**

```ts
import {basic} from "./basic.ts";
import {defaultTheme} from "./markdown/default.ts";
import {elegant} from "./markdown/elegant.ts";
import {tech} from "./markdown/tech.ts";
import {atomOneDark} from "./code/atom-one-dark.ts";
import {atomOneLight} from "./code/atom-one-light.ts";
import {github} from "./code/github.ts";
import {monokai} from "./code/monokai.ts";
import {vs2015} from "./code/vs2015.ts";
import {xcode} from "./code/xcode.ts";
import {macDecoration} from "./code/mac.ts";

export interface ThemeOption {
  id: string;
  name: string;
  css: string;
}

export interface CodeThemeOption extends ThemeOption {
  codeBg: string;
}

// 基础层：永远不变
export {basic};

export const markdownThemes: ThemeOption[] = [
  {id: "default", name: "默认主题", css: defaultTheme},
  {id: "elegant", name: "优雅杂志", css: elegant},
  {id: "tech", name: "科技蓝", css: tech},
];

export const codeThemes: CodeThemeOption[] = [
  {id: "atomOneDark", name: "atom-one-dark", css: atomOneDark, codeBg: "#282c34"},
  {id: "atomOneLight", name: "atom-one-light", css: atomOneLight, codeBg: "#fafafa"},
  {id: "github", name: "github", css: github, codeBg: "#f8f8f8"},
  {id: "monokai", name: "monokai", css: monokai, codeBg: "#272822"},
  {id: "vs2015", name: "vs2015", css: vs2015, codeBg: "#1E1E1E"},
  {id: "xcode", name: "xcode", css: xcode, codeBg: "#fff"},
];

export const defaultMarkdownTheme = markdownThemes[0];
export const defaultCodeTheme = codeThemes[0];

export function getMarkdownTheme(id: string): ThemeOption {
  return markdownThemes.find((t) => t.id === id) ?? defaultMarkdownTheme;
}

export function getCodeTheme(id: string): CodeThemeOption {
  return codeThemes.find((t) => t.id === id) ?? defaultCodeTheme;
}

export function getMarkdownCss(id: string): string {
  return getMarkdownTheme(id).css;
}

export function getCodeCss(id: string, macStyle: boolean): string {
  const theme = getCodeTheme(id);
  return macStyle ? theme.css + "\n" + macDecoration(theme.codeBg) : theme.css;
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过

---

## Task 5: store 加 macStyle + persist

**Files:**
- Modify: `src/store/index.ts`（整体重写）

- [ ] **Step 1: 重写 store**

```ts
import {create} from "zustand";
import {persist} from "zustand/middleware";
import {defaultMarkdownTheme, defaultCodeTheme} from "../themes/index.ts";

export interface EditorState {
  content: string;
  markdownThemeId: string;
  codeThemeId: string;
  macStyle: boolean;
  setContent: (content: string) => void;
  setMarkdownTheme: (id: string) => void;
  setCodeTheme: (id: string) => void;
  setMacStyle: (mac: boolean) => void;
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      codeThemeId: defaultCodeTheme.id,
      macStyle: false,
      setContent: (content) => set({content}),
      setMarkdownTheme: (markdownThemeId) => set({markdownThemeId}),
      setCodeTheme: (codeThemeId) => set({codeThemeId}),
      setMacStyle: (macStyle) => set({macStyle}),
    }),
    {
      name: "vellumstyle",
      partialize: (s) => ({
        content: s.content,
        markdownThemeId: s.markdownThemeId,
        codeThemeId: s.codeThemeId,
        macStyle: s.macStyle,
      }),
    },
  ),
);
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过

---

## Task 6: Preview 使用 getCodeCss

**Files:**
- Modify: `src/components/Preview/Preview.tsx`

先 Read 当前 Preview.tsx 确认它如何拿到 code CSS（当前用 `markdownThemeId` / `codeThemeId` props 注入四层）。

- [ ] **Step 1:** 让 Preview 接收 `macStyle` 并用 `getCodeCss(codeThemeId, macStyle)` 注入 code 层，用 `getMarkdownCss(markdownThemeId)` 注入 markdown 层。
  - 给组件 props 加 `macStyle: boolean`。
  - 从 `../../themes/index.ts` import `getMarkdownCss, getCodeCss`。
  - code 层 `replaceStyle(STYLE_IDS.code, getCodeCss(codeThemeId, macStyle))`，markdown 层 `replaceStyle(STYLE_IDS.markdown, getMarkdownCss(markdownThemeId))`。
  - 注入的 `useEffect` 依赖数组加入 `macStyle`。
- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过（App 尚未传 macStyle，会报缺 prop —— 下一任务修；若本步报错属预期，Task 8 修复后整体通过）

> 注：为避免中间态报错，Task 6 与 Task 7、8 连续完成后再统一跑类型检查。

---

## Task 7: ThemeMenu 组件

**Files:**
- Create: `src/components/Theme/ThemeMenu.tsx`

两个自定义下拉（按钮 + 绝对定位面板 + 点击外部关闭），代码主题面板底部带 Mac 勾选。

- [ ] **Step 1: 写 ThemeMenu.tsx**

```tsx
import {useState, useRef, useEffect} from "react";
import {markdownThemes, codeThemes} from "../../themes/index.ts";
import {useStore} from "../../store/index.ts";

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

const btnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #e8e8e8",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 36,
  left: 0,
  minWidth: 160,
  background: "#fff",
  border: "1px solid #e8e8e8",
  borderRadius: 4,
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  zIndex: 100,
  padding: "4px 0",
};

const itemStyle: React.CSSProperties = {
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 13,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export default function ThemeMenu() {
  const {markdownThemeId, codeThemeId, macStyle, setMarkdownTheme, setCodeTheme, setMacStyle} =
    useStore();
  const [openMenu, setOpenMenu] = useState<"md" | "code" | null>(null);
  const mdRef = useClickOutside(() => setOpenMenu((m) => (m === "md" ? null : m)));
  const codeRef = useClickOutside(() => setOpenMenu((m) => (m === "code" ? null : m)));

  return (
    <div style={{display: "flex", gap: 8}}>
      {/* Markdown 主题 */}
      <div ref={mdRef} style={{position: "relative"}}>
        <button style={btnStyle} onClick={() => setOpenMenu(openMenu === "md" ? null : "md")}>
          主题 ▾
        </button>
        {openMenu === "md" && (
          <div style={panelStyle}>
            {markdownThemes.map((t) => (
              <div
                key={t.id}
                style={{...itemStyle, background: t.id === markdownThemeId ? "#f0f6ff" : "#fff"}}
                onClick={() => {
                  setMarkdownTheme(t.id);
                  setOpenMenu(null);
                }}
              >
                <span>{t.name}</span>
                {t.id === markdownThemeId && <span style={{color: "#1e6eee"}}>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 代码主题 */}
      <div ref={codeRef} style={{position: "relative"}}>
        <button style={btnStyle} onClick={() => setOpenMenu(openMenu === "code" ? null : "code")}>
          代码主题 ▾
        </button>
        {openMenu === "code" && (
          <div style={panelStyle}>
            {codeThemes.map((t) => (
              <div
                key={t.id}
                style={{...itemStyle, background: t.id === codeThemeId ? "#f0f6ff" : "#fff"}}
                onClick={() => {
                  setCodeTheme(t.id);
                  setOpenMenu(null);
                }}
              >
                <span>{t.name}</span>
                {t.id === codeThemeId && <span style={{color: "#1e6eee"}}>✓</span>}
              </div>
            ))}
            <div style={{borderTop: "1px solid #eee", marginTop: 4}}>
              <div style={itemStyle} onClick={() => setMacStyle(!macStyle)}>
                <span>Mac 风格</span>
                <span style={{color: macStyle ? "#1e6eee" : "#ccc"}}>{macStyle ? "✓" : "○"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

> 说明：两个面板共用一个 `openMenu` 状态，点其一自动关另一。`useClickOutside` 各自只在自己打开时关自己。

- [ ] **Step 2:** 暂不单独跑类型检查（App 接入后统一跑）

---

## Task 8: App 接入 ThemeMenu + footer 真实主题名

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1:** 修改 App.tsx：
  - import `ThemeMenu` from `./components/Theme/ThemeMenu.tsx`，import `getMarkdownTheme` from `./themes/index.ts`。
  - 从 store 解构出 `macStyle`。
  - Navbar 标题与 CopyButton 之间放 `<ThemeMenu />`（用一个 `display:flex; gap` 容器把 ThemeMenu 和 CopyButton 放右侧）。
  - `<Preview ... macStyle={macStyle} />` 传入 macStyle。
  - footer 主题名改为 `主题 {getMarkdownTheme(markdownThemeId).name}`。
  - 首屏 content 加载逻辑改为：仅当 `content` 为空时才 fetch `/content.md`（persist 已恢复的草稿不被覆盖）。当前 effect 依赖 setContent，需改为读 store 当前 content 判断；用 `useStore.getState().content` 在 effect 内判断，空才 fetch。

- [ ] **Step 2: 整体类型检查**

Run: `npx tsc --noEmit`
Expected: 通过（Task 6/7/8 此时齐了，无缺 prop 报错）

---

## Task 9: 浏览器手测

- [ ] **Step 1: 启动**

Run: `npm run dev:web`
打开 http://localhost:5173

- [ ] **Step 2: 功能验证**
  - 切换 3 个 markdown 主题，预览实时变化（标题/引用/链接样式变）。
  - 切换 6 个代码主题，代码块配色实时变化。
  - 勾「Mac 风格」，代码块顶部出现红黄绿三点 + 圆角阴影；取消后消失。
  - footer 主题名随 markdown 主题切换更新。
  - 点「复制到微信」，确认 Mac 三点（纯 CSS `:before`）经 juice 内联后仍在（粘到微信编辑器查看；juice 已开 inlinePseudoElements）。
  - 改动正文，刷新页面：草稿、当前 markdown 主题、代码主题、Mac 开关全部保留。

- [ ] **Step 3: 更新 PROGRESS.md**
  把 Phase 2a 标记完成，记录踩坑（若有）。

---

## Self-Review

- **Spec 覆盖**：6 代码主题（T1+已有）✓、Mac 风格组合（T2）✓、2 新 markdown 主题（T3）✓、列表+拼装函数（T4）✓、persist 持久化含草稿（T5）✓、Preview 注入（T6）✓、Navbar 下拉 UI + Mac 勾选（T7/T8）✓、footer 真实主题名（T8）✓、纯 CSS 三色点替代外链 PNG（T2）✓。自定义 CSS 编辑器明确不在本轮 ✓。
- **占位符**：无 TBD/TODO；T1 用「读源文件 + 明确 transform 规则」而非空泛描述（源 CSS 逐字迁移，列出导出名映射）。
- **类型一致**：`getMarkdownCss`/`getCodeCss`/`getMarkdownTheme`/`getCodeTheme`（T4）与 Preview（T6）、App（T8）、ThemeMenu（T7）引用一致；`macStyle`/`setMacStyle`（T5）与 ThemeMenu、App 一致；`CodeThemeOption.codeBg`（T4）与 macDecoration（T2）一致。
