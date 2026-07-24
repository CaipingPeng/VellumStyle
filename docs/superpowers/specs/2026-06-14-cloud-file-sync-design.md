# 文件自同步系统设计

> 日期：2026-06-14
> 范围：文档文件自同步、坚果云 WebDAV 配置、状态栏同步状态

## 背景

文澜排版当前以 `app_data_dir/documents/` 作为文档真相源，store 只缓存当前编辑文档和文档树。同步系统应保持这个本地优先模型：本地保存不依赖网络，云端只作为后台镜像和多设备同步层。

## 已确认决策

| 决策点 | 结论 |
|---|---|
| 同步模式 | 启动时拉取云端更新，保存和文档树变更后后台推送 |
| 冲突策略 | 双端都变更时保留本地文件，并把云端版本落成冲突副本 |
| 首个 provider | 坚果云 WebDAV |
| 可扩展性 | Rust 同步模块按 provider 配置分层，后续可加入其他接口 |
| 配置位置 | 复用「设置」对话框，新增同步分区 |
| 状态展示 | 底部状态栏在「已保存」旁边显示同步状态 |

## 存储与配置

`config.local.yaml` 新增 `sync`：

```yaml
sync:
  enabled: true
  provider: nutstore
  username: user@example.com
  password: app-password
  remote_dir: VellumStyle
```

坚果云的 WebDAV 根地址固定为 `https://dav.jianguoyun.com/dav/`。`remote_dir` 默认 `VellumStyle`，用户可改，避免把全部账号根目录作为应用同步空间。

本机额外维护 `sync-state.json`，记录最近一次同步成功后的文件 hash 和 provider scope。云端维护 `.vellumstyle-sync.json` manifest。manifest 是同步协议的索引文件，不展示在文档树里。

## 同步算法

每次同步扫描本地 `documents/` 下的 `.md` 文件，以及隐藏的文章主题映射文件
`.vellumstyle-theme-map.json`（及其冲突副本），读取远端 manifest，并与本机
`sync-state.json` 做三方比较。主题映射与文章文件使用同一套冲突/删除策略，
因此文章切换时的排版主题可以随云端文档一起恢复。
若本机没有映射引用的自定义主题，界面只临时回退为默认主题，映射中的原始
主题 ID 保持不变，避免同步时把另一台设备的选择覆盖掉。

- 本地变更、远端未变：上传本地文件并更新远端 manifest。
- 远端变更、本地未变：下载远端文件覆盖本地文件。
- 双端新增同一路径但内容不同，或双端都基于上次状态改动：保留本地文件，下载远端为 `标题 (坚果云冲突 YYYYMMDD-HHMMSS).md`。
- 本地删除、远端未变：删除远端文件。
- 远端删除、本地未变：删除本地文件。
- 无状态的首次同步：本地独有上传，远端独有下载；同一路径内容不同则生成冲突副本。

同步失败不影响本地保存。失败会记录错误消息并在状态栏显示「同步失败」。

## 前端集成

- `SettingsDialog` 增加「文件同步」分区：开关、坚果云账号、应用密码、同步目录。
- 保存设置时同时写入微信凭证和同步配置。
- store 增加 `syncStatus`、`lastSyncedAt`、`syncMessage`，并提供 `runSyncNow()`。
- 启动完成后自动同步一次。
- 自动保存成功、创建、重命名、移动、删除文档后排队同步。
- 状态栏在保存状态旁显示：`同步关闭`、`同步中`、`已同步 HH:mm`、`同步冲突`、`同步失败`。

## 测试策略

- 前端纯函数测试同步状态文案，避免 UI 直接散落状态逻辑。
- Rust 单测覆盖 provider 配置是否完整、远端目录规范化、hash 稳定性、冲突文件名生成。
- 集成验证跑 `npm test`、`npm run build`、`cargo test`、`cargo build`。

## 不做

- 不同步用户主题文件、发布凭证、微信素材缓存；文章所选主题映射随文档同步。
- 不做云端文件浏览器。
- 不在本地保存时等待网络成功。
- 不支持多 provider UI，首版只给坚果云入口，但保留 provider 字段。
