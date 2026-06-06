# 主题选择器对话框（带缩略图预览）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把文字下拉式主题切换换成不带遮罩的居中浮层，网格卡片中每个主题用真实渲染的缩略图展示，附主题名 +「使用」按钮 + 分页。

**Architecture:** 缩略图通过把每个主题 CSS 的选择器改写到卡片唯一 scope class（`#nice X` → `.scope X`，裸选择器 `.hljs` → `.scope .hljs`），从而在同一弹窗里同时渲染多个不同主题。复制管线（converter.ts）读全局 `<style>`，零改动；scope 改写只活在对话框内。

**Tech Stack:** React 18 + TypeScript + Zustand + 现有 markdown-it 渲染管线（`render()`）。测试用 Node 内置 `node:test` + `tsx`（无新依赖）。

---

## File Structure

- `src/components/Theme/scopeCss.ts` — 纯函数：CSS 选择器改写到 scope class（先 TDD）。
- `src/components/Theme/scopeCss.test.ts` — scopeCss 单元测试。
- `src/components/Theme/sampleContent.ts` — 固定示例 Markdown 常量。
- `src/components/Theme/ThemeThumbnail.tsx` — 单卡缩略图，注入局部 scoped `<style>` + 渲染示例 HTML。
- `src/components/Theme/ThemePickerDialog.tsx` — 无遮罩居中浮层：网格 + 分页 + 打开文件夹。
- `src/components/Theme/ThemeMenu.tsx` — 改为点按钮直接开 ThemePickerDialog（移除文字下拉）。
- `package.json` — 加 `test` script。
- `docs/PROGRESS.md` — 收尾记录变更。

---

### Task 1: scopeCss 选择器改写（纯函数，TDD）

**Files:**
- Create: `src/components/Theme/scopeCss.ts`
- Test: `src/components/Theme/scopeCss.test.ts`
- Modify: `package.json`（加 test script）

- [ ] **Step 1: 加 test script**

修改 `package.json` 的 `scripts`，在 `"tauri": "tauri"` 后加一行：

```json
    "tauri": "tauri",
    "test": "node --import tsx --test src/**/*.test.ts"
```

- [ ] **Step 2: 写失败测试**

创建 `src/components/Theme/scopeCss.test.ts`：

```typescript
import {test} from "node:test";
import assert from "node:assert/strict";
import {scopeCss} from "./scopeCss.ts";

test("#nice 前缀替换为 scope class", () => {
  const out = scopeCss("#nice p { color: red; }", "tp-x");
  assert.equal(out.trim(), ".tp-x p { color: red; }");
});

test("裸选择器前面补 scope", () => {
  const out = scopeCss(".hljs { background: #f8f8f8; }", "tp-x");
  assert.equal(out.trim(), ".tp-x .hljs { background: #f8f8f8; }");
});

test("逗号多选择器逐个处理", () => {
  const out = scopeCss("#nice h1, #nice h2 { margin: 0; }", "tp-x");
  assert.equal(out.trim(), ".tp-x h1, .tp-x h2 { margin: 0; }");
});

test("#nice 单独选择器（整体根）替换为 .scope", () => {
  const out = scopeCss("#nice { font-size: 16px; }", "tp-x");
  assert.equal(out.trim(), ".tp-x { font-size: 16px; }");
});

test("混合 #nice 与裸选择器", () => {
  const out = scopeCss("#nice strong, .hljs-keyword { color: #333; }", "tp-x");
  assert.equal(out.trim(), ".tp-x strong, .tp-x .hljs-keyword { color: #333; }");
});

test("@media 等 at-rule 整块跳过（内部规则仍改写）", () => {
  const out = scopeCss("@media (max-width: 600px) { #nice p { font-size: 14px; } }", "tp-x");
  assert.ok(out.includes("@media (max-width: 600px)"));
  assert.ok(out.includes(".tp-x p"));
  assert.ok(!out.includes("#nice"));
});

test("空块/注释不报错", () => {
  const out = scopeCss("/* c */\n#nice p {}", "tp-x");
  assert.ok(out.includes(".tp-x p"));
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test`
Expected: FAIL，提示 `scopeCss` 无法导入 / 未定义。

- [ ] **Step 4: 实现 scopeCss**

创建 `src/components/Theme/scopeCss.ts`：

```typescript
// 把主题 CSS 的选择器改写到卡片唯一 scope class，使多个不同主题缩略图能同页共存。
// 规则：选择器以 #nice 开头 → 替换 #nice 为 .scope；否则（裸选择器如 .hljs）→ 前面补 ".scope "。
// 仅用于主题选择器对话框的缩略图，不影响复制管线。

// 单条选择器（逗号分隔后的一个）改写。
function scopeSelector(sel: string, scopeClass: string): string {
  const s = sel.trim();
  if (!s) return s;
  if (s === "#nice") return `.${scopeClass}`;
  if (s.startsWith("#nice")) return `.${scopeClass}${s.slice("#nice".length)}`;
  return `.${scopeClass} ${s}`;
}

// 把一段选择器列表（可能含逗号）逐个改写后用 ", " 连接。
function scopeSelectorList(selectorList: string, scopeClass: string): string {
  return selectorList
    .split(",")
    .map((sel) => scopeSelector(sel, scopeClass))
    .join(", ");
}

export function scopeCss(css: string, scopeClass: string): string {
  // 去掉块注释，简化解析。
  const noComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  const n = noComment.length;
  while (i < n) {
    const braceOpen = noComment.indexOf("{", i);
    if (braceOpen === -1) {
      break; // 无更多规则
    }
    const prelude = noComment.slice(i, braceOpen).trim();

    // at-rule（@media/@supports 等）：保留 prelude，递归处理其内部块。
    if (prelude.startsWith("@")) {
      const blockEnd = matchBrace(noComment, braceOpen);
      const inner = noComment.slice(braceOpen + 1, blockEnd);
      out += `${prelude} { ${scopeCss(inner, scopeClass)} }\n`;
      i = blockEnd + 1;
      continue;
    }

    // 普通规则：改写选择器，body 原样。
    const blockEnd = matchBrace(noComment, braceOpen);
    const body = noComment.slice(braceOpen + 1, blockEnd).trim();
    out += `${scopeSelectorList(prelude, scopeClass)} {${body ? ` ${body} ` : ""}}\n`;
    i = blockEnd + 1;
  }
  return out;
}

// 从 openIdx（'{'）找到匹配的 '}' 下标（支持嵌套，用于 at-rule）。
function matchBrace(str: string, openIdx: number): number {
  let depth = 0;
  for (let k = openIdx; k < str.length; k++) {
    if (str[k] === "{") depth++;
    else if (str[k] === "}") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return str.length - 1;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: 全部 PASS（7 个测试）。

- [ ] **Step 6: 提交**

```bash
git add package.json src/components/Theme/scopeCss.ts src/components/Theme/scopeCss.test.ts
git commit -m "feat: add scopeCss selector rewriter for theme thumbnails"
```

---

### Task 2: 示例 Markdown 常量

**Files:**
- Create: `src/components/Theme/sampleContent.ts`

- [ ] **Step 1: 创建常量**

创建 `src/components/Theme/sampleContent.ts`：

```typescript
// 缩略图用固定示例：体现标题/正文/引用/行内代码四种样式差异。保持简短，缩略展示。
export const SAMPLE_MARKDOWN = `## 二级标题

这是一段正文，用来展示主题的字体与行距效果。

> 一句引用，体现引用块样式。

行内代码 \`const x = 1\` 与 **加粗** 文字。`;
```

- [ ] **Step 2: 提交**

```bash
git add src/components/Theme/sampleContent.ts
git commit -m "feat: add sample markdown for theme thumbnails"
```

---

### Task 3: ThemeThumbnail 单卡缩略图

**Files:**
- Create: `src/components/Theme/ThemeThumbnail.tsx`

依赖（已存在）：
- `render` from `../../markdown/parser.ts`（`render(markdown: string): string`）
- `basic` from `../../themes/index.ts`（基础层 CSS 字符串）
- `scopeCss` from `./scopeCss.ts`
- `SAMPLE_MARKDOWN` from `./sampleContent.ts`

- [ ] **Step 1: 实现组件**

创建 `src/components/Theme/ThemeThumbnail.tsx`：

```typescript
import {useEffect, useMemo, useRef} from "react";
import {render} from "../../markdown/parser.ts";
import {basic} from "../../themes/index.ts";
import {scopeCss} from "./scopeCss.ts";
import {SAMPLE_MARKDOWN} from "./sampleContent.ts";

interface Props {
  themeId: string; // 用于生成唯一 scope class
  css: string; // 主题 CSS（自包含 markdown + hljs）
}

// 缩略图：把 basic + 主题 CSS 都 scope 到本卡唯一 class，注入局部 <style>，
// 渲染固定示例 HTML，再用 transform: scale 缩成「缩小版正文」。
export default function ThemeThumbnail({themeId, css}: Props) {
  // scope class 必须是合法 CSS 标识符：非字母数字转 '-'。
  const scopeClass = useMemo(() => "tp-" + themeId.replace(/[^a-zA-Z0-9_-]/g, "-"), [themeId]);
  const html = useMemo(() => render(SAMPLE_MARKDOWN), []);
  const scoped = useMemo(
    () => scopeCss(basic, scopeClass) + "\n" + scopeCss(css, scopeClass),
    [css, scopeClass],
  );
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = scoped;
    document.head.appendChild(el);
    styleRef.current = el;
    return () => {
      el.remove();
    };
  }, [scoped]);

  return (
    <div
      style={{
        width: "100%",
        height: 140,
        overflow: "hidden",
        background: "#fff",
        border: "1px solid #f0f0f0",
        borderRadius: 4,
        position: "relative",
      }}
    >
      <div
        className={scopeClass}
        style={{
          width: 600,
          transform: "scale(0.42)",
          transformOrigin: "top left",
          padding: 12,
        }}
        dangerouslySetInnerHTML={{__html: html}}
      />
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无报错（或仅与本任务无关的既有报错）。

- [ ] **Step 3: 提交**

```bash
git add src/components/Theme/ThemeThumbnail.tsx
git commit -m "feat: add ThemeThumbnail with scoped live preview"
```

---

### Task 4: ThemePickerDialog 浮层 + 网格 + 分页

**Files:**
- Create: `src/components/Theme/ThemePickerDialog.tsx`

依赖（已存在）：
- `useStore` from `../../store/index.ts`（含 `markdownThemeId`, `setMarkdownTheme`, `themes`, `setThemes`）
- `loadAllThemes`, `openThemesDir` from `../../themes/loader.ts`
- `ThemeOption` 类型 from `../../themes/index.ts`
- `ThemeThumbnail` from `./ThemeThumbnail.tsx`

- [ ] **Step 1: 实现对话框**

创建 `src/components/Theme/ThemePickerDialog.tsx`：

```typescript
import {useEffect, useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {loadAllThemes, openThemesDir} from "../../themes/loader.ts";
import ThemeThumbnail from "./ThemeThumbnail.tsx";

const PAGE_SIZE = 8;

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

interface Props {
  onClose: () => void;
}

// 无遮罩居中浮层：网格卡片（缩略图 + 名 + 使用）+ 分页 + 打开主题文件夹。
export default function ThemePickerDialog({onClose}: Props) {
  const {markdownThemeId, setMarkdownTheme, themes, setThemes} = useStore();
  const [page, setPage] = useState(0);
  const ref = useClickOutside(onClose);

  const totalPages = Math.max(1, Math.ceil(themes.length / PAGE_SIZE));
  const pageThemes = themes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function pick(id: string) {
    setMarkdownTheme(id);
    onClose();
  }

  async function openFolder() {
    await openThemesDir();
    setThemes(await loadAllThemes());
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 880,
        maxWidth: "92vw",
        maxHeight: "86vh",
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        padding: 20,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          border: "none",
          background: "transparent",
          fontSize: 20,
          color: "#999",
          cursor: "pointer",
          lineHeight: 1,
        }}
        aria-label="关闭"
      >
        ×
      </button>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginTop: 8,
        }}
      >
        {pageThemes.map((t) => {
          const active = t.id === markdownThemeId;
          return (
            <div
              key={t.id}
              style={{
                border: active ? "2px solid #1e6bb8" : "1px solid #e8e8e8",
                borderRadius: 6,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <ThemeThumbnail themeId={t.id} css={t.css} />
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span style={{fontSize: 13, color: "#333"}}>{t.name}</span>
                <button
                  onClick={() => pick(t.id)}
                  style={{
                    height: 26,
                    padding: "0 12px",
                    fontSize: 12,
                    border: "1px solid #1e6bb8",
                    borderRadius: 4,
                    background: active ? "#1e6bb8" : "#fff",
                    color: active ? "#fff" : "#1e6bb8",
                    cursor: "pointer",
                  }}
                >
                  {active ? "已用" : "使用"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 16,
        }}
      >
        <button
          onClick={openFolder}
          style={{
            height: 28,
            padding: "0 12px",
            fontSize: 12,
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            background: "#fff",
            color: "#1e6bb8",
            cursor: "pointer",
          }}
        >
          ＋ 打开主题文件夹
        </button>

        {totalPages > 1 && (
          <div style={{display: "flex", alignItems: "center", gap: 6}}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={pageBtn(page === 0)}
            >
              ‹
            </button>
            {Array.from({length: totalPages}, (_, idx) => (
              <button
                key={idx}
                onClick={() => setPage(idx)}
                style={{
                  ...pageBtn(false),
                  background: idx === page ? "#1e6bb8" : "#fff",
                  color: idx === page ? "#fff" : "#333",
                }}
              >
                {idx + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              style={pageBtn(page === totalPages - 1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    minWidth: 28,
    height: 28,
    border: "1px solid #d9d9d9",
    borderRadius: 4,
    background: "#fff",
    color: "#333",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 13,
  };
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无报错。

- [ ] **Step 3: 提交**

```bash
git add src/components/Theme/ThemePickerDialog.tsx
git commit -m "feat: add maskless ThemePickerDialog with grid and pagination"
```

---

### Task 5: ThemeMenu 改为打开对话框

**Files:**
- Modify: `src/components/Theme/ThemeMenu.tsx`（整文件替换）

- [ ] **Step 1: 替换 ThemeMenu**

把 `src/components/Theme/ThemeMenu.tsx` 整个文件内容替换为：

```typescript
import {useState} from "react";
import ThemePickerDialog from "./ThemePickerDialog.tsx";

const btnStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "1px solid #e8e8e8",
  borderRadius: 4,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

// 点「主题」按钮打开无遮罩浮层选择器（网格缩略图 + 分页）。
export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(true)}>
        主题
      </button>
      {open && <ThemePickerDialog onClose={() => setOpen(false)} />}
    </>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -b --noEmit`
Expected: 无报错（确认旧的 `loadAllThemes`/`useClickOutside` import 已不再被 ThemeMenu 引用，无未用变量报错）。

- [ ] **Step 3: 提交**

```bash
git add src/components/Theme/ThemeMenu.tsx
git commit -m "feat: open theme picker dialog from theme button"
```

---

### Task 6: 运行时验证 + 更新 PROGRESS

**Files:**
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: 启动 dev server 手动验证**

Run: `npm run dev`（在浏览器打开 Vite 给出的本地地址）
验证清单：
- 点导航栏「主题」→ 弹出居中浮层，**无暗色遮罩**。
- 网格里每张卡片缩略图**各自不同**（default/elegant/tech 样式有区别），不是全长一样。
- 当前主题卡高亮、按钮显示「已用」。
- 点其他主题「使用」→ 预览区主题切换、浮层关闭。
- 点浮层外部或 ×→ 关闭。
- 主题 ≤ 8 个时无分页条；若临时多放几个 CSS 测试分页可翻页（验证后删掉测试 CSS）。
- 「＋ 打开主题文件夹」可点（Tauri 环境下打开目录；Web 调试下 invoke 失败属预期）。

若缩略图全部相同 → scopeCss 改写有问题，回到 Task 1 检查；若缩略图无任何样式 → 检查局部 `<style>` 是否注入到 `document.head`。

- [ ] **Step 2: 类型与测试总检**

Run: `npm test && npx tsc -b --noEmit`
Expected: 测试全 PASS，类型无报错。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `docs/PROGRESS.md` 中合适位置（主题系统相关章节后）追加一段：

```markdown
### 主题选择器对话框（2026-06-07）

主题切换由文字下拉改为**不带遮罩的居中浮层**：网格卡片，每张卡片显示主题名 + 真实渲染缩略图 +「使用」按钮 + 底部分页。

- **缩略图真实渲染**：`scopeCss.ts` 把每个主题 CSS 选择器改写到卡片唯一 scope class（`#nice X`→`.scope X`，裸 `.hljs`→`.scope .hljs`），多个不同主题缩略图同页共存。对内置 + 用户主题一视同仁，零维护（截图方案对用户主题失效，故弃用）。
- 新组件 `src/components/Theme/`：`scopeCss.ts`(+test)、`sampleContent.ts`、`ThemeThumbnail.tsx`、`ThemePickerDialog.tsx`；`ThemeMenu.tsx` 改为点击开浮层。
- 复制管线 converter.ts、全局四层 `<style>`、store 结构零改动；scope 改写只活在对话框内。
- 测试：`npm test`（Node 内置 node:test + tsx，无新依赖）覆盖 scopeCss。
```

- [ ] **Step 4: 提交**

```bash
git add docs/PROGRESS.md
git commit -m "docs: record theme picker dialog in PROGRESS"
```

---

## Self-Review

**Spec coverage：**
- 无遮罩居中浮层 → Task 4 ✓
- 网格卡片（缩略图 + 名 + 使用）→ Task 4 ✓
- 真实渲染缩略图 + 选择器改写 → Task 1（scopeCss）+ Task 3（ThemeThumbnail）✓
- 固定示例片段 → Task 2 ✓
- 分页 → Task 4 ✓
- 对话框内保留「打开主题文件夹」→ Task 4 ✓
- ThemeMenu 点击打开 → Task 5 ✓
- 复制管线零改动 → 设计约束，无任务触碰 converter.ts ✓
- 更新 PROGRESS → Task 6 ✓

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码；测试含真实断言。

**Type consistency：** `scopeCss(css, scopeClass)` 签名 Task 1 定义、Task 3 调用一致；`ThemeThumbnail` props `{themeId, css}` Task 3 定义、Task 4 调用一致；`ThemePickerDialog` props `{onClose}` Task 4 定义、Task 5 调用一致；`useStore` 字段名（`markdownThemeId`/`setMarkdownTheme`/`themes`/`setThemes`）与现有 store 一致；`ThemeOption.css`/`.id`/`.name` 与 `themes/index.ts` 一致。
