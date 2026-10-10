# MD Render

[中文](./README.md)

**A local-first personal workbench: use Daily notes to capture ideas and manage each day's work, write articles, scripts, notes or any long-form text as documents, with an AI assistant always at hand.**

- **Desktop (macOS)**: [download the installer](https://github.com/Canace22/md-render/releases/latest) — recommended for everyday use.
- **Web**: [open it in your browser](https://canace22.github.io/md-render/) — nothing to install, good for a quick try.

Your content lives on your own computer and can be saved as plain `.md` files any editor can open. The UI is in Chinese.

## What it helps you do

**Daily notes: your starting point each day**

Jot down ideas, to-dos, and events, filed by day; anything unfinished carries over to tomorrow. Meant to be the first page you open each day to plan and review your work.

**Documents: write anything**

Articles, scripts, technical docs, reading notes — all Markdown, with live preview, code highlighting, Mermaid diagrams, tables, table of contents, and light / dark themes.

- Comes with a few default folders, and you can open any folder on your computer to edit the `.md` files in it directly.
- `[[Document Name]]` wikilinks, backlinks, graph view, and full-text search turn scattered documents into your own knowledge base.
- A whiteboard / idea canvas for outlining structure, plotting stories, or sketching ideas.

**AI assistant: docked on the right**

Polishes, expands, suggests titles, and rewrites for different platforms; type `/编辑部审稿` to have nine editor personas review your draft. Before AI edits your text, it shows exactly which lines change and waits for you to confirm. Every capability is a skill file, so you can add your own.

**Publishing: ready when you are**

Copy to WeChat Official Account formatting in one click (several templates), or export to MD / HTML / PDF / DOCX. For WeChat writers there's also a topic board, material inbox, publishing schedule, and pre-publish checklist.

## Getting started

### Desktop app

1. Download the `.dmg` from [Releases](https://github.com/Canace22/md-render/releases/latest). It runs on both Intel and Apple Silicon Macs.
2. If macOS says **"the app is damaged and can't be opened"** on first launch, that's because the app isn't signed by Apple — the file is fine. Go to **System Settings → Privacy & Security** and click "Open Anyway", or run:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/MD Render.app"
   ```

The installer can lag behind `main`, so a few new features may not be in it yet — see the "未发布" (Unreleased) section of the [CHANGELOG](./CHANGELOG.md).

### Web version

Open <https://canace22.github.io/md-render/>.

**Heads-up: the web version stores everything in your current browser only.** Clearing browser data or switching computers means losing your content. For ongoing writing, use the desktop app; otherwise export a backup regularly from **设置 → 备份（JSON）** (Settings → Backup).

### Desktop vs. web

| | Desktop | Web |
|---|---|---|
| Where content lives | Your computer, optionally as `.md` files | Current browser |
| Full-text search | Searches document bodies | Keyword matching only |
| Document version history | Last 7 days, automatic | Not available |
| Let Claude Desktop / Cursor etc. operate the app | Yes | No |
| Everything else | Same | Same |

## Setting up the AI assistant

Pick one of two ways:

**Option 1: you have Codex / Claude Code / Cursor installed (recommended, desktop)**

Nothing to configure. The assistant detects your agent (Codex first) and uses your own login, config, skills and MCP — **no API key needed**. If none is installed or logged in, the settings page shows how; click "重新检测" (Re-detect) afterwards.

- By default the agent can edit files and run commands in the current project; every step shows in the panel, and Stop also kills the commands it started.
- For a safer setup, turn on **AI 助手 → 设置 → 安全模式** (safe mode) to only allow file edits.

**Option 2: no local agent — connect a model API**

Run a small relay service (`server/ai-proxy`) that holds your API key. MiniMax and DeepSeek work out of the box; other OpenAI-compatible APIs can be added via "自定义" (Custom). To run it locally (requires Node.js):

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # put your key in .env
node server/ai-proxy/server.js                         # listens on http://localhost:8788
```

The desktop app connects to `http://localhost:8788` by default. To deploy elsewhere, see [server/README.md](./server/README.md), then enter the address under **AI 助手 → 设置 → AI 代理地址** (AI proxy address).

## Common tasks

### Copy to WeChat Official Account

1. Write or paste Markdown in the editor.
2. Pick a template in **设置 → 排版风格** (Settings → Layout style).
3. Click **复制到微信公众号** (Copy to WeChat) at the top of the preview.
4. Paste into the WeChat editor.

### Open your own folder (desktop)

Choose any folder in **设置 → 本地项目目录** (Settings → Local project folder). The `.md` files in it become your documents, and new documents are saved there too. If you change files outside the app, click "从磁盘同步" (Sync from disk).

The app doesn't sync across devices. Compare and restore past versions via `Cmd/Ctrl + K` → 查看文档版本历史; for long-term history, put the folder under Git.

### Let your own AI use your content (desktop)

- **Open the content vault**: point Claude Code etc. at `~/Documents/MdRender`. The app maintains an `AGENTS.md` and skills there, so your agent gets the same skills even with the app closed.
- **MCP**: Claude Desktop, Cursor and others can operate the running app over MCP; body edits and deletions need your confirmation in the app. See [server/mcp-bridge/README.md](./server/mcp-bridge/README.md), or copy the config from **设置 → 外部 agent 接入**.

## Contributing

```bash
pnpm install
pnpm dev            # web version at http://localhost:3000
pnpm electron:dev   # desktop app
```

The project started as a from-scratch Markdown parser (`packages/markdown-core`), hence the name. Building, testing, project layout, releases, and deployment are in the [development guide](./docs/development.md) (Chinese). See the [CHANGELOG](./CHANGELOG.md) for changes and the [roadmap](./docs/content-creation-roadmap.md) for what's next.

## License

[MIT](./LICENSE)
