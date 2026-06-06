# 实现进度

> 项目：微信公众号排版工具（基于 DESIGN.md，mdnice 重写）
> 本轮范围：**Phase 1 — 项目初始化 + 渲染管线 + 编辑器 + 实时预览 + 复制到微信**
> 开始：2026-05-29 ｜ 最后更新：2026-05-29

## 关键决策（已和用户确认）

- 本轮只做 Phase 1（核心地基）。Phase 2/3/4 后续再做。
- 微信图床凭证用 **YAML 配置文件** 读取（`config.yaml` / `config.local.yaml`，Phase 3 才用到，Phase 1 仅预留架构）。
- 任务进度持久化到当前目录（本文件）。

## Phase 1 任务清单（完整 todolist）

| # | 任务 | 状态 | 产出文件 |
|---|------|------|---------|
| 1 | 项目初始化 (Vite + React 18 + TS + Tailwind) | ✅ 完成 | `package.json` `vite.config.ts` `tsconfig.json` `tailwind.config.js` `postcss.config.js` `index.html` `.gitignore` `src/main.tsx` `src/styles/globals.css` |
| 1b | 后端骨架 + YAML 配置（图床预留） | ✅ 完成 | `server/index.ts` `server/wechat.ts` `server/config.ts` `config.yaml` |
| 2 | 迁移 markdown-it 自定义插件到 TS | ✅ 完成 | `src/markdown/plugins/{heading-span,list-item-wrap,table-container,multi-quote,image-flow,math,link-footnote,remove-pre,imsize}.ts`（9 个） |
| 3 | 配置 markdown-it 渲染管线 (12 插件链) | ✅ 完成 | `src/markdown/parser.ts`（highlight.js 11 新 API） |
| 3b | 主题资产迁移（basic + 1 markdown + 1 code） | ✅ 完成 | `src/themes/{basic,index}.ts` `src/themes/markdown/default.ts` `src/themes/code/atom-one-dark.ts` |
| 4 | CodeMirror 6 编辑器组件 | ✅ 完成 | `src/components/Editor/MarkdownEditor.tsx` |
| 5 | 实时预览 + 四层样式注入 | ✅ 完成 | `src/components/Preview/Preview.tsx` `src/utils/style.ts` |
| 6 | 复制到微信 (juice 内联 + Clipboard) | ✅ 完成 | `src/markdown/converter.ts` `src/utils/clipboard.ts` `src/components/Copy/CopyButton.tsx` |
| 7 | 主布局 + store + 默认内容 | ✅ 完成 | `src/App.tsx` `src/store/index.ts` `public/content.md` |
| 8 | 跑通验证 | ✅ 完成 | 见下方「验证状态」 |

状态图例：⬜ 未开始 / 🔄 进行中 / ✅ 完成

## 验证状态

- ✅ `npm install` 成功（368 包，markdown-it 14 / highlight.js 11 / vite 5）
- ✅ `npx tsc --noEmit` 通过（修复 1 处 `ignoreIllegals` 拼写后）
- ✅ `npm run dev:web` 启动，**页面正常渲染**（用户确认）
- ✅ **「复制到微信」+ juice 内联正常**（用户确认）—— juice 在浏览器端无需 polyfill

**Phase 1 全部完成并验证通过。**

## Phase 2a — 主题系统（切换 + 持久化）

> 范围：6 代码主题 + Mac 风格 + 多 markdown 主题 + 切换 UI + localStorage 持久化。
> 自定义 CSS 编辑器**不在本轮**，留待下一轮。
> spec: `docs/superpowers/specs/2026-05-29-phase2-theme-system-design.md`
> plan: `docs/superpowers/plans/2026-05-30-phase2-theme-system.md`

| # | 任务 | 状态 | 产出 |
|---|------|------|------|
| 1 | 迁移 5 个代码主题 | ✅ | `src/themes/code/{atom-one-light,github,monokai,vs2015,xcode}.ts` |
| 2 | Mac 风格装饰函数（纯 CSS 三色点） | ✅ | `src/themes/code/mac.ts` |
| 3 | 2 个新 markdown 主题 | ✅ | `src/themes/markdown/{elegant,tech}.ts` |
| 4 | 主题列表 + getMarkdownCss/getCodeCss + 容错 | ✅ | `src/themes/index.ts` |
| 5 | store 加 macStyle + zustand persist | ✅ | `src/store/index.ts` |
| 6 | Preview 用 getCodeCss(含 macStyle) | ✅ | `src/components/Preview/Preview.tsx` |
| 7 | ThemeMenu 下拉（主题/代码主题/Mac 勾选） | ✅ | `src/components/Theme/ThemeMenu.tsx` |
| 8 | App 接入 + footer 真实主题名 + 首屏不覆盖草稿 | ✅ | `src/App.tsx` |

### 验证状态

- ✅ `npx tsc --noEmit` 通过
- ✅ `npm run dev:web` 启动无报错（端口被占自动用 5174），页面返回 200、四层 style 注入点就位
- ⏳ **待人工浏览器手测**：切 markdown/code 主题、勾 Mac 三色点、刷新看持久化、复制到微信验证 `:before` 三点经 juice 内联仍在

### 设计决策

- **代码主题不独立切换**（用户要求精简）：代码块高亮绑定到整体 markdown 主题，每个主题在 `markdownThemes` 里带 `codeCss` 字段随主题一起切换。default/tech → atom-one-dark，elegant → github（浅色）。已删 store 的 `codeThemeId`/`macStyle`、ThemeMenu 的代码主题下拉，以及未用的 code 主题文件（仅留 atom-one-dark.ts + github.ts）。
- **预览区自适应占满**（用户要求）：去掉 375px 手机框 + 阴影 + 居中，改为占满宽度（`padding: 24px 32px`）。
- **Mac 三色点**（已随代码主题切换一并移除）：原方案是纯 CSS `radial-gradient` 替代 mdnice 远程 PNG，本轮精简后不再使用。

## Phase 1 本轮踩坑与修复

- **markdown-it-imsize 导致页面空白**：该 npm 包依赖 Node 的 `image-size`，浏览器端
  `require('./types/bmp')` 在 Vite 打包时崩溃（`Module not found in bundle: ./types/bmp`）。
  → **解法**：自实现纯 TS 插件 `src/markdown/plugins/imsize.ts`，只解析 `=WxH` 语法
  （`=100x200` / `=100x` / `=x200` / `=40%x`），去掉用不到的本地文件尺寸探测。
  已从 package.json 移除 `markdown-it-imsize` 依赖。
- highlight.js 11 API 变更：`highlight(code, {language, ignoreIllegals})`，非旧版 `highlight(lang, code, true)`。

## 从 mdnice 复用的资产

- 自定义插件：`markdown-nice-master/src/utils/markdown-it-*.js` → 改写为 TS（imsize 为自实现替代）
- 基础样式：`src/template/basic.js`（437 行 CSS）→ `src/themes/basic.ts`
- markdown 主题：`src/template/markdown/normal.js` → `src/themes/markdown/default.ts`（空模板，靠 basic 层）
- 代码主题：`src/template/code/atomOneDark.js` → `src/themes/code/atom-one-dark.ts`
- 复制逻辑：`src/utils/converter.js`（solveHtml + MathJax 后处理 + juice）→ `src/markdown/converter.ts`

## Phase 2b — 自定义 CSS 编辑器（❌ 已移除，2026-05-30）

> **状态**：功能已整体删除。原实现侧滑抽屉 + CodeMirror CSS 模式编辑器，删除原因为精简产品、目标用户直接切内置主题即可。
> 删除范围：`CssDrawer.tsx` / `CssEditor.tsx` 两组件文件；store 的 `customCss`/`useCustom`/`enterCustomFrom`；themes 的 `getEffectiveMarkdownCss`；ThemeMenu「自定义 CSS…」入口及退出确认逻辑；Preview/App 相关接线与 footer「自定义」显示。
> 旧 localStorage 里残留的 `customCss`/`useCustom` 由 zustand persist 自动忽略，不影响 content/主题。

## Phase 3 — 微信官方图床

> 范围：后端代理微信 uploadimg（token 缓存 + secret 不出后端）；前端「工具栏按钮选图」+「编辑器粘贴」两种触发，上传成功后光标处插入 `![](mmbiz链接)`；凭证未配置时前端弹提示。
> plan: `~/.claude/plans/ticklish-seeking-shell.md`

| # | 任务 | 状态 | 产出 |
|---|------|------|------|
| 1 | 后端 token 缓存 + uploadimg 代理 | ✅ | `server/wechat.ts` |
| 2 | 前端上传工具函数 | ✅ | `src/utils/upload.ts` |
| 3 | 编辑器支持光标插入 + 粘贴图片 | ✅ | `src/components/Editor/MarkdownEditor.tsx` |
| 4 | 上传按钮组件 | ✅ | `src/components/Upload/UploadButton.tsx` |
| 5 | App 接线 + config.yaml 注释更新 | ✅ | `src/App.tsx` `config.yaml` |
| 6 | mmbiz 防盗链：后端图片代理 + 预览改写 + 复制还原 | ✅ | `server/wechat.ts` `src/utils/imageProxy.ts` `src/components/Preview/Preview.tsx` `src/markdown/converter.ts` |

### 验证状态

- ✅ `npx tsc --noEmit` 通过（修复 1 处 `Buffer→Uint8Array` 的 BlobPart 类型）
- ✅ **运行时手测通过**（用户真实凭证 + `npm run dev`）：
  - 上传按钮选图 → 光标处插入 `![](http://mmbiz.qpic.cn/...)` → **预览正常显示**（经代理绕过防盗链）
  - 复制到微信 → 粘贴公众号编辑器正常显示（还原为 mmbiz 原链）
  - F12 Network 可见预览图走 `/api/wechat/img-proxy?url=...` 返回 200

### 设计决策

- **token 缓存提前 5min 过期**：避免边界上用到刚失效的 token；微信限频，必须复用 7200s 有效期。
- **token 失效自动重试一次**：uploadimg 返回 40001/42001/40014 时清缓存重取 token 重试，对调用方透明。
- **secret 不出后端**：前端只调 `/api/wechat/upload`，appId/secret 仅后端 config 读，符合 DESIGN 代理设计。
- **上传与粘贴共用一条路径**（`App.handleUploadFile`）：按钮和粘贴都走「上传→insertAtCursor→统一错误提示」，避免重复逻辑。
- **未配置用 NOT_CONFIGURED 错误码**：后端返回 `{error:"NOT_CONFIGURED"}`，前端据此弹引导提示而非通用失败。
- **错误提示先用 window.alert**（用户接受的精简方案）：toast 组件留待 Phase 4 美化。
- **不做拖拽 / 进度条 / 多图床**（用户明确精简）：核心卖点是微信官方图床单一来源。
- **校验双层**：前端 upload.ts 粗校验（jpg/png/gif + 10MB）给友好提示，后端硬校验兜底。

### 接口变更：uploadimg → add_material（10MB，2026-05-30）

**起因**：用户问「上传不能超过 1MB？公众号文章那些高清大图怎么进去的？」——
1MB 是 `media/uploadimg` 接口的硬限制，**不是公众号本身的限制**。

**两个接口的关键区别**：

| 接口 | 大小 | 格式 | 进素材库 | 用途 |
|---|---|---|---|---|
| `media/uploadimg`（旧） | 1MB | jpg/png | 否 | 图文正文内嵌图 |
| `material/add_material?type=image`（现用） | **10MB** | jpg/png/gif/bmp | **是** | 永久素材 |

**改动**：`server/wechat.ts:uploadToWechat` 换接口（URL 加 `&type=image`，表单字段仍是 `media`，返回仍取 `data.url`）；前后端 `MAX_SIZE` 1MB→10MB；`ALLOWED_TYPES` 加 `image/gif`；`UploadButton` 的 `accept` 加 gif；错误文案改 10MB。

**决策（用户确认）**：
- **接受素材库副作用**：add_material 上传的图会进公众号后台「素材管理」默认分组（uploadimg 不会）。图片素材额度 10 万张，基本用不完。
- **格式加 gif、不加 bmp**：公众号常用 gif 动图；bmp 体积大且罕用。
- **token 重试、img-proxy 防盗链代理、mmbiz 还原全部不变**：40001/42001/40014 是通用 token 错误码，两接口一致；返回仍是 mmbiz 链接，同样有 Referer 防盗链，现有代理方案继续适用。

### mmbiz 防盗链解决方案（方案 C：后端代理，已验证）

**问题**：微信 `mmbiz` 图按 Referer 防盗链，localhost 预览直接请求只拿到「未经允许不可引用」占位图。

**解法（三步，核心是「真链只存一份，代理只活在预览层」）**：

1. **后端图片代理** `GET /api/wechat/img-proxy?url=`（`server/wechat.ts`）：浏览器不能伪造 Referer，但后端可以。代理带 `Referer: https://mp.weixin.qq.com` 替前端拉图再透传。带域名白名单（`mmbiz.qpic.cn`/`qlogo.cn`）防 SSRF，缓存 1 天。
2. **预览渲染时改写 src**（`imageProxy.ts:toProxyHtml` + `Preview.tsx`）：把 `<img src="mmbiz链">` 改成 `src="/api/wechat/img-proxy?url=mmbiz链"`。**只改预览 state，不碰 Markdown 文本** —— Markdown 里始终是 mmbiz 原链（单一事实来源），无需映射表/持久化额外状态。
3. **复制时还原**（`imageProxy.ts:fromProxyHtml` + `converter.solveHtml`）：`solveHtml` 读 `box.innerHTML` 后立刻把代理 src 还原成 mmbiz 原链，**再** juice 内联。成品发在微信域名下原链正常，无需代理。

**踩坑（关键）**：微信 uploadimg 返回的是 **`http://`** 链接（非 https）。改写正则最初写死 `https:` 没匹配上 → 未改写的 http 图在 https 预览页被浏览器 **Mixed Content 策略静默拦截**（Network 里连请求都看不到，正是这条线索锁定了问题）。修复：正则放开成 `https?:`，后端代理放行 http 入参但拉图时统一升级 https。

**为何不用占位替换方案**：blob URL 刷新失效、base64 让 Markdown 源码变丑且需映射表，两头不讨好。代理方案不污染 Markdown 文本、刷新天然正常、复制零替换。

## Phase 4 — UI 完善（已收尾，按精简方案）

> DESIGN 第 4 节列了 5 项：工具栏格式按钮、状态栏、快捷键、右键菜单、全量持久化。
> 评估后与用户确认：**只保留已实现的两项，其余三项不做**。

| # | 子项 | 结论 | 现状 |
|---|------|------|------|
| 1 | 状态栏（行数/字数/主题） | ✅ 已完成 | `src/App.tsx:95-112` footer 显示行数、字数、主题名（自定义模式显「自定义」） |
| 2 | 全量持久化（localStorage） | ✅ 已完成 | `src/store/index.ts:33-38` zustand persist 持久化 content/markdownThemeId/customCss/useCustom |
| 3 | 工具栏格式按钮 | ⛔ 不做 | 见决策 |
| 4 | 快捷键系统 | ⛔ 不做 | 见决策 |
| 5 | 右键上下文菜单 | ⛔ 不做 | 见决策 |

### 设计决策

- **工具栏/快捷键/右键菜单本质同一类**（都是「快速插入 markdown 语法」），对会写 markdown 的目标用户价值低——直接敲 `**粗体**` 比点按钮快。符合用户「不过度工程化、精简」的偏好，故全部不做。
- **状态栏、全量持久化在 Phase 1~3 已顺带实现**，无需额外工作，Phase 4 不引入新代码。
- 若后续确有需要，Ctrl+B/Ctrl+I/Ctrl+U（选中包裹）成本最低，可作为优先补充项。

**Phase 4 收尾，未新增代码，无需验证。**

## 增补功能 — 同步滚动（按行锚点 + 双向，2026-05-30）

> 编辑器与预览左右分栏时，滚一边另一边按源码行号对齐跟随。
> spec: `docs/superpowers/specs/2026-05-30-sync-scroll-design.md`
> plan: `docs/superpowers/plans/2026-05-30-sync-scroll.md`

| # | 任务 | 状态 | 产出 |
|---|------|------|------|
| 1 | data-line markdown-it 插件 | ✅ | `src/markdown/data-line.ts`（core 规则给顶层 block 注入 `data-line=源码行`）+ `parser.ts` 挂载 |
| 2 | 复制时剥离 data-line | ✅ | `src/markdown/converter.ts`（solveHtml 内 `replace(/\s*data-line="\d+"/g,"")`） |
| 3 | 双向同步引擎 | ✅ | `src/utils/syncScroll.ts`（行号↔scrollTop 线性插值 + lockUntil 防振荡） |
| 4 | 编辑器暴露滚动接口 | ✅ | `src/components/Editor/MarkdownEditor.tsx`（handle 加 getScroller/getTopLine/scrollToLine） |
| 5 | Preview 暴露滚动容器 | ✅ | `src/components/Preview/Preview.tsx`（改 forwardRef，导出 PreviewHandle.getScroller） |
| 6 | App 接线 | ✅ | `src/App.tsx`（previewRef + useEffect 建 createScrollSync，rAF 重试等 .cm-scroller 挂载） |

### 验证状态

- ✅ `npx tsc --noEmit` 通过
- ✅ `npm run build` 成功（chunk 体积告警是既有 highlight.js/markdown 引起，与本次无关）
- ⏳ **待人工浏览器手测**（滚动是交互行为，无法自动验证）：滚编辑器看预览跟随 / 滚预览看编辑器跟随 / 快速来回滚无互推抖动 / 大代码块处不严重错位 / 复制到微信确认无 `data-line` 残留 / F12 看预览 `#nice` 顶层块带 data-line

### 设计决策

- **按行锚点而非按比例**：代码块在编辑器占几行、在预览渲染成一大块，按比例长文会明显错位；按 `data-line` 行号对齐才准。
- **双向 + lockUntil 防振荡**：程序触发的滚动会回弹 scroll 事件，用 80ms 时间戳锁住被动方，只有用户手动滚的一侧当主动方，避免互推。
- **行号统一 0-based**：data-line 用 `token.map[0]`（0-based）；CodeMirror doc.line 是 1-based，getTopLine/scrollToLine 内做 ±1 转换。
- **默认常开、无开关**（用户选择）：不引入 store 状态和 UI，符合精简偏好。
- **data-line 不污染微信成品**：仅存在于预览 DOM，复制时在 converter 剥离（与「还原代理图链」同一处理点）。

## 产品架构决策（2026-05-30 讨论确认）

### 部署形态

- **Tauri v2 桌面软件**（2026-05-30 最终确认）。
- ~~早期曾考虑 Web 部署~~，后改为桌面软件。
- 理由：
  - 单用户先行阶段，Web 部署需要用户自己搞服务器，门槛过高。
  - 桌面软件双击即用，凭证和数据全在本地，安全性更好。
  - Tauri 包体积约 5-10MB（对比 Electron 80MB+），启动快。
  - 前端 React 代码完全复用，后端用 Rust 重写为 Tauri Commands（逻辑简单，一次性工作）。
  - 公众号排版工具的目标用户会主动搜索此类工具，下载安装门槛可接受（Typora、Obsidian 同为桌面软件）。

### 多用户方案（暂缓，单用户先行）

> **2026-05-30 决策**：先不做多用户，专注把单用户版本打磨到可上线状态。多用户层作为后续增量接入，不影响核心渲染逻辑。

以下方案保留作为后续参考：

- **认证**：better-auth + 微信 OAuth
- **数据库**：PostgreSQL（自建）
- **微信凭证**：用户填自己的 AppID/AppSecret，AES 加密存服务器
- **图片/草稿**：全部走用户自己的公众号素材库
- **不做平台代理公众号**：素材库有上限，且涉及隐私
- **不做"纯排版模式"**：base64/blob URL 让 markdown 不可用
- **付费策略以后再定**
- **早期不做管理员端**：用户量小时直接操作数据库

### 开源计划

- 项目完成后开源，个人开发者可自行部署。
- 提供 Docker Compose 一键启动（PostgreSQL + Express + 前端）。
- 提供 `.env.example` 环境变量模板 + 微信开放平台申请指南。
- 开源版本复用同一套逻辑（部署者填自己的凭证）。

### 数据库表结构（初步）

```sql
-- better-auth 自动建表管理用户认证
-- 业务表：

CREATE TABLE user_wechat_accounts (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id),
  app_id       TEXT NOT NULL,           -- 明文，非敏感
  app_secret   TEXT NOT NULL,           -- AES 加密存储
  nickname     TEXT,                    -- 公众号名称
  is_default   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE drafts (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id),
  title        TEXT,
  markdown     TEXT,
  theme        TEXT DEFAULT 'default',
  custom_css   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_settings (
  user_id       TEXT PRIMARY KEY REFERENCES "user"(id),
  theme_id      TEXT DEFAULT 'default',
  use_custom    BOOLEAN DEFAULT false,
  theme_config  JSONB
);
```

## Phase 5 — Tauri v2 桌面化（✅ 完成并运行时验证通过）

> **目标**：将现有 Web 项目打包为 Tauri v2 桌面应用，用 Rust 重写 Express 后端为 Tauri Commands。
> **决策**：Rust 重写方案（非 Sidecar），理由见下方。
> **状态**：✅ 全部完成（2026-05-30）。桌面窗口运行 + 设置页填凭证→上传→wximg 预览全闭环手测通过；`tauri build` 出 `.msi` + `.exe`(nsis) 安装包。

### 实施进度（2026-05-30）

| # | 任务 | 状态 | 产出 |
|---|------|------|------|
| 1 | src-tauri 脚手架（手写，不依赖 cargo tauri init） | ✅ | `src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/default.json,.gitignore}` |
| 2 | config.rs：读 app_data_dir 下 config.local.yaml/config.yaml + get_config/save_config | ✅ | `src-tauri/src/config.rs` |
| 3 | wechat.rs：token 缓存（std Mutex）+ 重试 + upload_image command + 代理拉图 helper | ✅ | `src-tauri/src/wechat.rs` |
| 4 | lib.rs：wximg 自定义协议处理器 + 命令注册；main.rs 入口 | ✅ | `src-tauri/src/{lib.rs,main.rs}` |
| 5 | 前端迁移：upload.ts(fetch→invoke) / imageProxy.ts(前缀) / App.tsx(content.md→?raw) | ✅ | `src/utils/{upload,imageProxy}.ts` `src/App.tsx` `src/vite-env.d.ts` `src/content.md` |
| 6 | vite.config.ts(base:./ + 去 proxy) / package.json(@tauri-apps/api+cli, tauri script) | ✅ | `vite.config.ts` `package.json` |
| 7 | 前端验证 npm install + tsc --noEmit | ✅ | 通过 |
| 8 | cargo tauri dev 跑通（窗口 + 上传 + wximg 预览） | ✅ | 运行时手测通过 |
| 9 | GUI 设置页：填 AppID/AppSecret 存数据目录，免手动放文件 | ✅ | `src-tauri/src/config.rs`(get/save_config) `src/components/Settings/SettingsDialog.tsx` `src/App.tsx`(设置按钮) |
| 10 | tauri build 出正式安装包（.msi + .exe nsis） | ✅ | `src-tauri/target/release/bundle/{msi,nsis}/` |

> **build 踩坑**：WiX 的 `light.exe` 不接受中文 `productName`，msi 打包失败。修复 = `productName` 改 ASCII（`WeChat MD Editor`），窗口标题仍中文（`app.windows[].title`）。同时 `identifier` 去掉 `.app` 结尾改 `.desktop`（消 macOS 警告；注意这改了 app_data_dir 路径，旧凭证需在设置页重填一次）。

### 三处对原规划的修正（已与用户确认）

1. **图片代理用 Tauri 自定义协议**，非 Vec<u8>+Blob URL。延续已验证「方案 C」（真链只存一份、代理只活预览层），刷新天然正常，无 Blob 映射表。`imageProxy.ts` 仅换 `PROXY_PREFIX` 前缀，正则结构与复制还原零改动。
2. **上传统一传「字节+文件名+mime」**，非文件路径。`uploadImage(file)` 内 `arrayBuffer()→Array<u8>` 传 Rust，按钮与粘贴共用一条路径不变；`UploadButton` 保留隐藏 input，不引入 dialog。
3. **保留 `server/` 目录**作 Web 调试退路；`tsconfig.json` include 仍含 server。

### 凭证录入：GUI 设置页（替代手动放文件）

- 导航栏「设置」按钮 → `SettingsDialog` 填 AppID/AppSecret。
- `get_config` 回显当前凭证；`save_config` 写 `config.local.yaml` 到 `app_data_dir` 并 `clear_token_blocking()` 清缓存——**改完凭证无需重启，立即生效**。
- `NOT_CONFIGURED` 提示改为引导点「设置」并自动弹窗，不再让用户找 AppData 目录。

### 本轮踩坑与修复（运行时调试）

1. **wximg 协议在 Windows WebView2 报 `ERR_UNKNOWN_URL_SCHEME`**：
   - 根因：WebView2 不认 `wximg://localhost/` 形式，自定义协议实际访问形式是 **`http://<scheme>.localhost/`**（macOS WKWebView 才用 `wximg://`）。
   - 修复：`imageProxy.ts` 按平台探测前缀——Windows 用 `http://wximg.localhost/?url=`，其余用 `wximg://localhost/?url=`。`fromProxyHtml` 的还原正则改成完整 regex 转义（`http://wximg.localhost` 含 `.` 是元字符）。
   - CSP 同步放行 `img-src ... http://wximg.localhost https://wximg.localhost`（光放 `wximg:` 在 Windows 上匹配不上）。
2. **token 缓存从 `tokio::sync::Mutex` 改 `std::sync::Mutex`**：`save_config` 是同步 command，需同步清缓存（`clear_token_blocking`）；锁不跨 await 持有，std Mutex 即可，`const fn new` 可建静态。
3. **`?raw` import 路径**：Vite 不允许从 `public/` import 资源。默认内容复制到 `src/content.md`，`App.tsx` 改 `import ... from "./content.md?raw"`（public/content.md 保留给 web 模式）。
4. **失效示例图**：默认内容里 `https://my-wechat.mdnice.com/wechat.jpg` 已挂（`ERR_CONNECTION_CLOSED`），换成上传引导文字。

### 出正式安装包（✅ 已完成）

```bash
npx tauri build
```
产物已生成在 `src-tauri/target/release/bundle/`：
- `msi/WeChat MD Editor_0.1.0_x64_en-US.msi`
- `nsis/WeChat MD Editor_0.1.0_x64-setup.exe`

图标用占位蓝图生成（`gen-icon.cjs` + `npx tauri icon app-icon.png`），**后续可换成正式 logo 重跑 tauri icon**。

### ⚠️ 安全提示

`config.yaml`（项目根）当前含**真实 appSecret 明文**。建议把凭证移到 `config.local.yaml`（已 gitignore），`config.yaml` 脱敏当模板。**待用户处理。**

### 验证清单（运行时手测结果）

- [x] `npx tsc --noEmit` 通过（前端）
- [x] `npx tauri dev` 启动，窗口显示界面
- [x] 上传按钮选图 → 光标插入 `![](mmbiz链)` → 预览经 wximg 协议正常显示
- [x] GUI 设置页填 AppID/AppSecret 保存 → 上传立即生效（无需重启）
- [x] 粘贴剪贴板图（与上传共用一条路径，逻辑同，未单独手测）
- [x] 复制到微信 → 粘贴公众号编辑器图正常（fromProxyHtml 还原原链；clipboard.ts 已有 execCommand 回退应对 WebView text/html 限制）
- [x] `npx tauri build` 出 `.msi` + `.exe`(nsis)，产物在 `src-tauri/target/release/bundle/`

### 架构决策

**为什么选 Rust 重写而非 Sidecar 模式？**

| 方案 | 原理 | 优点 | 缺点 |
|---|---|---|---|
| Sidecar | Express 打包成独立二进制，Tauri 启动时作为子进程 | 改动最小，现有代码几乎不动 | 多一个 Node 进程，包体积+30MB，启动慢 |
| **Rust 重写（选定）** | 后端 2 个 API 用 Rust 重写为 `#[tauri::command]` | 单进程，体积小（5-10MB），启动快，无 Node 依赖 | 需要写 Rust（一次性工作，后端逻辑简单） |

**理由**：
- 后端逻辑极简（2 个 HTTP 代理接口，~150 行 TS），用 `reqwest` 几十行 Rust 就能写完
- 前后端职责完全分离（前端 TS、后端 Rust），不存在"同一逻辑两套语言"的维护负担
- Tauri 项目本身就是 Rust + TS 的标准组合，这是它的原生模式
- 微信 API 稳定，后续几乎不需要改动 Rust 代码

### 任务拆解（执行前规划草稿，已被上方「实施进度 / 踩坑与修复」取代）

> 下面的 Step 1~6 是动手前的初版规划，**部分细节与最终实现不符**（如 proxy_image 改成了 wximg 自定义协议而非 command、上传传字节而非文件路径、凭证录入做成了 GUI 设置页）。
> 实际实现、文件清单、踩坑修复以本章前面的「实施进度」「凭证录入」「本轮踩坑与修复」为准。此处仅留作历史参考，不再维护。

## 下一步

1. ~~**Phase 2b**：自定义 CSS 编辑器~~ — ❌ **已移除**（精简产品，详见 Phase 2b 章节）。
2. ~~Phase 3：微信官方图床~~ — ✅ **代码 + 运行时手测全部通过**（含 mmbiz 防盗链代理方案）。
3. ~~Phase 4：工具栏格式按钮、快捷键、状态栏完善、全量持久化~~ — ✅ **收尾**：状态栏 + 全量持久化已实现；工具栏/快捷键/右键菜单按精简方案不做。
4. 全部 Phase（1 / 2a / 2b / 3 / 4）已完成。
5. 同步滚动（增补）— ✅ 代码 + tsc + build 通过，**待人工手测**。
6. ~~**Phase 5：Tauri v2 桌面化**~~ — ✅ **全部完成**：桌面窗口运行 + GUI 设置页填凭证 + 上传 + wximg 预览全闭环手测通过；`tauri build` 出 `.msi` + `.exe`(nsis) 安装包。
7. ⏸️ **多用户系统**（暂缓）：先打磨单用户版本到可上线状态，多用户后续增量接入。

## 运行方式

### 桌面应用（Tauri，当前主形态）

```
npm install
npx tauri dev            # 启动桌面应用（自动跑 vite + 编译 Rust）
npx tauri build          # 出 .msi/.exe 安装包（src-tauri/target/release/bundle/）
```

首次使用点应用内「设置」填公众号 AppID/AppSecret（存到 app_data_dir 的 config.local.yaml）。

### Web 模式（仅调试用，保留 server/ 退路）

```
npm run dev:web          # 仅前端，http://localhost:5173（图片代理在纯 web 下不可用）
npm run dev              # 前端 + Express 后端
npx tsc --noEmit         # 类型检查
```

## 增补功能 — Markdown 导入图片归一化（✅ 代码完成，2026-06-06）

> 目标：导入 Markdown 时识别标准 Markdown、HTML、image-flow、Obsidian embed 中的图片引用，将本地图片和在线图片统一上传到公众号永久素材库，再把原引用替换为 `mmbiz.qpic.cn` 链接。

### 本轮讨论结论

- 难点不是上传，而是**图片来源归一化**：
  - 本地图片：先根据 Markdown 文件所在目录、可选资源根目录和平台语法完成寻址，再上传。
  - 在线图片：先由后端下载真实图片 bytes，再上传到公众号永久素材库。
  - Obsidian 图片：第一版支持 `![[image.png]]`、`![[dir/image.png|300]]`、`![[image.png|alt]]`，成功后转换成当前渲染器支持的标准 Markdown 图片语法。
- 导入处理必须发生在 `setContent` 之前，不能放在 parser/preview/copy 阶段，避免异步上传造成重复副作用。
- 视频第一版只识别和报告暂不支持，不上传、不替换。
- 普通浏览器文件 input 拿不到可靠的 Markdown 文件目录，因此导入需要 Tauri dialog + path-based 读取。

### 执行计划

| # | 任务 | 状态 | 产出 |
|---|------|------|------|
| 1 | 实现前写入进度文档 | ✅ | `docs/PROGRESS.md` |
| 2 | Tauri 导入/解析/上传命令 | ✅ | `src-tauri/src/import.rs` `src-tauri/src/wechat.rs` `src-tauri/src/lib.rs` |
| 3 | 前端媒体扫描与导入 pipeline | ✅ | `src/utils/markdownMediaScanner.ts` `src/utils/markdownImport.ts` |
| 4 | 导入按钮和弹窗 UI | ✅ | `src/components/Import/*` `src/App.tsx` |
| 5 | 构建验证 | ✅ | `npm run build` / `npx tauri build` |
| 6 | 完成后回写进度 | ✅ | `docs/PROGRESS.md` |

### 关键设计

- 本地相对路径默认相对导入 Markdown 的 `base_dir` 解析，支持 `./`、`../`、无前缀相对路径、Windows/Unix 绝对路径和 `file://`。
- Obsidian 裸文件名先查 `base_dir` 及常见附件目录；用户可选择资源根目录，在该目录内递归查找唯一同名图片。多候选时不自动替换，避免误选。
- 在线图片通过后端下载并校验：仅 `http/https`、仅 jpg/png/gif、最大 10MB、拒绝 localhost/内网地址。微信 `mmbiz` 图片下载时带 Referer，再重新上传到当前公众号素材库。
- 同一篇文章内相同本地 resolved path 或相同在线 URL 只上传一次。
- 成功上传才替换；未找到、歧义、下载失败、上传失败均保留原引用并在弹窗报告。

### 实现结果

- 新增 Tauri dialog 后端入口：`pick_markdown_file` / `pick_resource_dir`，前端无需新增 npm dialog 插件依赖。
- 新增 `read_markdown_file`：读取 `.md` / `.markdown`，返回 `path`、`base_dir`、`content`。
- 新增 `resolve_import_media`：处理本地路径 decode、`file://`、相对路径、常见附件目录、可选资源根目录递归查找、同名歧义。
- 新增 `upload_local_image` / `upload_remote_image`：本地读取或远程下载图片 bytes 后复用微信永久素材上传逻辑。
- 重构 `wechat.rs`，抽出 `upload_image_bytes`，让原上传按钮、导入本地图片、导入在线图片共用配置读取、token 缓存、token 失效重试和 add_material 上传。
- 新增 `markdownMediaScanner.ts`：支持标准 Markdown 图片、尺寸语法、HTML `img/src`、image-flow、Obsidian embed、视频识别。
- 新增 `markdownImport.ts`：完成扫描、分类、寻址、上传、去重、offset 反向替换和结果汇总。
- 新增 `ImportButton` / `ImportMarkdownDialog`，工具栏出现“导入”按钮，弹窗支持选择 Markdown、选择资源根目录、显示进度和失败/未处理明细。

### 验证状态

- ✅ `npm run build` 通过。
- ✅ `npx tauri build` 通过，并重新产出：
  - `src-tauri/target/release/bundle/msi/WeChat MD Editor_0.1.0_x64_en-US.msi`
  - `src-tauri/target/release/bundle/nsis/WeChat MD Editor_0.1.0_x64-setup.exe`
- ⏳ 待人工运行时手测：选择 Markdown 文件、选择 Obsidian 资源目录、本地图片替换、在线图片替换、失败项报告、导入后复制到微信。

