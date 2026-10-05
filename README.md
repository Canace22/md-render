# MD Render

[English](./README.en.md)

**一个本地优先的中文写作工作台：在一个 app 里安排今天要写什么、写长文、让 AI 帮你改稿，最后一键排版复制到微信公众号。**

适合公众号 / 博客作者和独立内容创作者。macOS 用户可以直接[下载桌面版](https://github.com/Canace22/md-render/releases/latest)，其他平台可以先试[网页版](https://canace22.github.io/md-render/)。

## 开始使用

### 桌面版（推荐）

1. 到 [Releases](https://github.com/Canace22/md-render/releases/latest) 下载 `.dmg` 安装，Intel 和 Apple 芯片都能用。
2. 第一次打开如果提示 **「应用程序已损坏，无法打开」**，这是因为安装包没有做苹果签名，文件本身没有问题。到 **系统设置 → 隐私与安全性** 点「仍要打开」；或者在终端执行：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/MD Render.app"
   ```

安装包会比 main 分支稍旧，本页提到的个别功能可能还没打进去，差别见 [CHANGELOG](./CHANGELOG.md) 的「未发布」部分。

### 网页版

打开 <https://canace22.github.io/md-render/> 就能用，不用安装。

**注意：网页版的内容只存在当前浏览器里。** 清理浏览器数据或换一台电脑，内容就没了。要长期写作请用桌面版；只用网页版的话，记得定期在 **设置 → 备份（JSON）** 里导出一份。

### AI 助手：装了 Codex / Claude Code / Cursor 就能直接用

桌面版打开 AI 助手时会自动检测你电脑上装的 agent（优先 Codex，其次 Claude Code、Cursor），默认选中一个，**不用填 API Key**。用的是你自己的登录、`AGENTS.md` / `CLAUDE.md`、skills 和 MCP，md-render 的工具也会借给它用。输入框旁边能切换 agent 和模型，「跟随默认」就是用你本机 agent 自己的配置。

- 默认不逐条确认：agent 可以直接改工作目录（打开的本地项目，没有就是内容库）里的文件、跑命令，每一步都会出现在面板和「活动」记录里，点停止会连它拉起的命令一起停掉。
- 想稳一点就在 **AI 助手 → 设置 → 安全模式** 打开：只允许改文件，跑命令等操作会被拒绝。
- 没装或没登录：设置页会给出安装命令和登录方法，装好后点「重新检测」。app 不会替你安装或登录，也不读取任何 agent 的凭证。

### 没有本机 agent？接一个模型 API

没检测到本机 agent 时，AI 助手会用 API 服务商。它需要先连上一个小的中转服务（`server/ai-proxy`），你的模型 API Key 就填在这个服务里。内置支持 MiniMax、DeepSeek，其他 OpenAI 兼容接口可以在 AI 助手设置里选「自定义」。

在本机跑起来只要三步（需要 Node.js）：

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # 然后在 .env 里填上你的 Key
node server/ai-proxy/server.js                         # 默认监听 http://localhost:8788
```

桌面版默认就连 `http://localhost:8788`，服务启动后直接能用。如果你把服务部署在别的机器上（部署方法见 [server/README.md](./server/README.md)），在 AI 助手面板右上角的 **设置 → AI 代理地址** 里填上地址。

## 能做什么

- **今日速记**：按天记任务、笔记、日程；没做完的事自动带到第二天。
- **写作**：Markdown 编辑与实时预览，代码高亮、Mermaid 图、表格、目录、浅色 / 深色主题。
- **AI 助手**：常驻右侧，可以改写、扩写、润色、起标题，生成公众号 / 小红书 / 知乎版本；输入 `/编辑部审稿` 会让 9 个编辑角色一起审你的稿子。AI 改正文时会先进收件箱标出改了哪几行，你确认后才会写进文档。每个功能都是一个技能文件，自己加一个不用改代码（见 [产品功能说明](./docs/产品功能说明.md)）。
- **选题到发布**：选题看板、素材收件箱、灵感画布、发布排期和发布前检查清单。
- **知识库**：`[[文档名]]` 双向链接、反向链接、关系图谱、全文搜索。
- **发布**：一键复制成公众号排版（多种模板可选），也能导出 MD / HTML / PDF / DOCX。

每个界面的详细说明见 [产品功能说明](./docs/产品功能说明.md)。

## 常用操作

### 复制到微信公众号

1. 在编辑器里写或粘贴 Markdown。
2. 在 **设置 → 排版风格** 里选一个模板。
3. 点预览区顶部的 **复制到微信公众号**。
4. 到公众号后台编辑器里直接粘贴。

### 把稿子存在自己的文件夹里（桌面版）

在 **设置 → 本地项目目录** 选一个文件夹，之后每篇稿子都直接存成那个文件夹里的 `.md` 文件，用别的编辑器打开也没问题。在外面改过的文件，点「从磁盘同步」就能拉回来。

app 本身不做多设备同步，也不保留历史版本。需要的话，在这个文件夹里用 Git 管理即可。

### 用自己的 AI（Claude Code、Claude Desktop 等）

- **直接打开内容库**：用 Claude Code 等打开 `~/Documents/MdRender`。app 会在这里维护 `AGENTS.md` 和技能目录，你的 agent 能用和 app 里一样的技能，app 不开也行。
- **MCP**：Claude Desktop、Cursor 等可以通过 MCP 直接操作开着的 app，改正文和删除要你在 app 里确认。配置见 [server/mcp-bridge/README.md](./server/mcp-bridge/README.md)，设置 → 外部 agent 接入 里能一键复制配置。

### 把数据都变成文件（桌面版）

在 **设置 → 数据存储** 里可以把编辑部记忆、Daily、白板和旧的内置文档迁到 `~/Documents/MdRender` 下的 Markdown / JSON Canvas 文件，Obsidian 能直接打开。会先只读预演、给你看报告，确认后才迁移；迁移前完整备份数据库，随时能切回旧存储。

### 桌面版和网页版的区别

| | 桌面版 | 网页版 |
|---|---|---|
| 内容存在哪 | 本机数据库，可选存成本地 `.md` 文件 | 当前浏览器 |
| 全文搜索 | 搜正文 | 只做关键词匹配 |
| 让 Claude Desktop / Cursor 等直接操作 app（[MCP](./server/mcp-bridge/README.md)） | 支持 | 不支持 |
| 其他功能 | 一样 | 一样 |

## 参与开发

```bash
pnpm install
pnpm dev            # 网页版，打开 http://localhost:3000
pnpm electron:dev   # 桌面版
```

构建、测试、项目结构、发版和部署见 [开发指南](./docs/development.md)。版本变化见 [CHANGELOG](./CHANGELOG.md)，后续计划见 [路线图](./docs/content-creation-roadmap.md)。

## 许可证

[MIT](./LICENSE)
