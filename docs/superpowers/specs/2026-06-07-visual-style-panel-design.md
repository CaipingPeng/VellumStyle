# 可视化样式面板（Visual Style Panel）设计

日期：2026-06-07
状态：待实现

## 背景与目标

当前主题系统是「纯 CSS 文本即主题」：`basic.ts` 基础层 + `themes/markdown/*.css` 主题层叠加注入 `#nice` 作用域。覆盖度已与 mdnice 同源（基于 mdnice basic.js），但缺少**可视化逐项调样式**的能力——用户无法点击预览元素、拖控件改字号/颜色/间距。

本功能引入 mdnice 商业版的交互形态：**点击预览区某类元素 → 右侧弹出属性面板 → 调整这一类元素的样式（编辑主题）→ 实时预览 → 存为可再编辑的主题**。

### 已确认的需求

1. **交互**：点击预览元素 → 调的是「这一类元素」的样式（编辑整个主题，非单个元素行内覆盖）。
2. **schema**：直接采用 mdnice 的 model schema（`styleModelList`：`styles / keys / children / format`），可直接导入 mdnice 抓包 JSON。
3. **存储**：自定义/导入主题存 **model JSON**，前端写 **model→CSS 编译器**；内置 CSS 主题保持只读预设。
4. **范围**：全套（点击识别、属性面板、全部控件、编译器、实时预览、存 JSON、导入 mdnice JSON）。

## 架构总览

核心数据链：

```
mdnice model JSON  ──┐
                     ├─→ [model→CSS 编译器] ─→ CSS 字符串 ─→ replaceStyle 注入 #nice 预览
用户面板调整 → 改 model.value ─┘                                  │
       ▲                                                         │
       └──────── 点击预览元素 → 识别 token → 从 model 回填面板 ◄──┘
```

### 关键事实（基于现有代码核实）

- `markdown/plugins/heading-span.ts` 已产出 `<h1><span class="content">…</span></h1>` 结构 → mdnice 选择器 `#nice h1 .content` **直接可用**，无需改渲染管线。
- 预览注入走现成 `replaceStyle(STYLE_IDS.markdown, css)`（`Preview.tsx`）→ 编译器产出的 CSS 走同一注入路径，**实时预览天然成立**。
- 复制管线 `converter.ts:solveHtml()` 读的是已注入到 `STYLE_IDS.markdown` 的 CSS → model 主题的 CSS 已在该层 → **juice 内联与复制到微信无需任何改动**。

### 主题双形态

`ThemeOption` 扩展一个可选 `model` 字段以区分两类主题：

```ts
interface ThemeOption {
  id: string;
  name: string;
  css: string;            // 注入预览/复制用；model 主题由编译器填充
  model?: StyleModel[];   // 仅 model 主题有；存在即「可进面板编辑」
}
```

- **CSS 主题**（内置 `markdown/*.css`）：只读预设，不进面板。
- **Model 主题**（导入的 mdnice JSON / 用户新建）：可进面板编辑，其 `css` 由编译器实时产出。

## 模块划分（各自单一职责）

| 模块 | 职责 | 依赖 |
|---|---|---|
| `src/themes/themeModel.ts` | mdnice schema 的 TS 类型 + 导入校验 | 无 |
| `src/themes/compileModel.ts` | model → CSS（纯函数，可单测） | themeModel |
| `src/components/StylePanel/elementMap.ts` | 点击 DOM 元素 → model id | 无 |
| `src/components/StylePanel/` | 右侧属性面板（控件按 model 动态渲染） | compileModel, store |
| `src-tauri/src/themes.rs`（扩展） | JSON 主题读 / 写 / 导入命令 | 现有 |

## 详细设计

### 1. `themeModel.ts` —— schema 类型与校验

对照 `草原绿.json` 的 `data.styleModelList` 结构定义 TS 类型：

```ts
interface StyleKey { selector: string; key: string; format: string | null }
interface StyleItem {
  id: string;
  value: string | null;
  keys: StyleKey[] | null;
  children: StyleItem[] | null;
}
interface StyleModel {
  id: string;        // global / p / h1.../ blockquote / table / footnote / block1-5 ...
  label: string;
  styles: StyleItem[];
  selectors?: string[];
}
```

校验：导入时检查 `data.styleModelList` 是数组、每项有 `id/styles`；宽容处理未知字段（mdnice 改版兼容）。

### 2. `compileModel.ts` —— model → CSS（纯函数）

输入 `StyleModel[]`，输出 CSS 字符串。算法：

```
ruleMap: Map<selector, Map<key, value>>
commonBlocks: string[]

遍历每个 model 的 styles（递归 children）：
  对每个 style 项：
    ├─ 有 keys：对每个 {selector, key, format}
    │     value' = format ? applyFormat(format, value) : value
    │     ruleMap[selector][key] = value'
    ├─ 有 children：递归（marginPadding / border / background 等复合项）
    └─ id === 'common'：value 原样 push 到 commonBlocks

输出：ruleMap 拼成 `selector { key: value; … }`，再追加所有 commonBlocks
```

要点：
- 同 selector 的多个 key 合并成一条规则（产出与 `data.style` 一致的展开形式）。
- `format` 本主题为 null 但需实现（mdnice 用于 `url(...)`、加单位等模板）。占位符约定在导入真实带 format 的主题时再敲定，先用 `{value}` 占位。
- 纯函数、无副作用。

**测试 oracle（关键）**：用 `草原绿.json` 的 `styleModelList` 编译，与其自带的 `data.style` 比对（CSS 规则集等价，忽略顺序/空白差异）。这是天然的回归基准。

### 3. `elementMap.ts` —— 点击 DOM → model id

从 `event.target` 用 `closest()` 逐级向上匹配优先级表：

| 命中 DOM | model id |
|---|---|
| `h1~h6`（含其 `.content/.prefix/.suffix` 子节点） | `h1`~`h6` |
| `p`（不在 blockquote/li 内） | `p` |
| `.multiquote-1/2/3` 或 `blockquote` | `blockquote` |
| `ul` / `ol` | `ul` / `ol` |
| `a` / `strong` / `em` / `del` | 对应 id |
| `pre code` / 行内 `code` | `blockCode` / `inlineCode` |
| `th` / `td` / `tr` / `table` | `tableHead` / `tableBody` / `table` |
| `img` / `figcaption` | `image` / `imageDescription` |

优先级表保证更具体的选择器先命中（如 p 在 blockquote 内时归 blockquote）。命中后高亮元素并打开对应 model 的面板。

**未命中**（空白/不支持元素）：不弹面板（保持当前面板或关闭）。不做 global 兜底，避免误触。

### 4. `StylePanel/` —— 属性面板（控件动态渲染）

面板不写死，遍历选中 model 的 `styles`，按 `style.id` 映射控件：

| style.id 模式 | 控件 |
|---|---|
| `fontSize` / `lineHeight` / `letterSpacing` | 数值+单位输入 |
| `*Color`（fontColor/backgroundColor/borderColor…） | rgba 取色器 |
| `textAlign` | 左/中/右 按钮组 |
| `fontWeight` | normal/bold 切换 |
| `marginPadding`（children=8） | 四向间距（margin/padding × 上下左右） |
| `border`（children） | 边框：样式/宽度/颜色/圆角 |
| `background`（children） | 背景组 |
| `common`（自由 CSS） | 多行文本框（高级） |
| 未知 id | 兜底文本输入 |

数据流（单向）：

```
控件改值 → 写回 model[i].styles[j].value → 编译器重编译 → replaceStyle 注入 → 预览更新
打开面板 → 控件初值读 style.value（model 即真相，无双份状态）
```

### 5. 存储与导入（`themes.rs` 扩展）

Rust 侧新增 Tauri 命令：

- `save_user_theme(id: String, json: String)` —— 写 `app_data_dir/themes/{id}.json`。
- `import_mdnice_theme(json: String)` —— 接受抓包整包 `{success,code,data:{styleModelList,style}}`，校验后存为 model 主题：取 `data.styleModelList` 作 model、`data.style` 作初始 css 缓存。
- `list_user_themes`（扩展）—— 同时扫描 `*.css`（→CSS 主题）与 `*.json`（→model 主题）。

前端 `loader.ts` 合并：JSON 主题带 `model` 字段，加载时以编译器重算 css（或用缓存的 `data.style`）。

**导入入口**：主题选择器对话框（已存在 `ThemePickerDialog.tsx`）加「导入 mdnice 主题」按钮 → 选 JSON 文件 → 调 `import_mdnice_theme`。

### 6. 复制管线（无需改动）

`solveHtml()` 读已注入 `STYLE_IDS.markdown` 的 CSS；model 主题 CSS 已由编译器注入该层 → juice 内联与复制到微信照常工作。

## 测试策略

- **compileModel**（TDD 重点）：以 `草原绿.json` 为 oracle，编译结果与 `data.style` 规则等价；覆盖 keys / children 递归 / common / format。
- **elementMap**：构造各类 DOM 片段，断言映射到正确 model id；重点测优先级（p-in-blockquote、heading 的 .content 子节点）。
- **StylePanel**：控件改值后 model.value 更新、编译触发、预览 CSS 变化。
- **集成**：导入 `草原绿.json` → 面板可回填 → 改一项 → 预览变化 → 存 JSON → 重载仍可编辑。

## 非目标（YAGNI）

- 不做「仅此一个元素」的行内覆盖（已确认走 mdnice 的「按类编辑」）。
- 不给内置 CSS 主题反向生成 model（CSS→model 反解析脆弱，明确排除）。
- 不做主题在线市场/云同步。

## 风险

- **format 字段**：本样本为 null，真实模板格式待真带 format 的主题导入时确认；编译器先以 `{value}` 占位实现，留扩展点。
- **点击识别优先级**：嵌套结构（p in blockquote、figure 内 img+caption）易误判，靠优先级表 + 充分单测兜住。
