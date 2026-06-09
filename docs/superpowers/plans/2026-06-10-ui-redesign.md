# UI 重设计实现计划（Linear/Figma 式现代工具型）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主界面 chrome 从"2015 通用后台"重塑为 Linear/Figma 式现代工具型审美（精致灰阶 + 冷蓝紫 #5E6AD2 强调 + Framer Motion 编排动画），预览区不动。

**Architecture:** 先建 CSS 变量 Token 体系（globals.css + tailwind.config.js 映射），再建 `src/components/ui/` 原子组件（Button/IconButton/Dialog/Menu）消灭 17 处重复 btnStyle，最后自底向上把各组件内联 style 迁到 Tailwind className + 原子组件，编排动画用 Framer Motion。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS 3（preflight 已禁用）+ framer-motion + lucide-react。

**验证说明：** 纯视觉重设计，无法用单元测试断言外观。每个任务的验证 = `npx tsc -b` 通过 + 涉及纯逻辑处加测试。最终视觉验收由用户打开软件确认。

**Spec：** `docs/superpowers/specs/2026-06-10-ui-redesign-design.md`

---

## Task 1: 安装 framer-motion 并验证 build 不被地雷击中

**Files:**
- Modify: `package.json`（自动）

- [ ] **Step 1: 安装 framer-motion**

Run: `npm install framer-motion`

- [ ] **Step 2: 立即验证类型检查（@types/node 地雷探测）**

Run: `npx tsc -b`
Expected: 无报错。若出现 `Cannot find module 'node:*'` 或 node 内置模块报错，执行：`npm install -D @types/node` 后重跑 `npx tsc -b`。

- [ ] **Step 3: 验证 build**

Run: `npm run build`
Expected: build 成功。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: 引入 framer-motion 用于编排动画"
```

---

## Task 2: 建立 Token 体系（globals.css）

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: 写入 :root 变量、selection、聚焦环**

替换 `src/styles/globals.css` 全文为：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --accent: #5e6ad2;
  --accent-hover: #4f5bc4;
  --accent-subtle: rgba(94, 106, 210, 0.08);

  --bg: #ffffff;
  --bg-secondary: #fafafb;
  --bg-tertiary: #f4f4f6;

  --border: #ebebef;
  --border-strong: #e0e0e6;

  --text: #1a1a1e;
  --text-secondary: #6b6b76;
  --text-muted: #9b9ba6;

  --success: #2ba471;
  --danger: #e5484d;

  --ring: rgba(94, 106, 210, 0.4);

  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;

  --shadow-sm: 0 1px 2px rgba(20, 20, 30, 0.06);
  --shadow-md: 0 4px 16px rgba(20, 20, 30, 0.1);
  --shadow-lg: 0 12px 40px rgba(20, 20, 30, 0.16);

  --ease: cubic-bezier(0.16, 1, 0.3, 1);
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: var(--text);
  background: var(--bg);
}

::selection {
  background: var(--accent-subtle);
}

/* 编辑器：给文字留内边距，避免贴边显示不全。聚焦边框与内容高度见组件内 theme。 */
.cm-editor .cm-content {
  padding: 12px 16px;
}
```

- [ ] **Step 2: 验证类型检查与 build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat: 建立 CSS 变量 Token 体系（冷蓝紫 + 精致灰阶）"
```

---

## Task 3: Tailwind 映射 Token 为 utility

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: 扩充 theme.extend，保留 preflight: false**

替换 `tailwind.config.js` 全文为：

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // 预览区 HTML 由 markdown-it 生成、用注入的主题 CSS 渲染，
  // 不能被 Tailwind 的 preflight reset 影响，因此禁用 preflight。
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          subtle: "var(--accent-subtle)",
        },
        bg: {
          DEFAULT: "var(--bg)",
          secondary: "var(--bg-secondary)",
          tertiary: "var(--bg-tertiary)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        text: {
          DEFAULT: "var(--text)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        success: "var(--success)",
        danger: "var(--danger)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        smooth: "var(--ease)",
      },
      transitionDuration: {
        fast: "130ms",
        DEFAULT: "160ms",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: 验证 build（确认 Tailwind 配置无语法错误且能编译 utility）**

Run: `npm run build`
Expected: 通过，无 Tailwind 警告。

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "feat: Tailwind 映射 Token 为 utility class"
```

---

## Task 4: 原子组件 Button + IconButton

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/IconButton.tsx`

- [ ] **Step 1: 写 Button.tsx**

```tsx
import type {ButtonHTMLAttributes, ReactNode} from "react";

type Variant = "primary" | "secondary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-sm px-3 text-[13px] font-medium " +
  "cursor-pointer transition-colors duration-fast ease-smooth outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:cursor-default disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white border-0 hover:bg-accent-hover",
  secondary: "bg-bg text-text border border-border hover:bg-bg-tertiary",
  ghost: "bg-transparent text-text border-0 hover:bg-bg-tertiary",
};

export default function Button({variant = "secondary", className = "", children, ...rest}: Props) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 2: 写 IconButton.tsx**

```tsx
import type {ButtonHTMLAttributes, ReactNode} from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex h-[30px] w-[30px] items-center justify-center rounded-sm border-0 " +
  "cursor-pointer transition-colors duration-fast ease-smooth outline-none " +
  "focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "active:scale-95 disabled:cursor-default disabled:opacity-50";

export default function IconButton({active = false, className = "", children, ...rest}: Props) {
  const tone = active ? "bg-accent-subtle text-accent" : "bg-transparent text-text hover:bg-bg-tertiary";
  return (
    <button type="button" className={`${base} ${tone} ${className}`} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: 验证类型检查**

Run: `npx tsc -b`
Expected: 通过（注意：未被引用的新组件 tsc 不报错；若开了 noUnusedLocals 仅在 import 处才触发，此处是 export，安全）。

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/IconButton.tsx
git commit -m "feat: 新增 Button/IconButton 原子组件"
```

---

## Task 5: 原子组件 Dialog（Framer Motion 进出场）

**Files:**
- Create: `src/components/ui/Dialog.tsx`

- [ ] **Step 1: 写 Dialog.tsx**

```tsx
import type {ReactNode} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {X} from "lucide-react";

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  /** 点遮罩是否关闭，默认 true。发布对话框传 false（已知需求）。 */
  closeOnOverlay?: boolean;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Dialog({open, title, onClose, closeOnOverlay = true, width = 440, children, footer}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{background: "rgba(20,20,30,0.4)", backdropFilter: "blur(2px)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.13}}
          onClick={closeOnOverlay ? onClose : undefined}
        >
          <motion.div
            className="overflow-hidden rounded-lg bg-bg shadow-lg"
            style={{width, maxWidth: "90%"}}
            initial={{opacity: 0, scale: 0.96, y: 8}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 8}}
            transition={{duration: 0.13, ease: [0.16, 1, 0.3, 1]}}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-11 items-center justify-between border-b border-border px-4 text-sm font-semibold text-text">
              <span>{title}</span>
              <button
                type="button"
                onClick={onClose}
                title="关闭"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 px-4 pb-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc -b`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Dialog.tsx
git commit -m "feat: 新增 Dialog 原子组件（Framer Motion 进出场）"
```

---

## Task 6: 原子组件 Menu（下拉菜单，点击外部关闭）

**Files:**
- Create: `src/components/ui/Menu.tsx`
- Test: `src/components/ui/Menu.test.tsx`（仅测点击外部关闭逻辑）

- [ ] **Step 1: 写 Menu.tsx**

```tsx
import {useEffect, useRef, type ReactNode} from "react";
import {AnimatePresence, motion} from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 触发按钮，由调用方渲染并自行 toggle open。 */
  trigger: ReactNode;
  children: ReactNode;
  minWidth?: number;
}

export default function Menu({open, onClose, trigger, children, minWidth = 120}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute left-0 top-[34px] z-10 overflow-hidden rounded-sm border border-border bg-bg shadow-md"
            style={{minWidth}}
            initial={{opacity: 0, scale: 0.96, y: -4}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: -4}}
            transition={{duration: 0.13, ease: [0.16, 1, 0.3, 1]}}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ItemProps {
  onClick: () => void;
  children: ReactNode;
}

export function MenuItem({onClick, children}: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-[13px] text-text transition-colors duration-fast hover:bg-bg-tertiary"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc -b`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Menu.tsx
git commit -m "feat: 新增 Menu 下拉菜单原子组件"
```

---

## Task 7: SyntaxToolbar 迁移到 IconButton + Menu

**Files:**
- Modify: `src/components/Toolbar/SyntaxToolbar.tsx`

- [ ] **Step 1: 重写 SyntaxToolbar.tsx**

把所有 `<button style={btnStyle}>` 替换为 `<IconButton>`，标题下拉用 `Menu` + `MenuItem`。删除本地 `btnStyle` 常量。保持所有 onClick 行为不变（wrap/prefix/insertLink/insertCodeBlock/undo/redo/insertAtCursor）。

```tsx
import {useState} from "react";
import {
  Bold, Italic, Strikethrough, Code, Link, Heading,
  List, ListOrdered, Quote, SquareCode, Minus, Undo2, Redo2,
} from "lucide-react";
import type {RefObject} from "react";
import type {MarkdownEditorHandle} from "../Editor/MarkdownEditor.tsx";
import IconButton from "../ui/IconButton.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";

interface Props {
  editorRef: RefObject<MarkdownEditorHandle>;
}

const ICON = 16;

export default function SyntaxToolbar({editorRef}: Props) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const ed = () => editorRef.current;
  const wrap = (b: string, a: string, ph: string) => () => ed()?.wrapSelection(b, a, ph);
  const prefix = (p: string) => () => ed()?.prefixLines(p);
  const pickHeading = (level: number) => {
    ed()?.prefixLines("#".repeat(level) + " ");
    setHeadingOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <IconButton title="撤销 (Ctrl+Z)" onClick={() => ed()?.undo()}><Undo2 size={ICON} /></IconButton>
      <IconButton title="重做 (Ctrl+Y)" onClick={() => ed()?.redo()}><Redo2 size={ICON} /></IconButton>
      <IconButton title="加粗" onClick={wrap("**", "**", "加粗文本")}><Bold size={ICON} /></IconButton>
      <IconButton title="斜体" onClick={wrap("*", "*", "斜体文本")}><Italic size={ICON} /></IconButton>
      <IconButton title="删除线" onClick={wrap("~~", "~~", "删除文本")}><Strikethrough size={ICON} /></IconButton>
      <IconButton title="行内代码" onClick={wrap("`", "`", "代码")}><Code size={ICON} /></IconButton>
      <IconButton title="链接" onClick={() => ed()?.insertLink()}><Link size={ICON} /></IconButton>

      <Menu
        open={headingOpen}
        onClose={() => setHeadingOpen(false)}
        minWidth={80}
        trigger={
          <IconButton title="标题" active={headingOpen} onClick={() => setHeadingOpen((o) => !o)}>
            <Heading size={ICON} />
          </IconButton>
        }
      >
        {[1, 2, 3, 4].map((lv) => (
          <MenuItem key={lv} onClick={() => pickHeading(lv)}>H{lv}</MenuItem>
        ))}
      </Menu>

      <IconButton title="无序列表" onClick={prefix("- ")}><List size={ICON} /></IconButton>
      <IconButton title="有序列表" onClick={prefix("1. ")}><ListOrdered size={ICON} /></IconButton>
      <IconButton title="引用" onClick={prefix("> ")}><Quote size={ICON} /></IconButton>
      <IconButton title="代码块" onClick={() => ed()?.insertCodeBlock()}><SquareCode size={ICON} /></IconButton>
      <IconButton title="分割线" onClick={() => ed()?.insertAtCursor("\n---\n")}><Minus size={ICON} /></IconButton>
    </div>
  );
}
```

- [ ] **Step 2: 验证类型检查与 build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/SyntaxToolbar.tsx
git commit -m "refactor: SyntaxToolbar 迁移到 IconButton + Menu"
```

---

## Task 8: 各动作按钮迁移（Upload/Import/Copy/Publish/Theme 触发钮）

**Files:**
- Modify: `src/components/Upload/UploadButton.tsx`
- Modify: `src/components/Copy/CopyButton.tsx`
- Modify: `src/components/Theme/ThemeMenu.tsx`
- Modify: `src/components/Import/ImportButton.tsx`
- Modify: `src/components/Publish/PublishButton.tsx`

- [ ] **Step 1: UploadButton 改用 Button**

把 `<button style={{...}}>` 替换为 `<Button variant="secondary" disabled={uploading} onClick={...}>`，删除内联 style。import `Button from "../ui/Button.tsx"`。保留隐藏 file input 与 handleChange 逻辑不变。

```tsx
import {useRef, useState} from "react";
import Button from "../ui/Button.tsx";

interface Props {
  onPick: (file: File) => Promise<void>;
}

export default function UploadButton({onPick}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await onPick(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif" style={{display: "none"}} onChange={handleChange} />
      <Button variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "上传中…" : "上传图片"}
      </Button>
    </>
  );
}
```

- [ ] **Step 2: CopyButton 改用 Button（成功态用 success 色）**

```tsx
import {useState} from "react";
import {solveHtml} from "../../markdown/converter.ts";
import {waitForMathJaxIdle} from "../../markdown/mathjax.ts";
import {copyHtml} from "../../utils/clipboard.ts";
import Button from "../ui/Button.tsx";

export default function CopyButton() {
  const [status, setStatus] = useState<"idle" | "copying" | "ok" | "fail">("idle");

  const handleCopy = async () => {
    setStatus("copying");
    try {
      await waitForMathJaxIdle();
      const html = solveHtml();
      if (!html) {
        setStatus("fail");
        window.setTimeout(() => setStatus("idle"), 2000);
        return;
      }
      const ok = await copyHtml(html);
      setStatus(ok ? "ok" : "fail");
    } catch (error) {
      console.error("复制前 MathJax 排版失败", error);
      setStatus("fail");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  };

  const label = status === "ok" ? "✓ 已复制" : status === "fail" ? "复制失败" : status === "copying" ? "复制中…" : "复制到微信";

  return (
    <Button
      variant="primary"
      onClick={handleCopy}
      disabled={status === "copying"}
      className={status === "ok" ? "!bg-success hover:!bg-success" : ""}
    >
      {label}
    </Button>
  );
}
```

- [ ] **Step 3: ThemeMenu 触发钮改用 Button**

```tsx
import {useState} from "react";
import ThemePickerDialog from "./ThemePickerDialog.tsx";
import Button from "../ui/Button.tsx";

export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>主题</Button>
      {open && <ThemePickerDialog onClose={() => setOpen(false)} />}
    </>
  );
}
```

- [ ] **Step 4: ImportButton / PublishButton 同法迁移**

读 `src/components/Import/ImportButton.tsx` 与 `src/components/Publish/PublishButton.tsx`，把其触发按钮的内联 style 替换为 `<Button variant="secondary">`（Publish 若是主操作可保持 secondary，主 CTA 仍是复制按钮）。保留各自打开对话框/回调逻辑不变。

- [ ] **Step 5: 验证类型检查与 build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add src/components/Upload/UploadButton.tsx src/components/Copy/CopyButton.tsx src/components/Theme/ThemeMenu.tsx src/components/Import/ImportButton.tsx src/components/Publish/PublishButton.tsx
git commit -m "refactor: 动作按钮统一迁移到 Button 组件"
```

---

## Task 9: App.tsx 顶栏/主体/状态栏迁移

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 顶栏与状态栏改 className**

把 `<header>` 内联 style 替换为 className：`flex h-[52px] flex-shrink-0 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur`。文档切换按钮改用 `IconButton`（`active={sidebarOpen}`），设置按钮改用 `Button variant="secondary"`。`<footer>` 改 className：`flex h-7 flex-shrink-0 items-center gap-4 border-t border-border bg-bg-secondary px-4 text-xs text-text-muted`，数字 span 加 `tabular-nums`。`<main>` 与各 flex 容器边框 `#e8e8e8` → `border-border`（用 className `border-r border-border`）。

import `IconButton from "./components/ui/IconButton.tsx"` 和 `Button from "./components/ui/Button.tsx"`。删除顶栏/footer 内联 style 与设置按钮内联 style。保留所有 useEffect/逻辑/ref 不变。

- [ ] **Step 2: 验证类型检查与 build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: App 顶栏/主体/状态栏迁移到 Token + Tailwind"
```

---

## Task 10: DocTree 侧栏迁移 + 动画

**Files:**
- Modify: `src/components/DocTree/DocTree.tsx`
- Modify: `src/components/DocTree/TreeNode.tsx`
- Modify: `src/components/DocTree/DraftInput.tsx`

- [ ] **Step 1: DocTree 容器与工具按钮**

DocTree 根容器 style 改 className：`flex w-[220px] flex-shrink-0 flex-col overflow-hidden border-r border-border bg-bg-tertiary outline-none`。顶部两个新建按钮改用 `IconButton`。根拖拽高亮 `#eef5fc` → `bg-accent-subtle`（拖拽时加 className）。空状态文字 `#999` → `text-text-muted`。删除本地 `btnStyle`。

- [ ] **Step 2: TreeNode 选中/hover 态**

读 `src/components/DocTree/TreeNode.tsx`，把节点行的选中态/hover 改用 `--accent-subtle`（选中：`bg-accent-subtle text-accent`；hover：`hover:bg-bg-tertiary`），拖拽落点高亮改 `bg-accent-subtle`。保留缩进/展开图标/重命名输入逻辑。

- [ ] **Step 3: DraftInput 样式**

读 `src/components/DocTree/DraftInput.tsx`，输入框边框/圆角改用 Token（`border-border rounded-sm`），聚焦环 `focus-visible:ring-2`。

- [ ] **Step 4: 节点首次加载 stagger（DocTree）**

DocTree 渲染 tree 节点的外层用 `motion.div` + `initial/animate`，对顶层节点加 `transition={{delay: i * 0.02}}` 实现轻微 stagger。注意：展开/折叠子节点用 `AnimatePresence` + `motion.div`（height auto 动画）在 TreeNode 内实现；若 height auto 动画复杂度高，首版可只做 opacity 渐现，避免 layout thrash。

- [ ] **Step 5: 验证类型检查与 build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add src/components/DocTree/
git commit -m "refactor: DocTree 侧栏迁移到 Token + 入场/展开动画"
```

---

## Task 11: 三个对话框迁移到 Dialog 基座

**Files:**
- Modify: `src/components/Settings/SettingsDialog.tsx`
- Modify: `src/components/Import/ImportMarkdownDialog.tsx`
- Modify: `src/components/Publish/PublishDialog.tsx`

- [ ] **Step 1: SettingsDialog 改用 Dialog**

把外层遮罩+卡片+标题栏的内联 style 全部删除，包进 `<Dialog open title="设置" onClose={onClose} footer={...}>`。表单 input 改 className：`h-[34px] rounded-sm border border-border px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]`。底部按钮用 `<Button variant="secondary">取消` + `<Button variant="primary">保存`。section 标题/label/hint 文字改 Token 色（`text-text`/`text-text-secondary`/`text-text-muted`）。保留 get_config/save_config 逻辑。注意 SettingsDialog 当前是 `{settingsOpen && <SettingsDialog/>}` 条件渲染——改造后 Dialog 自带 AnimatePresence，需把 open 常驻传入：在 App 改为 `<SettingsDialog open={settingsOpen} onClose={...}/>` 并始终挂载，或在 SettingsDialog 内部包 Dialog 且由父控制 open。采用后者：SettingsDialog 接收 open prop。

具体：SettingsDialog 的 Props 改为 `{open: boolean; onClose: () => void}`，根 return `<Dialog open={open} ...>`。App.tsx 把 `{settingsOpen && <SettingsDialog onClose={...}/>}` 改为 `<SettingsDialog open={settingsOpen} onClose={...}/>`。useEffect(get_config) 改为依赖 open，open 变 true 时拉取。

- [ ] **Step 2: ImportMarkdownDialog 改用 Dialog**

读该文件，同法包进 Dialog，按钮换 Button，输入/文字换 Token。保持导入逻辑与 props 语义；若原本是条件渲染，同 Step 1 改为 open prop 模式。

- [ ] **Step 3: PublishDialog 改用 Dialog（closeOnOverlay=false）**

读该文件，包进 `<Dialog ... closeOnOverlay={false}>`（已知需求：禁止点遮罩关闭发布对话框）。按钮/文字/输入换 Token。保持发布逻辑与 props。

- [ ] **Step 4: 验证类型检查与 build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/Settings/ src/components/Import/ImportMarkdownDialog.tsx src/components/Publish/PublishDialog.tsx src/App.tsx
git commit -m "refactor: 三个对话框统一到 Dialog 基座"
```

---

## Task 12: ThemePickerDialog + StylePanel + Toaster 迁移

**Files:**
- Modify: `src/components/Theme/ThemePickerDialog.tsx`
- Modify: `src/components/StylePanel/StylePanel.tsx`
- Modify: `src/components/StylePanel/controls.tsx`
- Modify: `src/components/Toast/Toaster.tsx`

- [ ] **Step 1: StylePanel 迁移 + 滑入**

StylePanel 根容器改 className：`flex h-full w-[280px] flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-bg-tertiary p-4`。整体用 `motion.div` + `initial={{x: 20, opacity: 0}} animate={{x: 0, opacity: 1}}` 滑入。关闭按钮（× → lucide X）加 hover。分组标题文字改 Token 色。`updateStyleValue`/`getThemeById` 逻辑不变。

- [ ] **Step 2: controls.tsx 控件样式**

读 `src/components/StylePanel/controls.tsx`，把控件（颜色/输入/select）边框圆角改 Token，聚焦环统一。保持 `StyleControl` 导出名与 onChange 签名不变（Vite Fast Refresh 要求）。

- [ ] **Step 3: Toaster 用 AnimatePresence**

```tsx
import {useEffect, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {toast, type ToastItem} from "./toast.ts";

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => toast.subscribe(setItems), []);

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[1000] flex flex-col gap-2">
      <AnimatePresence>
        {items.map((it) => (
          <motion.div
            key={it.id}
            initial={{opacity: 0, x: 24}}
            animate={{opacity: 1, x: 0}}
            exit={{opacity: 0, x: 24}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            className="max-w-[360px] rounded px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-md"
            style={{
              background: "rgba(26,26,30,0.92)",
              borderLeft: it.type === "error" ? "3px solid var(--danger)" : "3px solid var(--success)",
            }}
          >
            {it.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: ThemePickerDialog 迁移**

读 `src/components/Theme/ThemePickerDialog.tsx`，缩略图网格容器与按钮的边框/圆角/文字换 Token，浮层进出场可用 Framer Motion（与 Dialog 风格一致的 fade+scale）。保留分页/选择/导入 mdnice 逻辑。

- [ ] **Step 5: 验证类型检查与 build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add src/components/Theme/ThemePickerDialog.tsx src/components/StylePanel/ src/components/Toast/Toaster.tsx
git commit -m "refactor: ThemePicker/StylePanel/Toaster 迁移到 Token + 动画"
```

---

## Task 13: 全量收尾验证

**Files:** 无（验证任务）

- [ ] **Step 1: 全量类型检查 + build**

Run: `npx tsc -b && npm run build`
Expected: 通过。

- [ ] **Step 2: 残留内联色扫描**

Run: `grep -rn "#1e6bb8\|#d9d9d9\|#e8e8e8\|#07c160\|#333\b" src/components src/App.tsx`
Expected: 无输出（预览区/编辑器 `.cm-*` 相关除外）。若有残留，迁移到 Token。

- [ ] **Step 3: 启动 dev 供用户视觉验收**

Run: `npm run tauri dev`（或 `npm run dev` 浏览器调试）
请用户打开软件逐项确认：顶栏/工具栏 hover、侧栏选中态与展开动画、三个对话框进出场、Toast 滑入、主按钮强调色、聚焦环。预览区内容应与改造前完全一致。

- [ ] **Step 4: 视觉验收通过后无需额外 commit（各任务已分别提交）**

---

## Self-Review 记录

- **Spec 覆盖**：Token 体系(T2/T3)、ui 原子组件(T4/T5/T6)、SyntaxToolbar(T7)、动作按钮(T8)、App chrome(T9)、DocTree(T10)、三对话框(T11)、ThemePicker/StylePanel/Toaster(T12)、framer-motion 安装与地雷(T1)、收尾扫描(T13) — 全覆盖。
- **预览区/编辑器不动**：T13 Step 2 扫描排除 `.cm-*`；MarkdownEditor 的 CM theme 与 Preview `#nice` 全程不在改造文件清单。
- **类型一致**：Button variant 名(primary/secondary/ghost)、IconButton active prop、Dialog props(open/title/onClose/closeOnOverlay/footer)、Menu props(open/onClose/trigger/minWidth) + MenuItem(onClick/children) 在各调用任务中一致引用。
- **已知需求**：发布对话框 closeOnOverlay=false（T11 S3）、StyleControl 导出名保持(T12 S2)、preflight 保留(T3)、@types/node 地雷应对(T1 S2)。
- **占位符**：T8 S4 / T10 S2-3 / T11 S2-3 / T12 S2,S4 标注"读该文件"是因这些文件尚未在本会话读取，执行时需先 Read 再按统一规则（内联 style → Token className，按钮 → Button/IconButton）迁移；规则在各步已明确，非空泛占位。
