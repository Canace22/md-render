# MD Render

[English](./README.en.md)

**一个本地优先的个人工作台：用「今日速记」随手记录、管理每天的工作，用文档写文章、剧本、笔记或任何长文，AI 助手随时帮你改。**

- **桌面版（macOS / Windows）**：[下载安装包](https://github.com/Canace22/md-render/releases/latest)，推荐长期使用。桌面壳使用 Tauri 2 和系统 WebView，应用本身不要求安装 Node.js。
- **网页版**：[直接打开](https://canace22.github.io/md-render/)，不用安装，适合先试试。

内容存在你自己电脑上，可以直接存成普通的 `.md` 文件，换别的编辑器也能打开。

## 它能帮你做什么

**今日速记：每天的入口**

随手记下想法、待办和日程，按天归档；今天没做完的事自动带到第二天。适合当作每天打开的第一个页面，用来安排和回顾工作。

**文档：写什么都行**

文章、剧本、技术文档、读书笔记……都是 Markdown 文档，支持实时预览、代码高亮、Mermaid 图、表格、目录和深浅色主题。

- 开箱自带几个默认目录，也可以随时打开电脑上任意文件夹，直接编辑里面的 `.md` 文件。
- `[[文档名]]` 双向链接、反向链接、关系图谱和全文搜索，把零散的文档连成自己的知识库。
- 白板 / 灵感画布，适合理结构、排剧情、画思路。

**AI 助手：常驻右侧**

润色、扩写、起标题、改写成不同平台的版本；输入 `/编辑部审稿` 让 9 个编辑角色一起审稿。AI 改正文前会先标出改了哪几行，你确认后才写进去。内置能力用 skill 组织；首个 Tauri 正式版暂不能新建或编辑自定义 skill。

**发布：写完直接用**

一键排版复制到微信公众号（多种模板），也能导出 MD / HTML / DOCX。写公众号的话，还有选题看板、素材收件箱、发布排期和发布前检查清单。

## 开始使用

### 桌面版

1. 到 [Releases](https://github.com/Canace22/md-render/releases/latest) 下载对应安装包：macOS 选 `MD-Render-*-macOS-universal*.dmg`，Windows 选 `MD-Render-*-windows-x64*-setup.exe`。
2. macOS 包同时支持 Intel 和 Apple 芯片；Windows 安装程序默认装到 `Program Files`，安装时会请求系统管理员确认。
3. 文件名包含 `-unsigned` 的包没有受信任的开发者签名：macOS 可能需要在 **系统设置 → 隐私与安全性** 中确认打开，Windows 可能显示“未知发布者”或 SmartScreen 警告。请只从本仓库 Releases 下载，并用同页的 `SHA256SUMS` 校验文件。

**从旧 Electron 版升级时，需要手动交接一次数据：**

1. 完全退出旧版 MD Render。
2. 安装并打开新版。用过 Tauri 预览版的话，原 Tauri 数据会自动沿用，不需要导入。
3. 需要恢复 Electron 旧数据时，到 **设置 → Electron 数据交接** 选择旧版 `knowledge.db`。导入不是合并：它会先自动备份当前 Tauri 数据库，再用 Electron 数据替换；Electron 源库不会被修改或删除。
4. 如果两边都有新内容，先在 **设置 → 备份（JSON）** 导出 Tauri 内容并另存重要文稿，不要直接导入。
5. 原来的本地工作区需要重新选择授权，之后才能继续写入。

旧库通常在 macOS 的 `~/Library/Application Support/md-render/knowledge.db`，或 Windows 的 `%APPDATA%\md-render\knowledge.db`。如果找不到，再检查同级的 `@md-render/editor` 和 `MD Render` 目录。迁移确认完成前不要删除旧库。

导入前的 Tauri 库会备份到 macOS 的 `~/Library/Application Support/com.mdrender.app.tauri-preview/`，或 Windows 的 `%APPDATA%\com.mdrender.app.tauri-preview\`；完成提示会显示具体文件名。

旧 Electron 自动更新不能跨框架安装 Tauri 版；当前 Tauri 版也还没有内置自动更新，后续版本暂时都从 Releases 手动下载安装。

安装包会比 main 分支稍旧，个别新功能可能还没打进去，差别见 [CHANGELOG](./CHANGELOG.md) 的「未发布」部分。

### 网页版

打开 <https://canace22.github.io/md-render/> 就能用。

**注意：网页版的内容只存在当前浏览器里。** 清理浏览器数据或换电脑，内容就没了。长期写作请用桌面版；只用网页版的话，记得定期在 **设置 → 备份（JSON）** 导出一份。

### 桌面版和网页版的区别

| | 桌面版 | 网页版 |
|---|---|---|
| 内容存在哪 | 本机，可选存成本地 `.md` 文件 | 当前浏览器 |
| 全文搜索 | 搜正文 | 只做关键词匹配 |
| 文档历史版本 | 自动保留最近 7 天 | 不支持 |
| 打开本地工作区 | 支持；重启后需重新授权写入 | 不支持 |
| 本机 Agent / MCP | 首个 Tauri 正式版暂不支持 | 不支持 |
| PDF 导出 | 首个 Tauri 正式版暂不支持 | 以页面实际入口为准 |

## 让 AI 助手用起来

当前 Tauri 桌面版通过 `ai-proxy` 连接模型。应用本身没有 Node.js 运行时，也不依赖用户预装 Node；如果发布包已经配置公共 HTTPS 代理，直接在应用里选模型即可。

想自己托管代理，可以部署 `server/ai-proxy`，也可以在本机启动。只有“本机自己跑代理”这条路需要 Node.js：

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # 在 .env 里填上你的 Key
node server/ai-proxy/server.js                         # 默认监听 http://localhost:8788
```

服务启动后，在 AI 助手面板右上角的 **设置 → AI 代理地址** 填 `http://127.0.0.1:8788`。部署到别的机器时请使用 HTTPS，方法见 [server/README.md](./server/README.md)。本机 Codex / Claude Code Agent 和 MCP 尚未迁入首个 Tauri 正式版。

## 能做什么

- **今日速记**：一天一篇大纲（像幕布），任务、事件、笔记可嵌套、可贴图；没做完的任务自动带到第二天，内容能直接交给其他 AI。
- **写作**：Markdown 编辑与实时预览，代码高亮、Mermaid 图、表格、目录、浅色 / 深色主题。
- **AI 助手**：常驻右侧，可以改写、扩写、润色、起标题，生成公众号 / 小红书 / 知乎版本；输入 `/编辑部审稿` 会让 9 个编辑角色一起审你的稿子。AI 改正文时会先进收件箱标出改了哪几行，你确认后才会写进文档。内置能力由 skill 组织，自定义 skill 的新建和编辑尚未迁入 Tauri。
- **选题到发布**：选题看板、素材收件箱、灵感画布、发布排期和发布前检查清单。
- **知识库**：`[[文档名]]` 双向链接、反向链接、关系图谱、全文搜索。
- **发布**：一键复制成公众号排版（多种模板可选），也能导出 MD / HTML / DOCX。

产品主路径和边界见 [产品意图](./PRODUCT.md)。

## 常用操作

### 复制到微信公众号

1. 在编辑器里写或粘贴 Markdown。
2. 在 **设置 → 排版风格** 里选一个模板。
3. 点预览区顶部的 **复制到微信公众号**。
4. 到公众号后台编辑器里直接粘贴。

### 打开自己的文件夹（桌面版）

在 **设置 → 本地项目目录** 选任意文件夹，里面的 `.md` 文件直接就是你的文档，新建的文档也存进去。在外面改过文件，点「从磁盘同步」就能拉回来。

app 不做多设备同步。历史版本可以按 `Cmd/Ctrl + K` →「查看文档版本历史」对比和恢复；更长期的版本管理，在这个文件夹里用 Git 即可。

### 把内容交给外部 AI（桌面版）

当前 Tauri 正式版还不能让 Claude Desktop、Cursor 等通过 MCP 直接操作开着的 app，也还没有“数据文件化”入口。如果文档已经放在你选择的本地工作区，可以让 Codex、Claude Code 等直接打开那个目录；数据库内的其他内容请先保留在 app 中。

### 当前桌面版边界

首个 Tauri 正式版暂不提供 PDF 导出、本机 Agent、本机 MCP、数据文件化、自定义 skill 编辑和自动更新。旧 Electron 回退壳仍保留这些代码，但不属于正式 Release。

## 参与开发

```bash
pnpm install
pnpm dev            # 网页版，打开 http://localhost:3000
pnpm tauri:dev      # 正式桌面壳
pnpm electron:dev   # 旧 Electron 回退壳
```

项目从一个自己实现的 Markdown 解析器起步（`packages/markdown-core`），所以叫 MD Render。构建、测试、项目结构、发版和部署见 [开发指南](./docs/development.md)；版本变化见 [CHANGELOG](./CHANGELOG.md)，后续计划见 [路线图](./docs/content-creation-roadmap.md)。

## 许可证

[MIT](./LICENSE)
