# MD Render

[English](./README.en.md)

**一个本地优先的个人工作台：用「今日速记」随手记录、管理每天的工作，用文档写文章、大纲、剧本、笔记或任何长文，AI 助手随时帮你改。**

- **桌面版（macOS / Windows）**：[下载安装包](https://github.com/Canace22/md-render/releases/latest)，推荐长期使用。内容存在你自己电脑上，可以直接存成普通的 `.md` 文件，换别的编辑器也能打开。
- **网页版**：[直接打开](https://canace22.github.io/md-render/)，不用安装，适合先试试（数据仅保存在当前浏览器）。

## 它能帮你做什么

**今日速记：每天打开的第一个页面**

一天一篇幕布式大纲，随手记想法、待办和日程，支持无限缩进、贴图，还能一键切换成思维导图；今天没做完的事会自动带到第二天。

**文档：写什么都行**

文章、大纲、剧本、技术文档、读书笔记……都是标准的 Markdown 文档，支持实时预览、代码高亮、Mermaid 图、表格、目录和深浅色主题。

- **多种视图**：普通文档之外，可随时切换**大纲 / 思维导图**，或切到**中文剧本模式**（自动统计场次与角色、Tab 轮换台词、管理剧情节拍）。
- **直读本地文件**：开箱自带默认目录，也可以随时打开电脑上的任意文件夹，直接编辑里面的 `.md` 文件。
- **连成知识库**：输入 `@` 或 `[[文档名]]` 建立双向链接，配合反向链接、关系图谱、全文搜索和白板画布，把零散想法串成体系。

**AI 助手：常驻右侧**

润色、扩写、起标题、改写成公众号 / 小红书 / 知乎等不同平台版本；输入 `/编辑部审稿` 让 9 个编辑角色一起审稿。AI 改正文前会先标出改了哪几行，你确认后才写进文档。

**发布与导出：写完直接用**

一键排版复制到微信公众号（内置多套模板），也能导出 MD / HTML / DOCX。写公众号的话，还有选题看板、素材收件箱、发布排期和发布前检查清单。

## 开始使用

### 桌面版

1. 到 [Releases](https://github.com/Canace22/md-render/releases/latest) 下载对应安装包：
   - **macOS**：选 `MD-Render-*.dmg`（同时支持 Intel 和 Apple 芯片）
   - **Windows**：选 `MD-Render-Setup-*.exe`
2. **首次打开提示**：若当前安装包未附带开发者签名，macOS 请到 **系统设置 → 隐私与安全性** 点击「仍要打开」；Windows 若弹出 SmartScreen 提示，点「更多信息 → 仍要运行」（可用下载页同目录的 `SHA256SUMS` 校验文件完整性）。
3. **版本更新**：当前暂不支持应用内自动更新，后续新版本请从 Releases 下载安装。

<details>
<summary><b>从旧版（Electron）升级？点此查看数据迁移步骤</b></summary>

桌面版已从 Electron 切换到 Tauri 2，旧版用户升级时需要手动交接一次数据（已用过 Tauri 预览版的用户数据会自动沿用，无需操作）：

1. 完全退出旧版 MD Render，安装并打开新版。
2. 到 **设置 → Electron 数据交接** 选择旧版 `knowledge.db`：
   - macOS 通常在 `~/Library/Application Support/md-render/knowledge.db`
   - Windows 通常在 `%APPDATA%\md-render\knowledge.db`（若无，可查看同级的 `@md-render/editor` 或 `MD Render` 目录）
3. 导入会先自动备份当前数据库，再用旧版数据完整替换（不会修改或删除原 Electron 数据库）。如果两边都有新内容，请先在 **设置 → 备份（JSON）** 导出并另存重要文稿。
4. 原来的「本地项目目录」需要重新选择一次以恢复写入权限。确认迁移无误前请勿删除旧库。

</details>

### 网页版

打开 <https://canace22.github.io/md-render/> 就能用。

**注意：网页版的内容只存在当前浏览器里。** 清理浏览器数据或换电脑，内容就没了。长期写作请用桌面版；只用网页版的话，记得定期在 **设置 → 备份（JSON）** 导出一份。

### 桌面版与网页版对比

| | 桌面版 | 网页版 |
|---|---|---|
| 内容存在哪 | 本机，可直接读写本地 `.md` 文件夹 | 当前浏览器 |
| 全文搜索 | 搜标题和正文 | 仅关键词匹配 |
| 文档历史版本 | 自动保留最近 7 天 | 不支持 |

## 常用操作

### 复制到微信公众号

1. 在编辑器里写或粘贴 Markdown。
2. 在 **设置 → 排版风格** 里选一个模板。
3. 点预览区顶部的 **复制到微信公众号**。
4. 到公众号后台编辑器里直接粘贴。

### 打开电脑上的文件夹（桌面版）

在 **设置 → 本地项目目录** 选任意文件夹，里面的 `.md` 文件直接就是你的文档，新建的文档也存进去。在外部编辑器改过文件，点「从磁盘同步」就能拉回来（重启应用后需重新点一次目录授权写入）。

应用本身不做多设备同步。短期历史版本可按 `Cmd/Ctrl + K` →「查看文档版本历史」对比和恢复；长期版本管理和多设备同步，直接对这个文件夹用 Git 或网盘即可。

### 配置 AI 助手

如果安装包已内置默认服务，打开就能直接选模型使用。

想用自己的 API Key（支持 MiniMax、DeepSeek 或任意 OpenAI 兼容接口），可以在本机或服务器启动自带的转发服务（需要 Node.js）：

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # 在 .env 里填上你的 Key
node server/ai-proxy/server.js                         # 默认监听 http://localhost:8788
```

启动后，在 AI 助手面板右上角的 **设置 → AI 代理地址** 填 `http://127.0.0.1:8788`。部署到服务器时请使用 HTTPS，方法见 [server/README.md](./server/README.md)。

## 参与开发

```bash
pnpm install
pnpm dev            # 网页版（http://localhost:3000）
pnpm tauri:dev      # 桌面版（Tauri 2）
```

项目从一个自研的 Markdown 解析器起步（`packages/markdown-core`），所以叫 MD Render。桌面端刚完成向 Tauri 2 的切换，PDF 导出、本机 CLI Agent / MCP 和自定义技能编辑等功能正在迁移中。

- 产品定位与边界：[产品意图](./PRODUCT.md)
- 构建、测试、架构与发版：[开发指南](./docs/development.md)
- 版本变更与升级说明：[CHANGELOG](./CHANGELOG.md)
- 后续计划：[路线图](./docs/content-creation-roadmap.md)

## 许可证

[MIT](./LICENSE)
