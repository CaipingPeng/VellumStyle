# 发布前图片校验与确认发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 排除代码示例造成的图片误报，展示带行号的问题图片详情，并允许用户在明确风险后仅本次继续发布。

**Architecture:** 在媒体扫描层新增保持源码坐标的代码范围识别与过滤；发布工具层把字符串列表升级为完整诊断；发布对话框用同一模态框的内部警告视图承载确认，抽取一次性实际发布流程并用 ref 防重入。所有改动先写回归测试，并覆盖导入、封面候选和 UI 状态。

**Tech Stack:** TypeScript、React 18、markdown-it 14、Node test runner、JSDOM、Tauri invoke mock、Tailwind CSS。

---

## 文件结构

- Modify: `src/utils/markdownMediaScanner.ts` — 识别代码范围、过滤媒体引用且保持原坐标。
- Modify: `src/utils/markdownMediaScanner.test.ts` — 扫描语义和坐标回归。
- Modify: `src/utils/markdownImport.test.ts` — 确认代码示例不上传/替换。
- Modify: `src/utils/publish.ts` — 结构化问题诊断、严格微信域名判断、行列计算。
- Modify: `src/utils/publish.test.ts` — 分类、位置、封面候选和问题文章 fixture 回归。
- Create: `src/components/Publish/UnuploadedImagesWarning.tsx` — 同一发布 Dialog 内的纯警告视图。
- Create: `src/components/Publish/UnuploadedImagesWarning.test.tsx` — 详情渲染、初始焦点和 Escape 行为。
- Modify: `src/components/Publish/PublishDialog.tsx` — 警告状态、一次性继续发布、防重入、状态重置。
- Create: `src/components/Publish/publishFlow.test.tsx` — 父对话框的返回、继续、重扫、重入和重开回归。
- Modify: `src/markdown/parser.test.ts` — 固定 fixture 的可见代码文本回归。
- Modify: `src/markdown/converter.test.ts` — 草稿 HTML 中示例文本保持不变。
- Modify: `package.json` — 全量测试同时包含 `.test.ts` 和 `.test.tsx`。

### Task 1: 代码范围过滤器

**Files:**
- Modify: `src/utils/markdownMediaScanner.ts`
- Test: `src/utils/markdownMediaScanner.test.ts`

- [ ] **Step 1: 写行内代码与真实图片并存的失败测试**

加入用例：两处 `` `![...](...)` `` 返回 0；代码外 `![真实](real.png)` 返回 1；多级列表缩进图片仍返回 1，并断言 `originalUrl/start/end` 精确对应原文。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --import tsx --import ./src/test/setupDom.ts --test --test-name-pattern="inline code|indented list image" src/utils/markdownMediaScanner.test.ts`
Expected: FAIL，代码 span 中仍产生媒体引用。

- [ ] **Step 3: 实现最小行内代码范围识别**

在 `markdownMediaScanner.ts` 增加私有 `SourceRange`、`findIgnoredCodeRanges()`、`findInlineCodeRanges()`、`overlapsRange()`；按相同长度反引号串配对，未闭合串不生成忽略范围。保持原 Markdown 不变，在 `dedupeRefs` 后过滤相交引用。

- [ ] **Step 4: 运行定向测试**

Run: `node --import tsx --import ./src/test/setupDom.ts --test --test-name-pattern="inline code|indented list image" src/utils/markdownMediaScanner.test.ts`
Expected: PASS。

- [ ] **Step 5: 写围栏代码块失败测试**

覆盖反引号/波浪线围栏、引用内围栏、嵌套列表围栏、未闭合块级围栏、普通句中 triple backticks、带尾随文字的无效关闭符，以及围栏后的真实图片。

- [ ] **Step 6: 运行测试确认失败**

Run: `node --import tsx --import ./src/test/setupDom.ts --test --test-name-pattern="fenced code" src/utils/markdownMediaScanner.test.ts`
Expected: FAIL，围栏中的图片仍被扫描。

- [ ] **Step 7: 实现块级围栏状态扫描**

逐行保留绝对 offset；剥离允许的 blockquote/list 容器前缀后识别块级 fence opener；记录字符和长度；只接受同字符、长度足够且仅剩空白的 closer；未闭合围栏范围延伸到 EOF。不要以四空格缩进作为忽略条件。

- [ ] **Step 8: 写并实现 HTML code/pre 边界测试**

先加入 `<code>`、带属性/大小写/跨行标签、闭合 `<pre>`、未闭合 inline `<code>` 后真实图片仍扫描、未闭合块级 `<pre>` 忽略到 EOF 的失败测试；再实现 HTML 范围识别与重叠区间合并。

- [ ] **Step 9: 跑扫描器完整测试并提交**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/utils/markdownMediaScanner.test.ts`
Expected: all PASS。

```bash
git add src/utils/markdownMediaScanner.ts src/utils/markdownMediaScanner.test.ts
git commit -m "修复代码示例中的媒体误识别"
```

### Task 2: 保证导入消费者兼容

**Files:**
- Modify: `src/utils/markdownImport.test.ts`
- Test: `src/utils/markdownMediaScanner.test.ts`

- [ ] **Step 1: 写导入失败测试**

构造同时含行内/围栏图片示例和一张真实图片的 Markdown，mock `upload_remote_image`；断言仅真实图片计入 `totalRefs`、仅上传一次、示例原文不变、真实媒体替换坐标正确。

- [ ] **Step 2: 运行测试确认当前行为或发现缺口**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/utils/markdownImport.test.ts`
Expected: 新测试在 Task 1 代码尚不完整时 FAIL；完成后 PASS。

- [ ] **Step 3: 补齐坐标回归**

在 scanner 测试中断言 HTML 图片仍以整标签作为 `start/end`，Obsidian embed 仍以整 token 替换，普通 Markdown 图片仍只定位 URL。

- [ ] **Step 4: 运行两个测试文件并提交**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/utils/markdownMediaScanner.test.ts src/utils/markdownImport.test.ts`
Expected: all PASS。

```bash
git add src/utils/markdownMediaScanner.test.ts src/utils/markdownImport.test.ts
git commit -m "覆盖媒体导入的代码区域兼容性"
```

### Task 3: 结构化未上传图片诊断

**Files:**
- Modify: `src/utils/publish.ts`
- Modify: `src/utils/publish.test.ts`

- [ ] **Step 1: 写分类与位置失败测试**

导入 `findUnuploadedImages`，构造固定 fixture：两处行内图片示例、一张列表缩进微信图、一张固定行号本地图、一张外部图、data/blob/anchor/empty/unsupported 示例。断言返回 `{url,line,column,sourceType,syntax,reason}`，行列为 1-based；空地址显示逻辑所需的原始 URL 保持为空。

- [ ] **Step 2: 运行测试确认类型不匹配/行为失败**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/utils/publish.test.ts`
Expected: FAIL，当前返回 `string[]` 且遗漏部分来源。

- [ ] **Step 3: 实现诊断类型和行列计算**

导出：

```ts
export type UnuploadedImageReason = "local" | "external" | "temporary" | "unsupported";
export interface UnuploadedImage {
  url: string;
  line: number;
  column: number;
  sourceType: MediaSourceType;
  syntax: MediaSyntax;
  reason: UnuploadedImageReason;
}
```

新增通过 `ref.start` 计算 1-based 行列的纯函数；覆盖所有 `MediaSourceType` 映射并保留同 URL 不同位置的多条诊断。

- [ ] **Step 4: 严格微信 URL 校验并测试伪造地址**

删除 `includes` fallback；仅接受补全协议相对 URL后能被 `URL` 解析且 hostname 精确匹配白名单的地址。加入 malformed URL、`mmbiz.qpic.cn.evil.test`、协议相对合法 URL 测试。

- [ ] **Step 5: 补封面候选测试**

断言代码中的微信图不成为候选，正文真实微信图仍成为候选且 URL 正确。

- [ ] **Step 6: 运行测试并提交**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/utils/publish.test.ts`
Expected: all PASS。

```bash
git add src/utils/publish.ts src/utils/publish.test.ts
git commit -m "增加未上传图片的结构化诊断"
```

### Task 4: 构建可测试的警告视图

**Files:**
- Create: `src/components/Publish/UnuploadedImagesWarning.tsx`
- Create: `src/components/Publish/UnuploadedImagesWarning.test.tsx`

- [ ] **Step 1: 写组件失败测试**

用 React DOM `createRoot` 渲染组件，传入本地/外部/临时/不支持诊断；断言标题、风险说明、`第 N 行`、类型标签、空 URL 的 `（空地址）`、完整地址和两个按钮。

- [ ] **Step 2: 运行测试确认模块不存在**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/components/Publish/UnuploadedImagesWarning.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯展示组件**

Props 包括 `items`、`busy`、`onBack`、`onContinue`、`backButtonRef`。使用语义标题/说明关联容器；列表允许长 URL 换行；“仍然发布”使用危险视觉但复用现有 `Button`。

- [ ] **Step 4: 加入焦点和 Escape 测试/实现**

测试 mount 后 back button 可被父级聚焦；组件根处理 Escape 调用一次 `onBack` 而不调用 `onContinue`。不得注册未清理的全局 listener。

- [ ] **Step 5: 运行测试并提交**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/components/Publish/UnuploadedImagesWarning.test.tsx`
Expected: all PASS。

```bash
git add src/components/Publish/UnuploadedImagesWarning.tsx src/components/Publish/UnuploadedImagesWarning.test.tsx
git commit -m "新增未上传图片发布警告视图"
```

### Task 5: 集成一次性确认发布流程

**Files:**
- Modify: `src/components/Publish/PublishDialog.tsx`
- Create: `src/components/Publish/publishFlow.test.tsx`

- [ ] **Step 1: 写发布行为失败测试基架**

使用 JSDOM/React DOM 渲染 `PublishDialog`，设置 Zustand 内容并 mock Tauri commands、MathJax/计时器所需边界。测试无问题时一次点击调用 `add_draft` 一次；有问题时先进入警告且为 0 次。

- [ ] **Step 2: 运行确认失败**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/components/Publish/publishFlow.test.tsx`
Expected: FAIL，当前有问题只 Toast 并返回。

- [ ] **Step 3: 抽取实际发布函数并加入警告状态**

在 `PublishDialog` 中增加 `UnuploadedImage[] | null` 警告状态、内容快照和 `publishingRef`。`requestPublish()` 每次扫描当前 content；有诊断则切换同一 Dialog 的 title/body/footer；无诊断调用 `performPublish()`。`performPublish()` 保留现有标题/封面校验、settings、MathJax、HTML、busy/pubResult、成功延时和错误处理。

- [ ] **Step 4: 实现返回与继续**

“返回检查”清空警告并恢复发布按钮焦点；“仍然发布”先同步设置 `publishingRef.current = true`、清空一次性警告并执行一次 `performPublish()`；结束后释放守卫。正文快照变化时不得复用授权。

- [ ] **Step 5: 写重入和重扫测试**

断言双击“仍然发布”只调用一次 `add_draft`；返回后再次发布重新出现警告；修改 store 内容后重新扫描；关闭/重开不保留诊断或授权。

- [ ] **Step 6: 写焦点/Escape 测试**

断言警告打开后焦点在“返回检查”；Escape 仅退出警告、父 Dialog 仍在、发布 0 次且焦点回到发布按钮。

- [ ] **Step 7: 运行发布 UI 测试并提交**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/components/Publish/UnuploadedImagesWarning.test.tsx src/components/Publish/publishFlow.test.tsx`
Expected: all PASS，无 act 泄漏导致的不稳定失败。

```bash
git add src/components/Publish/PublishDialog.tsx src/components/Publish/publishFlow.test.tsx
git commit -m "允许确认风险后继续发布草稿"
```

### Task 6: 全量验证与文档核对

**Files:**
- Verify only unless a regression requires scoped fixes.

- [ ] **Step 1: 运行工具层相关测试**

Run: `node --import tsx --import ./src/test/setupDom.ts --test src/utils/markdownMediaScanner.test.ts src/utils/markdownImport.test.ts src/utils/publish.test.ts`
Expected: all PASS。

- [ ] **Step 2: 运行全量测试**

Run: `node --import tsx --import ./src/test/setupDom.ts --test "src/**/*.test.ts" "src/**/*.test.tsx"`
Expected: 0 failed。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`
Expected: TypeScript 和 Vite build 成功，exit code 0。

- [ ] **Step 4: 手工回归原始文章（不修改文件）**

打开 AppData 中原文章，确认两处反引号示例不再误报；临时加入一张本地图片确认详情行号；分别验证“返回检查”和“仍然发布”。真实创建微信草稿仅在凭证可用且用户允许时执行。

- [ ] **Step 5: 检查差异并提交必要修正**

Run: `git status --short && git diff --check`
Expected: 无意外文件、无空白错误。若验证产生修正，单独提交：

```bash
git add <scoped-files>
git commit -m "完善发布图片校验回归"
```

---

## 评审后规范性执行修订（优先于上文同名步骤）

### 严格 RED/GREEN 顺序

实施时每个行为必须遵循以下原子顺序，不得把测试和实现合并在同一步：

1. 写一个或一组同一原因失败的测试；
2. 运行精确测试文件/名称并确认因缺少目标行为而失败；
3. 写最小生产代码；
4. 重跑同一命令确认通过；
5. 再进入下一行为。

Task 1 开始生产代码前，先一次性加入并运行以下**消费者级失败测试**：`markdownImport.test.ts` 的导入计数/上传/替换、`publish.test.ts` 的代码内封面候选排除。它们必须先 RED，随后才实现 scanner。上文 Task 2 仅负责重跑及提交兼容回归，不再把“立即通过”视作 TDD 的 RED 阶段。

以下上文合并步骤拆开执行：

- HTML `code/pre`：先写测试 → 运行 FAIL → 实现 → 运行 PASS。
- 严格微信 hostname：先写 malformed/evil/protocol-relative 测试 → 运行 FAIL → 实现 → 运行 PASS。
- 封面候选：在 scanner 实现前写测试并确认 FAIL，实现后确认 PASS。
- Warning focus/Escape：先写测试并确认 FAIL，再实现 listener/focus 行为并确认 PASS。
- 发布返回/继续、快照、重开、双击：每一组都先写 UI 测试并确认 FAIL，再修改 `PublishDialog`，再确认 PASS。

### Scanner 必测语法矩阵

每种代码区域（行内、fence、HTML code/pre）至少覆盖四种会被现有扫描器识别的语法：

- Markdown image：`![alt](image.png)`；
- HTML image：`<img src="image.png">`；
- Obsidian embed：`![[image.png]]`；
- Markdown video link：`[video](clip.mp4)`。

行内代码另须逐项测试：多反引号 delimiter、转义反引号、跨行 code span、未匹配 backtick 后的真实图片。每项先 RED 后 GREEN。

### 围栏识别实现约束

不要实现“任意前缀剥离器”。先使用项目同版本 `markdown-it` 的 block token `map`（0-based 起止行）作为 fence/HTML block 的权威行范围，再由预先计算的行起始 offset 映射回原文绝对 `[start,end)`；行内 code span 使用独立源码状态扫描并用渲染/token 行为用例校准。该方案必须通过以下边界测试：

- 活跃容器内相对缩进最多三空格的 opener；
- 列表 marker 宽度与 continuation indentation；
- 重复 blockquote marker、嵌套 list/blockquote；
- backtick opener info string 含 backtick 时无效；
- closer 使用相同字符、长度足够、容器前缀/允许缩进且仅尾随空白；
- lazy/container continuation；
- 每个 token map 转换后的绝对 offset 精确覆盖源码且不吞掉围栏后的真实图片。

若 token map 对某类 HTML/容器范围不足，必须先以 `markdown-it` 实际 render 结果建立失败测试，再增加最小补充扫描，不能凭通用正则猜测语义。

### Fixture 渲染和草稿 HTML 验收

将固定 fixture 导出为测试常量（可置于 `publish.test.ts` 或新建专用 fixture 模块，避免复制漂移），并在生产改动前增加：

1. `src/markdown/parser.test.ts`：`render(fixture)` 后 code span 可见文本精确包含 `![imgDescription](imgUrl)` 和 `![imgDescription](imgUrl =缩放参数)`，不出现 `\\!`；
2. `src/markdown/converter.test.ts` 或发布 flow 测试：创建 `#article-box` 和 `STYLE_IDS` 所需 style 节点，把渲染 HTML 放入 article box，调用实际草稿 HTML 路径，断言 mock `add_draft` 的 `content` 保留两段可见示例文本。

### 确定性的 PublishDialog 测试夹具

`publishFlow.test.tsx` 必须提供统一 `setup/cleanup` helper：

- 保存并在每例后恢复 `useStore.getState()`；用 `useStore.setState(...)` 设置正文和文档路径；
- mock `window.__TAURI_INTERNALS__.invoke`：打开时处理 `list_image_materials`，返回至少一项素材；点击该素材建立真实 `thumbId`，发布时记录 `add_draft`；未知 command 直接抛错；
- 建立 `#article-box`、Markdown/theme/code style 节点和渲染后的 fixture HTML，满足 `solveDraftHtml()`；
- 安装并恢复 `matchMedia`、`requestAnimationFrame`、`cancelAnimationFrame`、`ResizeObserver`；
- 所有 render、点击、键盘、promise flush 均使用 React `act`；
- 对 900/2000ms timer 使用可控 fake timer 或替换/恢复 `setTimeout`，结束时清空 pending timer；
- 每例卸载 root、删除 portal/article/style DOM、恢复 Tauri internals/store/browser globals；
- 捕获并断言无 act warning、无 timer/portal/global 泄漏。

### 快照授权与同步防重入

警告状态保存 `{contentSnapshot, diagnostics}`。点击“仍然发布”时，必须读取 `useStore.getState().content`：

- 若与 snapshot 不同：不取得发布授权、不调用 `addDraft`，立即重新扫描并显示最新诊断；最新内容无问题时返回正常发布视图，要求用户重新点击发布；
- 若相同：进入统一发布入口。

统一发布入口在**任何 await 或 React state update 之前**同步检查并取得唯一 `publishingRef` 锁，无警告直发和确认发布共用该入口；只在 `finally` 释放。分别测试两条路径快速重复点击都只调用一次 `addDraft`。

确认发布 busy 期间，“返回检查”“仍然发布”和 Escape 均不可操作；Escape handler 首先检查 busy/lock。测试 busy 时按 Escape 不改变视图。父窗口关闭/重开、返回、成功和失败均清理诊断及一次性授权。

### package.json 全量测试覆盖

在最终验证前先写一个能证明 `.test.tsx` 会执行的脚本回归检查（或直接运行显式双 glob 命令），随后把 `package.json` 的 `test` 改为：

```json
"test": "node --import tsx --import ./src/test/setupDom.ts --test \"src/**/*.test.ts\" \"src/**/*.test.tsx\""
```

运行 `npm test`，预期 `.test.ts` 与 `.test.tsx` 全部执行且 0 failed；Task 6 的显式双 glob 命令作为交叉验证。
