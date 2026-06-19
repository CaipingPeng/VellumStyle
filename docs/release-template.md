# VellumStyle 发布模板

这次要发布新版本：`vX.X.X`

请按下面流程处理：

1. 先检查当前分支状态，确认有没有未提交改动。
2. 把所有版本号统一更新为 `X.X.X`，包括：
   - `package.json`
   - `package-lock.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
3. 同步更新 `release-notes.md`，写清楚本版本会展示给用户的更新说明：
   - 标题使用本次版本号，例如 `# VellumStyle vX.X.X`
   - 内容优先写用户能看懂的变化，例如新增、修复、优化
   - 不要保留 `X.X.X`、`TODO`、`待补充` 等占位内容
4. 运行本地验证：
   - `npm test`
   - `npm run build`
5. 如果当前不在 `main` 分支：
   - 先保留当前分支也同步到新版本
   - 再把改动合并/同步到 `main`
   - 最终以 `main` 分支作为发布构建来源
6. 提交所有相关改动，commit message 用中文，写清楚本次更新内容。
7. 创建版本 tag：
   - `vX.X.X`
8. 推送：
   - 推送 `main`
   - 推送当前开发分支（如果有）
   - 推送 `vX.X.X` tag
9. 推送 tag 后，检查 GitHub Actions 发布流程是否成功。
10. 如果 Actions 失败：
   - 读取失败日志
   - 定位原因
   - 修复后重新提交
   - 更新同一个 tag 到最新提交并重新推送触发发布
11. 发布成功后，确认 GitHub Release 里包含：
   - `release-notes.md` 中的更新说明
   - `latest.json`
   - Windows 安装包 `.exe`
   - `.exe.sig`
   - `.msi`
   - `.msi.sig`

注意：

- 正式发布由 GitHub Actions 构建，本地只需要跑测试和前端 build 验证。
- 应用内自动更新提示会读取 Release/updater JSON 中的更新说明，因此 `release-notes.md` 就是用户最终看到的内容来源。
