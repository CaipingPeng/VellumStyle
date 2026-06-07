# 多文档管理 + 一键发布草稿箱 设计

> 日期：2026-06-08
> 范围：① 多文档管理（文件系统树）② 一键发布微信草稿箱 ③ 撤销/重做按钮 ④ 轻量 toast

## 背景与动机

当前工具是单文档：`store.content` 是唯一一份内容，persist 在 localStorage。公众号作者通常同时维护多篇文章，单文档强迫单线程工作。本设计加入文件系统映射的多文档管理（支持树状文件夹），并在已有的微信图床/token 基础设施上加「一键发布到公众号草稿箱」，把工具从「排版」延伸到「发布」。顺带补两个小项：撤销/重做可见按钮、轻量 toast 替换 `window.alert`。

## 已敲定的决策

| 决策点 | 结论 |
|---|---|
| 多文档存储 | 文件系统映射：`app_data_dir/documents/` 真实目录树，文件夹=树节点，`.md`=文档 |
| 命名/保存 | 文件名即标题；输入停顿 ~800ms debounce 自动写盘，无保存按钮 |
| 树操作 | 基础集：新建文档、新建文件夹、重命名、删除、点击切换。**无拖拽**（去系统文件管理器整理） |
| 删非空文件夹 | 禁止，提示「文件夹非空，请先清空」 |
| 内容真相源 | 文件系统是唯一真相源；store 只缓存当前一篇 content + 整棵树结构 |
| 树数据获取 | Rust 一次递归扫 `documents/` 返回嵌套树 JSON（个人文档量级小，无需懒加载） |
| 发布范围 | 仅草稿箱（`draft/add`），不群发；引导用户去公众号后台二次确认 |
| 发布字段 | 最小：标题 + 封面图（author/digest/content_source_url 暂留空） |
| 封面来源 | 发布弹窗选本地图上传，取 media_id；独立于正文图片上传路径 |
| localStorage 迁移 | 首次启用：若 documents/ 为空且 localStorage 有 content，存成 `documents/草稿.md` 并清旧 content |

## 一、整体架构与数据流

```
app_data_dir/
  config.local.yaml      (已有，微信凭证)
  themes/*.json          (已有，用户主题)
  documents/             (新增，文档树真相源)
    草稿.md
    工作/                ← 文件夹 = 树节点
      周报.md
```

- 文件系统是唯一真相源。store 只缓存**当前一篇**的 `content` + 整棵树结构 `tree`。
- `content` 不再 persist 到 localStorage；改 persist `currentDocPath`（记住上次打开哪篇）。
- 所有路径在 Rust 侧做**沙箱校验**（必须落在 `documents/` 内，防 `../` 逃逸），复用 themes.rs 的 sanitize 思路。
- CopyButton、发布按钮作用于 store.content，不改它们的取值来源——content 现在来自文件而已。

## 二、Rust 命令（`src-tauri/src/documents.rs` 新模块）

所有路径参数 = **相对 `documents/` 的相对路径**（如 `工作/周报.md`），Rust 内部 join 到 `documents/` 并校验不逃逸。

```rust
struct DocNode {
    name: String,       // 显示名 = 文件名（file 去 .md，dir 用目录名）
    path: String,       // 相对 documents/ 的路径
    is_dir: bool,
    children: Vec<DocNode>,  // 仅 dir 有
}

list_documents(app) -> Vec<DocNode>
//   递归扫 documents/，只认 .md 文件 + 目录，其余忽略。
//   目录不存在则自动建空目录，返回 []。
//   排序：同层内 文件夹在前、文档在后，各自按名称。

read_document(app, path) -> String
//   读一篇，沙箱校验。文件不存在 Err。

write_document(app, path, text) -> ()
//   写一篇，沙箱校验。

create_document(app, dir, name) -> String   // 返回新文档相对路径
//   dir 下建 name.md。重名 Err。

create_folder(app, dir, name) -> String     // 返回新文件夹相对路径
//   dir 下建 name/。重名 Err。

rename_entry(app, path, new_name) -> String  // 返回新路径
//   改名（文件保持 .md）。目标已存在 Err（不覆盖）。

delete_entry(app, path) -> ()
//   删文件直接删；删目录：非空 Err，空目录删除。
```

**沙箱校验（关键安全点）：**
```
resolve_in_documents(app, rel_path) -> Result<PathBuf>:
    base = canonicalize(app_data_dir/documents)
    full = canonicalize(base / rel_path)
    if !full.starts_with(base): Err("非法路径")   // 防 ../ 逃逸
```
名称禁止 `/ \ : * ? " < > |` 等 Windows 非法字符，过滤同 themes.rs `sanitize_id` 思路。
全部返回 `Result<_, String>`，前端用 toast 展示错误。

## 三、store 改造 + 自动保存/切换时序

### 新增状态
```ts
tree: DocNode[];                  // 运行期，不 persist
currentDocPath: string | null;   // persist
content: string;                 // 运行期缓存，不再 persist
loadTree(): Promise<void>;
openDocument(path): Promise<void>;
setContent(c): void;             // 触发 debounce flush
```
`partialize`：`{content, markdownThemeId}` → `{currentDocPath, markdownThemeId}`。

### 自动保存（debounce flush，模块级 helper，不进 React）
```
setContent(c): set({content:c}); scheduleFlush()
scheduleFlush(): clearTimeout(timer); timer=setTimeout(flush,800)
flush(): const {currentDocPath,content}=getState();
         if currentDocPath: await write_document(currentDocPath, content)
flushNow(): clearTimeout(timer); await flush()   // 切换/关窗前主动调
```

### 切换文档时序（防丢内容）
```
openDocument(newPath):
  await flushNow()                  // 先落盘当前篇（必须 await 完成）
  const text = await read_document(newPath)
  set({currentDocPath:newPath, content:text, selectedModelId:null})
```
flushNow 必须在 read 之前 await——否则旧文档未保存编辑会丢（同一份数据读写要对称，见 feedback-read-write-symmetry）。

### 窗口关闭兜底
Tauri `onCloseRequested`（或 beforeunload）→ `await flushNow()` 后放行，防关窗丢最后 800ms 编辑。

### 启动时序（App.tsx）
```
1. loadTree()
2. 迁移：documents/ 为空 且 localStorage 有旧 content
     → create_document("","草稿") + write 旧 content + 清 localStorage.content
3. 决定打开：persist 的 currentDocPath 仍存在 → 打开；否则打开树第一篇；树空 → 空状态
```

## 四、树 UI 组件 + 三栏布局

navbar 左侧加「文档」按钮，展开/收起左侧文档树侧栏（默认展开）。主体两栏→三栏：

```
[文档] | 语法工具栏          上传 导入 主题 设置 复制 [发布]
─────────┬───────────────┬─────────────────────
文档树    │  编辑器        │  预览 (+ StylePanel)
(~220px) │               │
+ 新建文档 │               │
+ 新建文件夹│               │
📁 工作   │               │
  📄 周报 │               │
📄 草稿←选│               │
```

### 组件（`src/components/DocTree/`）
- `DocTree.tsx`：侧栏容器，顶部操作条（+文档 / +文件夹）+ 树渲染。
- `TreeNode.tsx`：递归单节点。文件夹可展开/收起，文档可点击选中。hover 出「重命名 / 删除」小按钮（不做右键菜单）。
- `useDocActions.ts`：封装 create/rename/delete + 操作后 loadTree() 刷新。

### 交互
- 选中态：当前文档蓝底高亮（呼应 `#1e6bb8`）。
- 新建：在选中文件夹下（无选中则根）inline 输入名 → 回车 → 调命令 → loadTree() → 自动打开新文档。
- 重命名：hover 小按钮 → inline 输入框 → 回车确认。
- 删除：hover 小按钮 → `window.confirm` 二次确认 → 调命令 → loadTree()；若删的是当前文档，切到树第一篇。
- 文件夹展开态：组件本地 state（展开路径 set），不持久化。
- 空状态：树为空显示「点击上方 + 新建第一篇文档」。

## 五、一键发布草稿箱

### 微信 draft/add
```
POST /cgi-bin/draft/add?access_token=TOKEN
body: { "articles": [ {
  "title": 必填, "content": 必填(solveHtml 内联产物),
  "thumb_media_id": 必填(封面永久素材 media_id),
  "author":"", "digest":"", "content_source_url":""
} ] }
返回: { media_id, errcode, errmsg }
```

### Rust 命令（加到 wechat.rs）
```rust
upload_thumb(app, bytes, filename, mime) -> Result<String/*media_id*/, String>
//   走 add_material(type=image)，取 media_id（区别于现有只取 url）。
//   复用 get_access_token + token 失效重试。

add_draft(app, title, content, thumb_media_id) -> Result<String/*draft id*/, String>
//   author/digest/content_source_url 暂传空。
//   token 失效(40001/42001/40014)重试一次，沿用 upload_image_bytes 模式。
```

### 前端流程（PublishButton + PublishDialog）
```
点「发布」→ PublishDialog:
  1. 未配置凭证 → 提示去设置（复用 NOT_CONFIGURED 路径）
  2. 正文外链图校验：markdownMediaScanner 扫 content，
     仍有非 mmbiz 外链图 → 提示「正文有未上传的图片，请先上传」并中止
  3. 字段：标题(默认当前文档名，可改) + 封面(选本地图→upload_thumb→media_id，显缩略图)
  4. 「发布到草稿箱」：html=solveHtml(); await add_draft(title,html,thumbMediaId)
     成功 → toast「已发到公众号草稿箱，请在后台确认排版后发送」
     失败 → toast 显示微信 errmsg
```

**约束**：只进草稿箱不群发；正文图必须已是 mmbiz 链接（草稿箱拒外链图），故第 2 步校验必要；封面独立上传不碰正文图片路径。

## 六、撤销/重做 + 轻量 toast

### 撤销/重做
CodeMirror 6 `basicSetup` 默认含 history + `Ctrl+Z`/`Ctrl+Y`，键盘已可用，仅缺可见按钮。
- `MarkdownEditor` 暴露 `undo()`/`redo()`，内部调 `@codemirror/commands` 的 `undo(view)`/`redo(view)`。
- `SyntaxToolbar` 最左加两个按钮（lucide `Undo2`/`Redo2`）。
- 不做置灰状态（空 history 调用是 no-op，无害）。

### 轻量 toast（`src/components/Toast/`）
- `toast.ts`：模块级单例 `toast.show(message, type?:"info"|"error", duration=2500)`，订阅回调通知渲染。
- `Toaster.tsx`：固定右下角，堆叠显示，自动淡出。挂 App 根。
- 无依赖，纯 React + setTimeout（约 40 行）。深色半透明圆角条，error 左侧红竖条。
- 替换 `App.tsx` 两处 `window.alert`；发布/文档操作的成功/失败提示走 toast。
- 需用户决策的二次确认仍用 `window.confirm`（toast 是单向通知，不承担确认交互）。

## 测试策略

- **纯函数单测**（沿用项目 node:test 风格）：路径沙箱校验 `resolve_in_documents`（含 `../` 逃逸用例）、名称非法字符过滤、debounce flush 时序逻辑（可抽纯函数测计时决策）。
- **Rust 命令**：`cargo build` 通过；沙箱校验逻辑可加 Rust 单测（逃逸路径拒绝）。
- **运行时手验**：新建/重命名/删除文档与文件夹；切换文档不丢编辑（编辑 A→立即切 B→切回 A 内容在）；关窗后重开内容在；迁移（旧 localStorage content 变 草稿.md）；发布到草稿箱在公众号后台可见、封面正确、外链图校验拦截生效。
- `npx tsc -b --noEmit` 零错；`npm test` 全过；`npm run build` 通过。

## 不做（YAGNI）

- 导出 PNG/HTML/PDF（终点是公众号草稿箱，非图片社交/外站）。
- 暗色模式 + 抽 CSS 变量（预览必须白底模拟公众号，暗色割裂）。
- 树拖拽移动（去系统文件管理器整理）。
- StylePanel 空状态引导（面板本就点击元素才弹）。
- 预览手机宽度模拟（终端比例多变，不如不做）。
- 直接群发推送（安全边界：仅草稿箱）。
- 富元数据索引文件（文件系统即真相源，避免读写不对称）。
