# MD Render

[English](./README.en.md)

**一个本地优先的个人工作台：用「今日速记」随手记录、管理每天的工作，用文档写文章、剧本、笔记或任何长文，AI 助手随时帮你改。**

- **桌面版（macOS）**：[下载安装包](https://github.com/Canace22/md-render/releases/latest)，推荐长期使用。
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

润色、扩写、起标题、改写成不同平台的版本；输入 `/编辑部审稿` 让 9 个编辑角色一起审稿。AI 改正文前会先标出改了哪几行，你确认后才写进去。每个能力都是一个技能文件，可以自己加。

**发布：写完直接用**

一键排版复制到微信公众号（多种模板），也能导出 MD / HTML / PDF / DOCX。写公众号的话，还有选题看板、素材收件箱、发布排期和发布前检查清单。

## 开始使用

### 桌面版

1. 到 [Releases](https://github.com/Canace22/md-render/releases/latest) 下载 `.dmg` 安装，Intel 和 Apple 芯片都能用。
2. 第一次打开如果提示 **「应用程序已损坏，无法打开」**：这是因为安装包没有做苹果签名，文件本身没问题。到 **系统设置 → 隐私与安全性** 点「仍要打开」，或在终端执行：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/MD Render.app"
   ```

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
| 让 Claude Desktop / Cursor 等直接操作 app | 支持 | 不支持 |
| 其他功能 | 一样 | 一样 |

## 让 AI 助手用起来

AI 助手有两种接法，二选一：

**方式一：电脑上装了 Codex / Claude Code / Cursor（推荐，桌面版）**

什么都不用配。打开 AI 助手会自动检测并选中一个（优先 Codex），用的是你自己的登录、配置、skills 和 MCP，**不用填 API Key**。没装或没登录的话，设置页会告诉你怎么装，装好后点「重新检测」。

- agent 默认可以直接改当前项目里的文件、跑命令，每一步都会显示在面板里，点「停止」会连它启动的命令一起停掉。
- 想更稳妥，在 **AI 助手 → 设置 → 安全模式** 打开，就只允许改文件。

**方式二：没有本机 agent，接一个模型 API**

需要先跑一个小的中转服务（`server/ai-proxy`），API Key 填在这个服务里。内置支持 MiniMax、DeepSeek，其他 OpenAI 兼容接口在设置里选「自定义」。本机启动（需要 Node.js）：

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # 在 .env 里填上你的 Key
node server/ai-proxy/server.js                         # 默认监听 http://localhost:8788
```

桌面版默认连 `http://localhost:8788`，服务启动后直接能用。部署到别的机器见 [server/README.md](./server/README.md)，然后在 **AI 助手 → 设置 → AI 代理地址** 填上地址。

## 常用操作

### 复制到微信公众号

1. 在编辑器里写或粘贴 Markdown。
2. 在 **设置 → 排版风格** 里选一个模板。
3. 点预览区顶部的 **复制到微信公众号**。
4. 到公众号后台编辑器里直接粘贴。

### 打开自己的文件夹（桌面版）

在 **设置 → 本地项目目录** 选任意文件夹，里面的 `.md` 文件直接就是你的文档，新建的文档也存进去。在外面改过文件，点「从磁盘同步」就能拉回来。

app 不做多设备同步。历史版本可以按 `Cmd/Ctrl + K` →「查看文档版本历史」对比和恢复；更长期的版本管理，在这个文件夹里用 Git 即可。

### 让外部 AI 直接用你的内容（桌面版）

- **打开内容库**：用 Claude Code 等打开 `~/Documents/MdRender`，里面有 app 维护的 `AGENTS.md` 和技能，不开 app 也能用同一套技能。
- **MCP**：Claude Desktop、Cursor 等可以通过 MCP 操作开着的 app，改正文和删除需要你在 app 里确认。配置见 [server/mcp-bridge/README.md](./server/mcp-bridge/README.md)，也可以在 **设置 → 外部 agent 接入** 一键复制。

### 把数据都变成文件（桌面版）

**设置 → 数据存储** 可以把编辑部记忆、Daily、白板等迁成 `~/Documents/MdRender` 下的 Markdown / JSON Canvas 文件，Obsidian 能直接打开。迁移前会先预演并给你看报告，还会完整备份数据库，随时能切回去。

## 参与开发

```bash
pnpm install
pnpm dev            # 网页版，打开 http://localhost:3000
pnpm electron:dev   # 桌面版
```

项目从一个自己实现的 Markdown 解析器起步（`packages/markdown-core`），所以叫 MD Render。构建、测试、项目结构、发版和部署见 [开发指南](./docs/development.md)；版本变化见 [CHANGELOG](./CHANGELOG.md)，后续计划见 [路线图](./docs/content-creation-roadmap.md)。

## 许可证

[MIT](./LICENSE)
