# 发布封面从文中选择 设计

> 日期：2026-06-10
> 范围：发布到公众号草稿箱时，封面图除本地上传外，支持从当前文章正文图片中选择。

## 背景与动机

当前发布弹窗的封面只能从本地文件系统选择。公众号作者通常已经在正文中上传并插入了合适的头图或配图，再单独去本地文件系统找同一张图片会打断发布流程。

微信公众号草稿箱接口要求封面字段是 `thumb_media_id`，而正文图片通常是 Markdown/HTML 中的图片 URL。因此本功能的关键不是简单复用正文 URL，而是把用户选中的正文图片重新作为封面永久素材上传，拿到草稿箱需要的 `media_id`。

## 已敲定的决策

| 决策点 | 结论 |
|---|---|
| 候选图片来源 | 当前文章正文中已上传到微信图床的 mmbiz 图片 |
| 支持语法 | 复用 `scanMarkdownMedia`，覆盖 Markdown 图片、HTML `<img>`、Obsidian embed 等 |
| 封面提交字段 | 仍使用 `thumbId`，最终传给 `addDraft` 的 `thumb_media_id` |
| 远程图片上传封面 | 新增 Tauri command `upload_remote_thumb`，后端下载图片后调用微信永久素材接口并返回 `media_id` |
| 本地上传封面 | 保留现有隐藏 file input + `uploadThumb(file)` 流程 |
| 第一版不做 | 本地相对图片候选、data/blob、裁剪、永久素材库、自动选第一张图、media_id 缓存 |

## 用户体验

发布弹窗的「封面图」区域保持现有本地上传入口，并在下方增加「从文中选择」区域：

- 正文中存在 mmbiz 图片时，展示 3 列缩略图网格。
- 点击某张候选图后，立即上传为封面永久素材。
- 上传成功后更新封面预览，提示「已选择文中图片作为封面」。
- 正文中没有可选图片时，显示空状态：正文中未找到已上传到微信的图片，请先上传正文图片，或直接上传本地封面。
- 未配置微信凭证时，沿用现有 `NOT_CONFIGURED` 路径，引导用户打开设置。

## 数据流

```text
store.content
  -> scanMarkdownMedia(content)
  -> getCoverCandidates(content)
  -> 用户点击候选图片 URL
  -> uploadRemoteThumb(url)
  -> Tauri invoke("upload_remote_thumb", { url })
  -> Rust 下载远程图片 + 校验图片类型/大小/公网 URL
  -> upload_thumb_inner(access_token, bytes, filename, mime)
  -> 微信 material/add_material?type=image
  -> 返回 media_id
  -> PublishDialog.setThumbId(media_id)
  -> addDraft(title, html, thumbId)
```

## 候选图规则

候选生成复用 `src/utils/markdownMediaScanner.ts`：

- 只保留 `mediaType === "image"`。
- 只保留 `sourceType === "remote"`。
- 协议相对 URL `//...` 规范化为 `https://...`。
- 只保留 host 为 `mmbiz.qpic.cn` 或 `mmbiz.qlogo.cn` 的图片。
- 相同规范化 URL 只展示一次。

只展示 mmbiz 图片的原因：发布流程已经要求正文图片必须上传到微信素材库。第一版保持候选范围与发布校验一致，避免用户选择非微信远程图片作为封面后，正文发布又被外链图校验拦截造成困惑。

## 后端设计

`src-tauri/src/wechat.rs` 新增远程封面上传 command：

```rust
upload_remote_thumb(app, url) -> Result<String, String>
```

实现方式：

1. 抽取现有 `upload_remote_image` 中的远程图片下载和校验逻辑。
2. helper 保持现有安全约束：
   - 只允许 `http/https`。
   - 阻止 localhost 和内网 IP。
   - 20 秒超时，最多 5 次重定向。
   - mmbiz 图片下载带 `Referer: https://mp.weixin.qq.com`。
   - 校验 10MB 限制、MIME、magic bytes。
3. `upload_remote_image` 保持原行为，下载后调用 `upload_image_bytes` 返回正文图片 URL。
4. `upload_remote_thumb` 下载同一类图片后调用 `upload_thumb_inner`，返回 `media_id`。
5. token 失效错误码 `40001 / 42001 / 40014` 时，清 token 缓存并重试一次。

## 前端设计

`src/utils/publish.ts` 增加：

- `CoverCandidate`
- `getCoverCandidates(markdown)`
- `uploadRemoteThumb(url)`

`src/components/Publish/PublishDialog.tsx` 增加：

- `useMemo` 计算候选图。
- `pickArticleThumb(url)`，把文中图片上传成封面素材并设置 `thumbId`。
- 候选网格 UI。
- `revokePreview(url)`，只释放 `blob:` 预览 URL，避免远程 URL 被误当 object URL 释放。

发布按钮逻辑不变：只要 `thumbId` 存在，就能发布；正文外链图校验仍保留。

## 风险与约束

- 微信图片可能存在防盗链，后端下载需继续带 Referer。
- 远程图片超过 10MB 或不是 jpg/png/gif 时会失败。
- 第一版不解析本地相对路径，因此正文本地图片不会出现在候选列表。
- 真实发布依赖用户已配置公众号 AppID/AppSecret，本地无凭证时只能验证 UI、空状态和错误路径。

## 验收标准

- 本地上传封面原流程不回退。
- 正文有 mmbiz 图片时，发布弹窗能展示候选缩略图。
- 点击文中候选图后，能上传为封面素材并更新预览。
- 选择文中封面后，发布时不再提示「请选择封面图」。
- 正文无 mmbiz 图片时显示明确空状态。
- 未配置微信凭证时提示去设置。
- 正文仍有本地或非 mmbiz 图片时，发布仍被现有校验拦截。
