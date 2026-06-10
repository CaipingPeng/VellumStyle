# 发布封面从文中选择 Implementation Plan

**Goal:** 发布到公众号草稿箱时，封面图支持从当前文章正文中已上传到微信的图片里选择，并最终得到草稿箱需要的 `thumb_media_id`。

**Architecture:** 前端从 `store.content` 扫描 mmbiz 图片生成候选；用户点击候选后调用 Tauri `upload_remote_thumb`；Rust 下载远程图片并复用封面上传链路返回 `media_id`；发布流程继续使用现有 `thumbId -> addDraft`。

**Tech Stack:** React 18 + Zustand / Tauri 2 + Rust reqwest / 微信 material 与 draft API。

参考 spec：`docs/superpowers/specs/2026-06-10-publish-cover-from-content-design.md`

---

## 文件结构

**修改：**

- `src-tauri/src/wechat.rs` — 抽取远程图片下载 helper，新增 `upload_remote_thumb`。
- `src-tauri/src/lib.rs` — 注册 `wechat::upload_remote_thumb`。
- `src/utils/publish.ts` — 新增正文封面候选生成和 `uploadRemoteThumb`。
- `src/components/Publish/PublishDialog.tsx` — 新增候选图 UI、文中封面选择流程、blob 预览释放修正。
- `docs/PROGRESS.md` — 完成后记录功能进度和验证结果。

**新增：**

- `docs/superpowers/specs/2026-06-10-publish-cover-from-content-design.md`
- `docs/superpowers/plans/2026-06-10-publish-cover-from-content.md`

---

## Task 1: 文档落地

**Files:**

- Create: `docs/superpowers/specs/2026-06-10-publish-cover-from-content-design.md`
- Create: `docs/superpowers/plans/2026-06-10-publish-cover-from-content.md`

- [x] 写清楚第一版范围：只支持正文中的 mmbiz 图片作为候选。
- [x] 写清楚数据流：`content -> scanMarkdownMedia -> upload_remote_thumb -> thumbId -> addDraft`。
- [x] 写清楚不做事项：本地路径、data/blob、裁剪、素材库、自动选图、缓存。

---

## Task 2: Rust 抽取远程图片下载 helper

**Files:**

- Modify: `src-tauri/src/wechat.rs`

- [ ] 新增内部结构：

```rust
struct DownloadedImage {
    bytes: Vec<u8>,
    filename: String,
    mime: String,
}
```

- [ ] 把 `upload_remote_image` 中的下载与校验逻辑抽成：

```rust
async fn download_remote_image(raw_url: &str) -> Result<DownloadedImage, String>
```

- [ ] helper 保持现有行为：
  - URL parse。
  - 只允许 `http/https`。
  - `ensure_public_remote_url`。
  - reqwest timeout 20s + redirect limited 5。
  - mmbiz host 加 Referer。
  - status、content-length、bytes size、MIME、magic bytes 校验。
  - `filename_from_remote_url`。

- [ ] `upload_remote_image` 改为：

```rust
let image = download_remote_image(&url).await?;
upload_image_bytes(app, image.bytes, image.filename, image.mime).await
```

---

## Task 3: Rust 新增 upload_remote_thumb

**Files:**

- Modify: `src-tauri/src/wechat.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] 新增 command：

```rust
#[tauri::command]
pub async fn upload_remote_thumb(app: AppHandle, url: String) -> Result<String, String>
```

- [ ] command 流程：
  - 读取微信配置。
  - 未配置返回 `NOT_CONFIGURED`。
  - 调 `download_remote_image(&url)`。
  - 获取 access token。
  - 调 `upload_thumb_inner(&token, bytes, &filename, &mime)`。
  - 遇到 `40001 / 42001 / 40014` 清 token 并重试一次。

- [ ] 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中注册：

```rust
wechat::upload_remote_thumb,
```

---

## Task 4: 前端发布工具扩展

**Files:**

- Modify: `src/utils/publish.ts`

- [ ] 增加 `CoverCandidate` 类型。
- [ ] 增加 mmbiz URL 判断和 normalize helper。
- [ ] `findUnuploadedImages` 复用同一个 mmbiz 判断。
- [ ] 新增 `getCoverCandidates(markdown)`：
  - 扫描 `scanMarkdownMedia(markdown)`。
  - 过滤 image + remote + mmbiz。
  - normalize `//...` 为 `https://...`。
  - 按 URL 去重。
- [ ] 新增：

```ts
export function uploadRemoteThumb(url: string): Promise<string> {
  return invoke<string>("upload_remote_thumb", {url});
}
```

---

## Task 5: 发布弹窗 UI 接入

**Files:**

- Modify: `src/components/Publish/PublishDialog.tsx`

- [ ] import `useMemo`、`getCoverCandidates`、`uploadRemoteThumb`。
- [ ] 增加 `coverCandidates = useMemo(...)`。
- [ ] 新增 `revokePreview(url)`，只释放 `blob:` URL。
- [ ] 替换现有直接 `URL.revokeObjectURL` 调用。
- [ ] 新增 `pickArticleThumb(url)`：
  - busy guard。
  - 调 `uploadRemoteThumb(url)`。
  - 成功设置 `thumbId` 和 `thumbPreview(url)`。
  - 处理 `NOT_CONFIGURED` 和普通失败 toast。
- [ ] 在封面上传区域下方增加候选网格：
  - 有候选时显示 3 列缩略图。
  - 点击候选图上传为封面。
  - 无候选时显示空状态。

---

## Task 6: 进度记录与验证

**Files:**

- Modify: `docs/PROGRESS.md`

- [ ] 记录本功能的完成范围、产出文件和验证状态。
- [ ] 运行前端类型检查或构建。
- [ ] 运行 Rust/Tauri 编译检查。
- [ ] 启动应用手动验证发布弹窗：
  - 本地封面上传入口仍在。
  - 正文 mmbiz 图片显示为候选。
  - 无候选时空状态清楚。
  - 未配置凭证路径可触发设置提示。
  - 如果可用凭证存在，验证候选图上传成封面并发布到草稿箱。
