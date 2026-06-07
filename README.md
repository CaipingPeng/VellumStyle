# 微信公众号排版工具

> 一个本地优先的 Markdown → 微信公众号排版工具。基于 [mdnice](https://github.com/mdnice/markdown-nice) 的产品逻辑，用现代技术栈重写，并在两处做了核心增强：**微信官方图床**（上传即得永久 `mmbiz` 链接）和 **model 化主题系统 + 可视化样式面板**。

Markdown 写作 → 实时预览 → 一键复制为微信兼容富文本，粘贴进公众号编辑器即用。桌面端基于 Tauri v2，包体小、启动快、凭证与数据全在本地。

## 功能特性

- **实时预览 + 同步滚动**：左侧 CodeMirror 6 编辑器，右侧公众号样式预览。
- **一键复制微信兼容 HTML**：用 `juice` 把样式内联到元素 `style=""`，写入剪贴板富文本，公众号编辑器直接识别。
- **微信官方图床**：配置公众号 AppID/AppSecret 后，支持粘贴 / 拖拽 / 按钮上传，返回永久 `mmbiz.qpic.cn` 链接（凭证仅存本地，经 Rust 后端代理，不出本机）。
- **model 化主题系统**：主题是结构化的 `StyleModel`（非裸 CSS 字符串），编译期产出 CSS。
- **可视化样式面板**：点击预览中的元素 → 右侧面板直接调样式，所见即所得。
- **多套内置主题**，并支持导入 / 自建主题（写入用户数据目录的 `themes/`）。
- **语法工具栏**：标题 / 加粗 / 链接 / 代码块等常用语法一键插入。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 5 |
| 编辑器 | CodeMirror 6 |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS 3 |
| Markdown | markdown-it + 自定义插件链 |
| CSS 内联 | juice |
| 代码高亮 | highlight.js |
| 桌面 / 后端 | Tauri v2（Rust：图床代理 + 防盗链图片代理） |

## 本地开发

环境要求：Node.js 18+、Rust（仅桌面端构建需要，见 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)）。

```bash
# 安装依赖
npm install

# Web 模式开发（纯前端，图床等桌面能力不可用）
npm run dev

# 桌面模式开发（完整能力，含图床）
npm run tauri dev

# 类型检查 + 测试
npx tsc -b --noEmit
npm test
```

## 桌面端打包

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/`（Windows 下为 `.msi` 与 `.exe`/nsis 安装包）。

## 配置微信图床

图床走微信公众号官方 `add_material` 接口，需要**已认证的服务号** AppID/AppSecret，且公众号后台需配置**出口 IP 白名单**。

- 桌面端：打开应用 → 顶部「设置」→ 填入 AppID / AppSecret 即可。凭证写入应用数据目录的 `config.local.yaml`，**不会进入仓库**。
- 项目根的 `config.yaml` 仅为空白模板，`config.local.yaml` 已在 `.gitignore` 中。
- 未配置时上传会提示「尚未配置」，不影响排版与复制功能。

## License

[MIT](./LICENSE) © pengcaiping

## 致谢与免责声明

本项目的产品逻辑、渲染管线与排版思路，借鉴自 mdnice 的开源版本 [markdown-nice](https://github.com/mdnice/markdown-nice)（MIT License）。该部分为合规的学习与重写，特此致谢。

关于内置主题：`src/themes/presets/` 中的部分主题样式参考自 mdnice 在线服务（mdnice.com）的主题，**并非来自其开源仓库**，其授权范围可能不包含再分发。本项目保留这些主题仅出于学习与个人使用目的，不作任何商业用途。

若本仓库中任何内容（尤其是内置主题样式）涉嫌侵犯您的版权或其他合法权益，请通过 Issue 或邮件联系作者，我会**第一时间删除相关内容或删库处理**。
