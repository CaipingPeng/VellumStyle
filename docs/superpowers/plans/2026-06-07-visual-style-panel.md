# 可视化样式面板 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户点击预览区元素，在右侧面板可视化调整该类元素样式并实时预览，主题统一为自包含 model（mdnice schema），可导入 mdnice 抓包主题。

**Architecture:** 所有主题为 model JSON（mdnice `styleModelList` schema）。`compileModel` 把 model 编译成 CSS 注入 `STYLE_IDS.markdown`，复用现有预览/复制管线。点击预览元素经 `elementMap` 识别出 model id，`StylePanel` 按 model 动态渲染控件；改值写回 model→重编译→注入。废弃 `basic.ts` 与 CSS 主题，default 由 basic.ts 视觉值迁入一份 model JSON。

**Tech Stack:** React 18 + Zustand + TypeScript + Vite + Tauri(Rust)。测试用 `node:test` + `node:assert/strict`，运行 `npm test`。

参考 spec：`docs/superpowers/specs/2026-06-07-visual-style-panel-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/themes/themeModel.ts` | StyleModel/StyleItem/StyleKey 类型 + `validateModel` 校验 |
| `src/themes/compileModel.ts` | `compileModel(models): string` 纯函数 model→CSS |
| `src/themes/compileModel.test.ts` | 以 `草原绿.json` 为 oracle 的单测 |
| `src/themes/default.json` | 出厂 default model（basic.ts 视觉值迁入） |
| `src/themes/index.ts` | 改写：内置 default model + 编译，不再扫 `*.css` |
| `src/themes/loader.ts` | 改写：扫 `*.json`，编译出 css |
| `src/components/StylePanel/elementMap.ts` | DOM 元素 → model id |
| `src/components/StylePanel/elementMap.test.ts` | 映射与优先级单测 |
| `src/components/StylePanel/controls.tsx` | 各 style.id → 控件 |
| `src/components/StylePanel/StylePanel.tsx` | 面板容器（遍历 model.styles 渲染控件） |
| `src/store/index.ts` | 加 selectedModelId / 主题 model 编辑 action |
| `src/components/Preview/Preview.tsx` | 移除 basic 注入；加点击识别 |
| `src/markdown/converter.ts` | `solveHtml()` 移除 basic 层拼接 |
| `src/components/Theme/ThemePickerDialog.tsx` | 加「导入 mdnice 主题」按钮 |
| `src-tauri/src/themes.rs` | 改写：只扫 `*.json`；加 save / import 命令 |
| `src-tauri/src/lib.rs` | 注册新命令 |

**删除**：`src/themes/basic.ts`、`src/themes/markdown/{default,elegant,tech}.css`。

---

## Task 1: model schema 类型与校验

**Files:**
- Create: `src/themes/themeModel.ts`
- Test: `src/themes/themeModel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/themes/themeModel.test.ts
import {test} from "node:test";
import assert from "node:assert/strict";
import {validateModel, type StyleModel} from "./themeModel.ts";

test("合法 model 通过校验", () => {
  const m: StyleModel[] = [
    {id: "p", label: "段落", styles: [
      {id: "fontSize", value: "16px", keys: [{selector: "#nice p", key: "font-size", format: null}], children: null},
    ]},
  ];
  assert.equal(validateModel(m), true);
});

test("非数组返回 false", () => {
  assert.equal(validateModel({} as unknown), false);
});

test("缺 id/styles 的项返回 false", () => {
  assert.equal(validateModel([{label: "x"}] as unknown), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="校验|model"`
Expected: FAIL（找不到模块 `./themeModel.ts`）

- [ ] **Step 3: Write minimal implementation**

```ts
// src/themes/themeModel.ts
export interface StyleKey {
  selector: string;
  key: string;
  format: string | null;
}
export interface StyleItem {
  id: string;
  value: string | null;
  keys: StyleKey[] | null;
  children: StyleItem[] | null;
}
export interface StyleModel {
  id: string;
  label: string;
  styles: StyleItem[];
  selectors?: string[];
}

// 宽容校验：是数组、每项有 string id 与 styles 数组。未知字段忽略（mdnice 改版兼容）。
export function validateModel(data: unknown): data is StyleModel[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (m) =>
      m != null &&
      typeof (m as StyleModel).id === "string" &&
      Array.isArray((m as StyleModel).styles),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="校验|model"`
Expected: PASS（3 项）

- [ ] **Step 5: Commit**

```bash
git add src/themes/themeModel.ts src/themes/themeModel.test.ts
git commit -m "feat: add theme model schema types and validation"
```

---

## Task 2: compileModel —— model→CSS（核心，以草原绿.json 为 oracle）

**Files:**
- Create: `src/themes/compileModel.ts`
- Test: `src/themes/compileModel.test.ts`

> 编译规则（见 spec 第 2 节）：遍历 styles（递归 children）；有 keys 则 `ruleMap[selector][key]=value`（忽略 format）；id==='common' 的 value 原样追加；同 selector 多 key 合并成一条规则。

- [ ] **Step 1: Write the failing test（小样本，断言确定输出）**

```ts
// src/themes/compileModel.test.ts
import {test} from "node:test";
import assert from "node:assert/strict";
import {compileModel} from "./compileModel.ts";
import type {StyleModel} from "./themeModel.ts";

// 把 CSS 解析成 {selector: {prop: value}}，比较时忽略顺序与空白
function parseRules(css: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    const decls: Record<string, string> = {};
    for (const part of m[2].split(";")) {
      const i = part.indexOf(":");
      if (i === -1) continue;
      decls[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    out[sel] = {...(out[sel] || {}), ...decls};
  }
  return out;
}

test("普通 keys 项编译为规则", () => {
  const models: StyleModel[] = [
    {id: "p", label: "p", styles: [
      {id: "fontSize", value: "16px", keys: [{selector: "#nice p", key: "font-size", format: null}], children: null},
      {id: "fontColor", value: "rgba(43,43,43,1)", keys: [{selector: "#nice p", key: "color", format: null}], children: null},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.deepEqual(r["#nice p"], {"font-size": "16px", color: "rgba(43,43,43,1)"});
});

test("children 复合项递归展开", () => {
  const models: StyleModel[] = [
    {id: "h1", label: "h1", styles: [
      {id: "marginPadding", value: null, keys: null, children: [
        {id: "marginTop", value: "30px", keys: [{selector: "#nice h1", key: "margin-top", format: null}], children: null},
        {id: "marginBottom", value: "15px", keys: [{selector: "#nice h1", key: "margin-bottom", format: null}], children: null},
      ]},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.deepEqual(r["#nice h1"], {"margin-top": "30px", "margin-bottom": "15px"});
});

test("common 项原样输出", () => {
  const models: StyleModel[] = [
    {id: "h1", label: "h1", styles: [
      {id: "common", value: "#nice h1 .prefix { display: none; }", keys: null, children: null},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.deepEqual(r["#nice h1 .prefix"], {display: "none"});
});

test("同一 value 写多个 selector", () => {
  const models: StyleModel[] = [
    {id: "blockquote", label: "bq", styles: [
      {id: "fontColor", value: "rgba(0,0,0,1)", keys: [
        {selector: "#nice blockquote p", key: "color", format: null},
        {selector: "#nice .custom-blockquote p", key: "color", format: null},
      ], children: null},
    ]},
  ];
  const r = parseRules(compileModel(models));
  assert.equal(r["#nice blockquote p"].color, "rgba(0,0,0,1)");
  assert.equal(r["#nice .custom-blockquote p"].color, "rgba(0,0,0,1)");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="编译|递归|common|selector"`
Expected: FAIL（找不到 `./compileModel.ts`）

- [ ] **Step 3: Write minimal implementation**

```ts
// src/themes/compileModel.ts
import type {StyleModel, StyleItem} from "./themeModel.ts";

// model → CSS。纯函数，无副作用。format 字段一律忽略（样本与 default 均未用到）。
export function compileModel(models: StyleModel[]): string {
  const ruleMap = new Map<string, Map<string, string>>();
  const commonBlocks: string[] = [];

  function visit(item: StyleItem) {
    if (item.id === "common" && typeof item.value === "string") {
      commonBlocks.push(item.value);
      return;
    }
    if (item.keys && item.value != null) {
      for (const k of item.keys) {
        let m = ruleMap.get(k.selector);
        if (!m) {
          m = new Map();
          ruleMap.set(k.selector, m);
        }
        m.set(k.key, item.value);
      }
    }
    if (item.children) {
      for (const c of item.children) visit(c);
    }
  }

  for (const model of models) {
    for (const s of model.styles) visit(s);
  }

  const parts: string[] = [];
  for (const [selector, decls] of ruleMap) {
    const body = Array.from(decls, ([k, v]) => `${k}: ${v}`).join("; ");
    parts.push(`${selector} { ${body} }`);
  }
  parts.push(...commonBlocks);
  return parts.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="编译|递归|common|selector"`
Expected: PASS（4 项）

- [ ] **Step 5: Commit**

```bash
git add src/themes/compileModel.ts src/themes/compileModel.test.ts
git commit -m "feat: add model-to-CSS compiler"
```

---

## Task 3: compileModel 对照 草原绿.json oracle 验证

> 把 `C:\Users\Administrator\Desktop\草原绿.json` 复制进仓库作 fixture，编译 `styleModelList` 与其自带 `data.style` 规则比对。这是编译器正确性的真实回归基准。

**Files:**
- Create: `src/themes/__fixtures__/caoyuanlv.json`（从桌面复制）
- Modify: `src/themes/compileModel.test.ts`

- [ ] **Step 1: 复制 fixture 进仓库**

```bash
mkdir -p src/themes/__fixtures__
cp "C:/Users/Administrator/Desktop/草原绿.json" "src/themes/__fixtures__/caoyuanlv.json"
```

- [ ] **Step 2: Write the failing test（追加到 compileModel.test.ts 末尾）**

```ts
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

test("oracle：编译 草原绿 model 与其 data.style 规则等价", () => {
  const path = fileURLToPath(new URL("./__fixtures__/caoyuanlv.json", import.meta.url));
  const json = JSON.parse(readFileSync(path, "utf-8"));
  const expected = parseRules(json.data.style);
  const actual = parseRules(compileModel(json.data.styleModelList));

  // 逐 selector 逐 prop 比对：actual 必须覆盖 expected 的每条声明
  for (const sel of Object.keys(expected)) {
    assert.ok(actual[sel], `缺少 selector: ${sel}`);
    for (const prop of Object.keys(expected[sel])) {
      assert.equal(
        actual[sel][prop],
        expected[sel][prop],
        `${sel} { ${prop} } 不匹配`,
      );
    }
  }
});
```

- [ ] **Step 3: Run test to verify it fails or passes**

Run: `npm test -- --test-name-pattern="oracle"`
Expected: 若编译器正确则 PASS；若某 selector/prop 报错，说明编译规则有遗漏（如 common 块解析、children 层级），按报错信息修 `compileModel.ts` 直到 PASS。

> 注意：`data.style` 里可能含编译器未产出的 selector（mdnice 额外细节），本测试只要求 actual ⊇ expected 的方向覆盖；若发现 expected 中有 model 里根本没有的规则，记录到 spec 风险，不强行通过。

- [ ] **Step 4: 修到 PASS 后提交**

```bash
git add src/themes/__fixtures__/caoyuanlv.json src/themes/compileModel.test.ts
git commit -m "test: verify compiler against mdnice theme oracle"
```

---

## Task 4: 构造 default model（B+i，basic.ts 视觉值迁入）

> 以 `草原绿.json` 的 model 结构为骨架，把视觉值换成 `src/themes/basic.ts` 当前的值，产出 `src/themes/default.json`（仅 `styleModelList` 数组，不要整包）。处理 spec 表中的选择器差异（multiquote→blockquote、li section 拆 ul/ol、figcaption 加 figure 前缀、p code/li code 拆开、table 细粒度选择器、prefix/suffix 进 common）。

**Files:**
- Create: `src/themes/default.json`
- Test: `src/themes/default.test.ts`

- [ ] **Step 1: 生成 default.json 骨架**

以 `src/themes/__fixtures__/caoyuanlv.json` 的 `data.styleModelList` 为模板复制成 `src/themes/default.json`（顶层就是数组），然后按 `basic.ts` 改写每个 `value`：

关键值映射（来自 `basic.ts`，逐项核对）：
- `global`: font-size `16px`，color `rgba(0,0,0,1)`，line-height `1.6em`，padding `0 10px`，font-family 用 basic.ts 的 `Optima-Regular, Optima, PingFangSC-light, ...`
- `p`: font-size `16px`，color `rgba(0,0,0,1)`，line-height `26px`，padding-top/bottom `8px`，margin `0`
- `h1~h6`: margin-top `30px`、margin-bottom `15px`、font-weight `bold`、color `rgba(0,0,0,1)`；font-size 分别 `24/22/20/18/16/16 px`；标题色统一黑色（非草原绿的绿）
- `ul`/`ol`: margin-top/bottom `8px`，padding-left `25px`，color 黑；list-style ul `disc`、ol `decimal`（写进 common）
- `ul li section`/`ol li section`: margin-top/bottom `5px`，line-height `26px`，color `rgb(1,1,1)`，font-weight `500`
- `blockquote`: 对应 basic 的 `.multiquote-1`：border-left `3px solid rgba(0,0,0,0.4)`、background `rgba(0,0,0,0.05)`、color `#6a737d`、padding `10px 10px 10px 20px`、margin `20px 0`
- `a`: color `#1e6bb8`，font-weight bold，border-bottom `1px solid #1e6bb8`，text-decoration none（后两者进 common）
- `strong`/`em`/`strongEm`/`del(s)`: color 黑，对应 font-weight/font-style
- `hr`: 进 common（`border-top: 1px solid black` 等）
- `blockCode`(`pre.custom`)/`inlineCode`(`p code`,`li code`): 按 basic 的代码块/行内代码值
- `image`(`figure img`)/`imageDescription`(`figure figcaption`): figcaption color `#888`、font-size `14px`、text-align center
- `table`/`tableHead`/`tableBody` + 斑马行：按 basic 的 table 值（th 背景 `#f0f0f0`、斑马 `#F8F8F8`、边框 `1px solid #ccc`）
- footnote 系列：按 basic 的 `.footnote-*` 值

> common 块：把 basic.ts 中不适合做控件的规则（`.prefix/.suffix display:none`、list-style、a 的 text-decoration、hr 边框、imageflow 等）原样放进对应 model 的 `common` 项 value。

- [ ] **Step 2: Write the failing test**

```ts
// src/themes/default.test.ts
import {test} from "node:test";
import assert from "node:assert/strict";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};

test("default.json 通过 model 校验", () => {
  assert.equal(validateModel(defaultModel), true);
});

test("default 编译出关键元素的预期视觉值", () => {
  const css = compileModel(defaultModel as never);
  // 段落 16px 黑色
  assert.match(css, /#nice p \{[^}]*font-size: 16px/);
  // h1 24px
  assert.match(css, /#nice h1 \.content \{[^}]*font-size: 24px/);
  // 链接蓝
  assert.match(css, /#nice a \{[^}]*color: #1e6bb8/);
});
```

- [ ] **Step 3: Run test**

Run: `npm test -- --test-name-pattern="default"`
Expected: 先 FAIL（值未对齐），调 `default.json` 的 value 直到 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/themes/default.json src/themes/default.test.ts
git commit -m "feat: add default theme model (migrated from basic.ts)"
```

---

## Task 5: 改写 themes/index.ts 为 model-only

**Files:**
- Modify: `src/themes/index.ts`（整体改写）
- Delete: `src/themes/basic.ts`, `src/themes/markdown/{default,elegant,tech}.css`

- [ ] **Step 1: 改写 index.ts**

```ts
// src/themes/index.ts
import {compileModel} from "./compileModel.ts";
import type {StyleModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};

export type {StyleModel} from "./themeModel.ts";

export interface ThemeOption {
  id: string;
  name: string;
  css: string; // 由 model 编译产出（注入预览/复制）
  model: StyleModel[]; // 真相源，可进面板编辑
}

const DEFAULT_MODEL = defaultModel as StyleModel[];

export const builtinThemes: ThemeOption[] = [
  {id: "default", name: "default", css: compileModel(DEFAULT_MODEL), model: DEFAULT_MODEL},
];

export const defaultMarkdownTheme: ThemeOption = builtinThemes[0];
```

- [ ] **Step 2: 删除废弃文件**

```bash
git rm src/themes/basic.ts src/themes/markdown/default.css src/themes/markdown/elegant.css src/themes/markdown/tech.css
```

- [ ] **Step 3: 验证类型编译**

Run: `npx tsc -b --noEmit`
Expected: 报错集中在引用了 `basic`/旧 `ThemeOption` 的文件（Preview.tsx、loader.ts、converter.ts、store）——这些在后续 Task 修复。先确认 index.ts 本身无错。

- [ ] **Step 4: Commit**

```bash
git add src/themes/index.ts
git commit -m "refactor: make themes model-only, drop basic layer and CSS themes"
```

---

## Task 6: store 增加 model 编辑状态

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 改写 store**

```ts
// src/store/index.ts
import {create} from "zustand";
import {persist} from "zustand/middleware";
import {compileModel} from "../themes/compileModel.ts";
import {builtinThemes, defaultMarkdownTheme, type ThemeOption, type StyleModel} from "../themes/index.ts";

export interface EditorState {
  content: string;
  markdownThemeId: string;
  themes: ThemeOption[];
  selectedModelId: string | null; // 当前面板编辑的元素 model id
  setContent: (content: string) => void;
  setMarkdownTheme: (id: string) => void;
  setThemes: (themes: ThemeOption[]) => void;
  setSelectedModel: (modelId: string | null) => void;
  // 改当前主题某个 style 项的值（按 model id + style 路径），重编译 css
  updateStyleValue: (modelId: string, stylePath: string[], value: string) => void;
}

function recompile(theme: ThemeOption): ThemeOption {
  return {...theme, css: compileModel(theme.model)};
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      themes: builtinThemes,
      selectedModelId: null,
      setContent: (content) => set({content}),
      setMarkdownTheme: (markdownThemeId) => set({markdownThemeId}),
      setThemes: (themes) => set({themes}),
      setSelectedModel: (selectedModelId) => set({selectedModelId}),
      updateStyleValue: (modelId, stylePath, value) =>
        set((s) => ({
          themes: s.themes.map((t) => {
            if (t.id !== s.markdownThemeId) return t;
            const model = t.model.map((m) => {
              if (m.id !== modelId) return m;
              return {...m, styles: setValueByPath(m.styles, stylePath, value)};
            });
            return recompile({...t, model});
          }),
        })),
    }),
    {
      name: "vellumstyle",
      partialize: (s) => ({content: s.content, markdownThemeId: s.markdownThemeId}),
    },
  ),
);

// 按 style.id 路径（顶层或 children）定位并改值，返回新数组（不可变更新）
function setValueByPath(
  styles: import("../themes/themeModel.ts").StyleItem[],
  path: string[],
  value: string,
): import("../themes/themeModel.ts").StyleItem[] {
  const [head, ...rest] = path;
  return styles.map((item) => {
    if (item.id !== head) return item;
    if (rest.length === 0) return {...item, value};
    return {...item, children: item.children ? setValueByPath(item.children, rest, value) : item.children};
  });
}

export function getThemeById(themes: ThemeOption[], id: string): ThemeOption {
  return themes.find((t) => t.id === id) ?? defaultMarkdownTheme;
}

export type {StyleModel};
```

- [ ] **Step 2: 验证类型**

Run: `npx tsc -b --noEmit 2>&1 | grep store`
Expected: store/index.ts 无错（其它文件错误后续修）。

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add model editing state and updateStyleValue to store"
```

---

## Task 7: elementMap —— 点击 DOM → model id

**Files:**
- Create: `src/components/StylePanel/elementMap.ts`
- Test: `src/components/StylePanel/elementMap.test.ts`

> 用 `closest()` 按优先级匹配。测试用 `node:test`，无 DOM 环境，因此把核心逻辑写成接受「selector 命中判断函数」的纯函数 + 一个 DOM 包装，单测纯函数部分。

- [ ] **Step 1: Write the failing test**

```ts
// src/components/StylePanel/elementMap.test.ts
import {test} from "node:test";
import assert from "node:assert/strict";
import {matchModelId, SELECTOR_PRIORITY} from "./elementMap.ts";

// matchModelId(matches): 给定一个 selector→boolean 判断器，返回命中的 model id
test("h1 命中 h1", () => {
  assert.equal(matchModelId((sel) => sel === "h1"), "h1");
});

test("p 在 blockquote 内优先归 blockquote", () => {
  // blockquote 在优先级表中先于 p
  assert.equal(matchModelId((sel) => sel === "p" || sel === "blockquote"), "blockquote");
});

test("th 归 tableHead", () => {
  assert.equal(matchModelId((sel) => sel === "th"), "tableHead");
});

test("无命中返回 null", () => {
  assert.equal(matchModelId(() => false), null);
});

test("优先级表覆盖所有可点击元素", () => {
  const ids = SELECTOR_PRIORITY.map((e) => e.modelId);
  for (const id of ["h1", "h2", "p", "blockquote", "ul", "ol", "a", "strong", "em", "blockCode", "inlineCode", "table", "tableHead", "tableBody", "image", "imageDescription"]) {
    assert.ok(ids.includes(id), `缺 ${id}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="命中|归|优先级|null"`
Expected: FAIL（找不到模块）

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/StylePanel/elementMap.ts

// 优先级表：更具体的在前。selector 用 CSS selector 字符串（供 closest 用），
// matchModelId 用的判断器只看是否命中该 selector。
export interface SelectorEntry {
  selector: string;
  modelId: string;
}

// 顺序即优先级：blockquote/table 子元素先于通用 p
export const SELECTOR_PRIORITY: SelectorEntry[] = [
  {selector: "th", modelId: "tableHead"},
  {selector: "td", modelId: "tableBody"},
  {selector: "table", modelId: "table"},
  {selector: "figcaption", modelId: "imageDescription"},
  {selector: "img", modelId: "image"},
  {selector: "pre", modelId: "blockCode"},
  {selector: "code", modelId: "inlineCode"},
  {selector: "blockquote", modelId: "blockquote"},
  {selector: ".multiquote-1", modelId: "blockquote"},
  {selector: ".multiquote-2", modelId: "blockquote"},
  {selector: ".multiquote-3", modelId: "blockquote"},
  {selector: "h1", modelId: "h1"},
  {selector: "h2", modelId: "h2"},
  {selector: "h3", modelId: "h3"},
  {selector: "h4", modelId: "h4"},
  {selector: "h5", modelId: "h5"},
  {selector: "h6", modelId: "h6"},
  {selector: "a", modelId: "a"},
  {selector: "strong", modelId: "strong"},
  {selector: "em", modelId: "em"},
  {selector: "del", modelId: "del"},
  {selector: "ul", modelId: "ul"},
  {selector: "ol", modelId: "ol"},
  {selector: "p", modelId: "p"},
];

// 纯逻辑：matches(selector) 返回该 selector 是否命中。按优先级返回首个命中的 modelId。
export function matchModelId(matches: (selector: string) => boolean): string | null {
  for (const entry of SELECTOR_PRIORITY) {
    if (matches(entry.selector)) return entry.modelId;
  }
  return null;
}

// DOM 包装：从点击的元素向上找最近祖先命中优先级表。
export function modelIdFromElement(el: Element): string | null {
  return matchModelId((selector) => el.closest(selector) != null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="命中|归|优先级|null"`
Expected: PASS（5 项）

- [ ] **Step 5: Commit**

```bash
git add src/components/StylePanel/elementMap.ts src/components/StylePanel/elementMap.test.ts
git commit -m "feat: add DOM element to model id mapping"
```

---

## Task 8: 控件组件（按 style.id 渲染）

**Files:**
- Create: `src/components/StylePanel/controls.tsx`

> 纯展示+回调组件，无独立测试（UI 在集成时验证）。每个控件接收 `value` 与 `onChange(value)`。

- [ ] **Step 1: 实现控件**

```tsx
// src/components/StylePanel/controls.tsx
import type {StyleItem} from "../../themes/themeModel.ts";

interface CtrlProps {
  item: StyleItem;
  onChange: (value: string) => void;
}

// 数值+单位（fontSize/lineHeight/letterSpacing）。简单用文本框，保留原单位写法。
function TextControl({item, onChange}: CtrlProps) {
  return (
    <input
      type="text"
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{width: "100%", height: 28, fontSize: 13, padding: "0 6px", border: "1px solid #d9d9d9", borderRadius: 4}}
    />
  );
}

// rgba 取色器：input[type=color] 只认 #hex，旁边再放文本框存原始 rgba。
function ColorControl({item, onChange}: CtrlProps) {
  return (
    <input
      type="text"
      value={item.value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="rgba(0,0,0,1)"
      style={{width: "100%", height: 28, fontSize: 13, padding: "0 6px", border: "1px solid #d9d9d9", borderRadius: 4}}
    />
  );
}

function AlignControl({item, onChange}: CtrlProps) {
  const opts = ["left", "center", "right"];
  return (
    <div style={{display: "flex", gap: 4}}>
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{flex: 1, height: 28, fontSize: 12, border: "1px solid #d9d9d9", borderRadius: 4,
            background: item.value === o ? "#1e6bb8" : "#fff", color: item.value === o ? "#fff" : "#333", cursor: "pointer"}}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function WeightControl({item, onChange}: CtrlProps) {
  return (
    <div style={{display: "flex", gap: 4}}>
      {["normal", "bold"].map((o) => (
        <button key={o} onClick={() => onChange(o)}
          style={{flex: 1, height: 28, fontSize: 12, border: "1px solid #d9d9d9", borderRadius: 4,
            background: item.value === o ? "#1e6bb8" : "#fff", color: item.value === o ? "#fff" : "#333", cursor: "pointer"}}>
          {o}
        </button>
      ))}
    </div>
  );
}

function CommonControl({item, onChange}: CtrlProps) {
  return (
    <textarea value={item.value ?? ""} onChange={(e) => onChange(e.target.value)} rows={4}
      style={{width: "100%", fontSize: 12, fontFamily: "monospace", border: "1px solid #d9d9d9", borderRadius: 4, padding: 6}} />
  );
}

// 按 style.id 选控件
export function renderControl(item: StyleItem, onChange: (value: string) => void) {
  const id = item.id;
  if (/Color$/i.test(id) || id === "fontColor") return <ColorControl item={item} onChange={onChange} />;
  if (id === "textAlign") return <AlignControl item={item} onChange={onChange} />;
  if (id === "fontWeight") return <WeightControl item={item} onChange={onChange} />;
  if (id === "common") return <CommonControl item={item} onChange={onChange} />;
  return <TextControl item={item} onChange={onChange} />;
}
```

- [ ] **Step 2: 验证类型**

Run: `npx tsc -b --noEmit 2>&1 | grep controls`
Expected: 无 controls.tsx 报错。

- [ ] **Step 3: Commit**

```bash
git add src/components/StylePanel/controls.tsx
git commit -m "feat: add style panel control widgets"
```

---

## Task 9: StylePanel 面板容器

**Files:**
- Create: `src/components/StylePanel/StylePanel.tsx`

> 遍历当前主题中选中 model 的 styles，逐项（含 children 展开）渲染控件；改值调 `updateStyleValue(modelId, path, value)`。

- [ ] **Step 1: 实现面板**

```tsx
// src/components/StylePanel/StylePanel.tsx
import {useStore, getThemeById} from "../../store/index.ts";
import type {StyleItem} from "../../themes/themeModel.ts";
import {renderControl} from "./controls.tsx";

export default function StylePanel() {
  const {selectedModelId, setSelectedModel, themes, markdownThemeId, updateStyleValue} = useStore();
  if (!selectedModelId) return null;

  const theme = getThemeById(themes, markdownThemeId);
  const model = theme.model.find((m) => m.id === selectedModelId);
  if (!model) return null;

  // 渲染一个 style 项：有 children 则递归展开（path 累积 style.id 链）
  function renderItem(item: StyleItem, path: string[]) {
    if (item.children && item.children.length > 0) {
      return (
        <div key={item.id} style={{marginBottom: 12}}>
          <div style={{fontSize: 12, color: "#999", marginBottom: 4}}>{item.id}</div>
          {item.children.map((c) => renderItem(c, [...path, c.id]))}
        </div>
      );
    }
    return (
      <div key={item.id} style={{marginBottom: 10}}>
        <div style={{fontSize: 12, color: "#666", marginBottom: 4}}>{item.id}</div>
        {renderControl(item, (value) => updateStyleValue(selectedModelId!, path, value))}
      </div>
    );
  }

  return (
    <div style={{width: 280, flexShrink: 0, borderLeft: "1px solid #e8e8e8", background: "#fafafa",
      padding: 16, overflowY: "auto", height: "100%"}}>
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12}}>
        <strong style={{fontSize: 14, color: "#333"}}>{model.label || model.id}</strong>
        <button onClick={() => setSelectedModel(null)}
          style={{border: "none", background: "transparent", fontSize: 18, color: "#999", cursor: "pointer"}}>×</button>
      </div>
      {model.styles.map((s) => renderItem(s, [s.id]))}
    </div>
  );
}
```

- [ ] **Step 2: 验证类型**

Run: `npx tsc -b --noEmit 2>&1 | grep StylePanel`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add src/components/StylePanel/StylePanel.tsx
git commit -m "feat: add style panel container"
```

---

## Task 10: Preview 接入点击识别 + 移除 basic 层

**Files:**
- Modify: `src/components/Preview/Preview.tsx`

- [ ] **Step 1: 改写 Preview.tsx**

```tsx
import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from "react";
import {render} from "../../markdown/parser.ts";
import {useStore, getThemeById} from "../../store/index.ts";
import {replaceStyle, STYLE_IDS} from "../../utils/style.ts";
import {toProxyHtml} from "../../utils/imageProxy.ts";
import {modelIdFromElement} from "../StylePanel/elementMap.ts";

interface Props {
  content: string;
  markdownThemeId: string;
}

export interface PreviewHandle {
  getScroller: () => HTMLElement | null;
}

const RENDER_THROTTLE_MS = 100;

const Preview = forwardRef<PreviewHandle, Props>(({content, markdownThemeId}, ref) => {
  const [html, setHtml] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const themes = useStore((s) => s.themes);
  const setSelectedModel = useStore((s) => s.setSelectedModel);

  useImperativeHandle(ref, () => ({getScroller: () => scrollRef.current}));

  // 主题层：model 编译出的 css。basic 层已废弃，不再注入。
  useEffect(() => {
    const css = getThemeById(themes, markdownThemeId).css;
    replaceStyle(STYLE_IDS.markdown, css);
    replaceStyle(STYLE_IDS.code, "");
  }, [markdownThemeId, themes]);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHtml(toProxyHtml(render(content))), RENDER_THROTTLE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [content]);

  // 点击预览元素 → 识别 model id → 打开面板
  function onClick(e: React.MouseEvent) {
    const target = e.target as Element;
    const id = modelIdFromElement(target);
    if (id) setSelectedModel(id);
  }

  return (
    <div ref={scrollRef} style={{height: "100%", overflowY: "auto", background: "#fff"}}>
      <div id="nice-rich-text-box" style={{padding: "24px 32px", minHeight: "100%"}} onClick={onClick}>
        <section id="nice" dangerouslySetInnerHTML={{__html: html}} />
      </div>
    </div>
  );
});

Preview.displayName = "Preview";
export default Preview;
```

- [ ] **Step 2: 验证类型**

Run: `npx tsc -b --noEmit 2>&1 | grep Preview`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add src/components/Preview/Preview.tsx
git commit -m "feat: wire click-to-select in preview, drop basic layer injection"
```

---

## Task 11: converter.ts 移除 basic 层拼接

**Files:**
- Modify: `src/markdown/converter.ts:40-44`

- [ ] **Step 1: 改 solveHtml 的 allCss**

```ts
// 删除 readStyle(STYLE_IDS.basic) 这一行
const allCss =
  readStyle(STYLE_IDS.markdown) +
  readStyle(STYLE_IDS.code) +
  readStyle(STYLE_IDS.font);
```

- [ ] **Step 2: 验证类型并跑测试**

Run: `npx tsc -b --noEmit && npm test`
Expected: tsc 通过；测试全 PASS。

- [ ] **Step 3: Commit**

```bash
git add src/markdown/converter.ts
git commit -m "refactor: drop basic layer from copy pipeline"
```

---

## Task 12: App 接入 StylePanel

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 main 区右侧渲染 StylePanel**

在 `src/App.tsx` 顶部加 import：

```tsx
import StylePanel from "./components/StylePanel/StylePanel.tsx";
```

把 `<main>` 内预览那块改为预览 + 面板并排（面板在 selectedModelId 非空时显示）：

```tsx
<div style={{flex: 1, minWidth: 0, display: "flex"}}>
  <div style={{flex: 1, minWidth: 0}}>
    <Preview ref={previewRef} content={content} markdownThemeId={markdownThemeId} />
  </div>
  <StylePanel />
</div>
```

- [ ] **Step 2: 验证类型**

Run: `npx tsc -b --noEmit`
Expected: 全通过。

- [ ] **Step 3: 手动验证（dev）**

Run: `npm run dev:web`
Expected: 浏览器打开后，点击预览区某段 `p` / 标题 → 右侧出现面板显示该元素的 style 项；改字号文本框 → 预览实时变化。

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount style panel beside preview"
```

---

## Task 13: themes.rs 改写为 JSON model 存储 + 导入

**Files:**
- Modify: `src-tauri/src/themes.rs`（整体改写）
- Modify: `src-tauri/src/lib.rs:62-75`

- [ ] **Step 1: 改写 themes.rs**

```rust
// src-tauri/src/themes.rs
// 用户自定义主题：扫描 app_data_dir/themes/*.json（model 主题）。
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct UserTheme {
    pub id: String,
    pub model: serde_json::Value, // styleModelList 数组
}

fn themes_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("themes"))
}

#[tauri::command]
pub fn list_user_themes(app: AppHandle) -> Vec<UserTheme> {
    let Some(dir) = themes_dir(&app) else { return Vec::new() };
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut themes = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_json = path.extension().and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("json")).unwrap_or(false);
        if !is_json { continue; }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string()) else { continue };
        if let Ok(text) = std::fs::read_to_string(&path) {
            if let Ok(model) = serde_json::from_str::<serde_json::Value>(&text) {
                themes.push(UserTheme {id, model});
            }
        }
    }
    themes.sort_by(|a, b| a.id.cmp(&b.id));
    themes
}

// 保存用户主题：写 themes/{id}.json，内容为 styleModelList 数组的 JSON。
#[tauri::command]
pub fn save_user_theme(app: AppHandle, id: String, model_json: String) -> Result<(), String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败：{e}"))?;
    // 校验是合法 JSON
    serde_json::from_str::<serde_json::Value>(&model_json).map_err(|e| format!("非法 JSON：{e}"))?;
    let safe_id: String = id.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    if safe_id.is_empty() { return Err("非法主题 id".into()); }
    let path = dir.join(format!("{safe_id}.json"));
    std::fs::write(&path, model_json).map_err(|e| format!("写入失败：{e}"))?;
    Ok(())
}

// 导入 mdnice 抓包整包：取 data.styleModelList 存为 {id}.json。返回保存的 id。
#[tauri::command]
pub fn import_mdnice_theme(app: AppHandle, id: String, raw_json: String) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(&raw_json).map_err(|e| format!("非法 JSON：{e}"))?;
    let model = parsed.get("data").and_then(|d| d.get("styleModelList"))
        .ok_or_else(|| "JSON 中找不到 data.styleModelList".to_string())?;
    if !model.is_array() { return Err("styleModelList 不是数组".into()); }
    let model_json = serde_json::to_string(model).map_err(|e| e.to_string())?;
    save_user_theme(app, id.clone(), model_json)?;
    let safe_id: String = id.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
    Ok(safe_id)
}

#[tauri::command]
pub fn ensure_themes_dir(app: AppHandle) -> Result<String, String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败：{e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_themes_dir(app: AppHandle) -> Result<(), String> {
    let dir = themes_dir(&app).ok_or_else(|| "无法定位数据目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建主题目录失败：{e}"))?;
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&dir).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&dir).spawn();
    result.map(|_| ()).map_err(|e| format!("打开目录失败：{e}"))
}
```

- [ ] **Step 2: 注册新命令（lib.rs）**

在 `tauri::generate_handler!` 列表的 themes 部分改为：

```rust
            themes::list_user_themes,
            themes::save_user_theme,
            themes::import_mdnice_theme,
            themes::ensure_themes_dir,
            themes::open_themes_dir
```

- [ ] **Step 3: 编译 Rust**

Run: `cd src-tauri && cargo build 2>&1 | tail -5`
Expected: 编译通过（serde_json 已是依赖；若缺则 `cargo add serde_json`）。

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/themes.rs src-tauri/src/lib.rs
git commit -m "feat: store themes as model JSON, add save and import commands"
```

---

## Task 14: loader 改写 + 导入入口

**Files:**
- Modify: `src/themes/loader.ts`
- Modify: `src/components/Theme/ThemePickerDialog.tsx`

- [ ] **Step 1: 改写 loader.ts**

```ts
// src/themes/loader.ts
import {invoke} from "@tauri-apps/api/core";
import {builtinThemes, type ThemeOption, type StyleModel} from "./index.ts";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";

// 启动：内置 model 主题 + 用户目录 *.json 扫描，编译出 css。
export async function loadAllThemes(): Promise<ThemeOption[]> {
  let user: ThemeOption[] = [];
  try {
    const raw = await invoke<{id: string; model: unknown}[]>("list_user_themes");
    const builtinIds = new Set(builtinThemes.map((t) => t.id));
    user = raw
      .filter((u) => !builtinIds.has(u.id) && validateModel(u.model))
      .map((u) => {
        const model = u.model as StyleModel[];
        return {id: u.id, name: u.id, css: compileModel(model), model};
      });
  } catch {
    // 非 Tauri 环境，仅内置主题
  }
  return [...builtinThemes, ...user];
}

export async function openThemesDir(): Promise<void> {
  await invoke("open_themes_dir");
}

// 导入 mdnice 抓包 JSON：raw 为整包字符串，id 为新主题名。
export async function importMdniceTheme(id: string, raw: string): Promise<void> {
  await invoke("import_mdnice_theme", {id, rawJson: raw});
}
```

- [ ] **Step 2: ThemePickerDialog 加导入按钮**

在 `src/components/Theme/ThemePickerDialog.tsx` 引入：

```tsx
import {loadAllThemes, openThemesDir, importMdniceTheme} from "../../themes/loader.ts";
```

加导入处理函数（放在 `openFolder` 旁）：

```tsx
async function importTheme() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const raw = await file.text();
    const name = file.name.replace(/\.json$/i, "");
    try {
      await importMdniceTheme(name, raw);
      setThemes(await loadAllThemes());
    } catch (e) {
      window.alert("导入失败：" + (e as Error).message);
    }
  };
  input.click();
}
```

在底部「打开主题文件夹」按钮旁加一个按钮：

```tsx
<button onClick={importTheme}
  style={{height: 28, padding: "0 12px", fontSize: 12, border: "1px solid #d9d9d9",
    borderRadius: 4, background: "#fff", color: "#1e6bb8", cursor: "pointer", marginLeft: 8}}>
  ↑ 导入 mdnice 主题
</button>
```

- [ ] **Step 3: 验证类型**

Run: `npx tsc -b --noEmit`
Expected: 全通过。

- [ ] **Step 4: Commit**

```bash
git add src/themes/loader.ts src/components/Theme/ThemePickerDialog.tsx
git commit -m "feat: load model themes and add mdnice import entry"
```

---

## Task 15: 全量验证 + ThemeThumbnail 兼容

**Files:**
- Modify: `src/components/Theme/ThemeThumbnail.tsx`（必改：现 import 了 basic）

> 已确认 `ThemeThumbnail.tsx:3` `import {basic}` 且 `:19` 用 `scopeCss(basic, ...)`。Task 5 删除 basic.ts 后此处必然编译失败，本任务移除 basic 引用（model 主题的 css 已自包含全部样式）。

- [ ] **Step 1: 移除 ThemeThumbnail 的 basic 引用**

删除第 3 行 `import {basic} from "../../themes/index.ts";`，并把 useMemo 里的样式拼接改为仅 css：

```tsx
// 原：scopeCss(basic, scopeClass) + "\n" + scopeCss(css, scopeClass)
// 改为：
() => scopeCss(css, scopeClass),
```

- [ ] **Step 2: 全量类型检查与测试**

Run: `npm test && npx tsc -b --noEmit`
Expected: 测试全 PASS；tsc 无错。

- [ ] **Step 3: 集成手动验证（dev）**

Run: `npm run dev:web`
Expected:
1. 点击预览区段落 → 右侧面板出现 → 改字号 → 预览实时变。
2. 点标题/引用/链接 → 面板切换到对应 model。
3. 打开主题对话框 → 「导入 mdnice 主题」→ 选 `草原绿.json` → 列表新增「草原绿」→ 使用后预览变绿色主题 → 点元素可在面板回填其值。

- [ ] **Step 4: 完整桌面构建验证**

Run: `npm run tauri dev`（确认 Rust 命令在真实 Tauri 环境工作：导入写入 app_data_dir/themes/*.json、重启后仍在）
Expected: 导入的主题持久化，重启后仍可编辑。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "test: verify visual style panel end-to-end"
```

---

## 自查记录

- **spec 覆盖**：交互识别(Task7/10)、schema(Task1)、编译器(Task2/3)、面板控件(Task8/9)、存储导入(Task13/14)、default model 构造(Task4)、统一 model-only 与清理(Task5/11/15)、复制管线(Task11) 均有对应任务。
- **类型一致**：`StyleModel/StyleItem/StyleKey`(Task1) 贯穿；`updateStyleValue(modelId, path, value)`(Task6) 与 StylePanel 调用(Task9) 一致；`compileModel(StyleModel[])` 签名各处一致；Rust 命令 `import_mdnice_theme(id, raw_json)` 与前端 `importMdniceTheme(id, raw)` 参数 `{id, rawJson}` 对应。
- **format**：明确忽略，无残留。
