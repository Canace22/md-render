# MD Render

[中文](./README.md)

**A local-first writing workbench for Chinese content creators: plan what to write today, draft long-form posts, let AI help you revise, then copy the result to WeChat Official Accounts with formatting intact.**

Built for WeChat / blog authors and independent creators. The UI is in Chinese. On macOS you can [download the desktop app](https://github.com/Canace22/md-render/releases/latest); on other platforms, try the [web version](https://canace22.github.io/md-render/).

## Getting started

### Desktop app (recommended)

1. Download the `.dmg` from [Releases](https://github.com/Canace22/md-render/releases/latest). It runs on both Intel and Apple Silicon Macs.
2. If macOS says **"the app is damaged and can't be opened"** on first launch, that's because the app isn't signed by Apple — the file is fine. Go to **System Settings → Privacy & Security** and click "Open Anyway", or run:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/MD Render.app"
   ```

The installer can lag behind the `main` branch, so a few features described here may not be in it yet — see the "未发布" (Unreleased) section of the [CHANGELOG](./CHANGELOG.md).

### Web version

Open <https://canace22.github.io/md-render/> — nothing to install.

**Heads-up: the web version stores everything in your current browser only.** Clearing browser data or switching computers means losing your content. For ongoing writing, use the desktop app; if you stick with the web version, export a backup regularly from **设置 → 备份（JSON）** (Settings → Backup).

### AI assistant: works with your Codex / Claude Code / Cursor

On desktop, the assistant detects the agents installed on your machine (Codex first, then Claude Code, then Cursor) and picks one, **no API key needed**. It runs with your own login, `AGENTS.md` / `CLAUDE.md`, skills and MCP, and md-render's tools are lent to it. Switch agent and model from the button next to the input box; "跟随默认" (follow default) uses your agent's own config.

By default the agent can edit files and run commands in the working folder (the open local project, or the content vault) without asking each time; every step shows up in the panel and the Activity tab, and Stop also kills the commands it started. Turn on **Settings → 安全模式 (safe mode)** to only allow file edits.

### No local agent? Connect a model API

Without a local agent, the assistant uses an API provider. It needs a small relay service (`server/ai-proxy`) that holds your model API key. MiniMax and DeepSeek are supported out of the box; other OpenAI-compatible APIs can be added by picking "自定义" (Custom) in the assistant's settings.

Running it locally takes three steps (requires Node.js):

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # then put your key in .env
node server/ai-proxy/server.js                         # listens on http://localhost:8788
```

The desktop app connects to `http://localhost:8788` by default, so it works as soon as the service is up. If you deploy the service elsewhere (see [server/README.md](./server/README.md)), enter its address in the AI panel under **设置 → AI 代理地址** (Settings → AI proxy address).

## What you can do

- **Daily notes**: tasks, notes, and events per day; unfinished tasks carry over to the next day automatically.
- **Writing**: Markdown editing with live preview, code highlighting, Mermaid diagrams, tables, table of contents, light / dark themes.
- **AI assistant**: docked on the right. Rewrites, expands, polishes, suggests titles, and produces WeChat / Xiaohongshu / Zhihu versions; `/编辑部审稿` has nine editor personas review your draft together. When AI edits your text, it shows exactly what changed and only applies it after you confirm.
- **Topic-to-publish pipeline**: topic board, material inbox, idea canvas, publishing schedule, and a pre-publish checklist.
- **Knowledge base**: `[[Document Name]]` wikilinks, backlinks, graph view, full-text search.
- **Publishing**: one-click copy to WeChat Official Account formatting (several templates), plus export to MD / HTML / PDF / DOCX.

For a screen-by-screen guide, see the [feature guide](./docs/产品功能说明.md) (Chinese).

## Common tasks

### Copy to WeChat Official Account

1. Write or paste Markdown in the editor.
2. Pick a template in **设置 → 排版风格** (Settings → Layout style).
3. Click **复制到微信公众号** (Copy to WeChat) at the top of the preview.
4. Paste into the WeChat editor.

### Keep drafts in your own folder (desktop)

Choose a folder in **设置 → 本地项目目录** (Settings → Local project folder). From then on, every draft is saved as a plain `.md` file in that folder, readable by any other editor. If you change files outside the app, click "从磁盘同步" (Sync from disk) to pull them back in.

The app doesn't sync across devices. The desktop app keeps 7 days of version history per document (`Cmd/Ctrl + K` → 查看文档版本历史, compare and restore); for long-term history, put the folder under Git.

### Desktop vs. web

| | Desktop | Web |
|---|---|---|
| Where content lives | Local database, optionally as `.md` files on disk | Current browser |
| Full-text search | Searches document bodies | Keyword matching only |
| Let Claude Desktop / Cursor etc. operate the app ([MCP](./server/mcp-bridge/README.md)) | Yes | No |
| Everything else | Same | Same |

## Contributing

```bash
pnpm install
pnpm dev            # web version at http://localhost:3000
pnpm electron:dev   # desktop app
```

Building, testing, project layout, releases, and deployment are covered in the [development guide](./docs/development.md) (Chinese). See the [CHANGELOG](./CHANGELOG.md) for what changed and the [roadmap](./docs/content-creation-roadmap.md) for what's next.

## License

[MIT](./LICENSE)
