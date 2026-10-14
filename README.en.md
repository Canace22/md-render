# MD Render

[中文](./README.md)

**A local-first personal workbench: use Daily notes to capture ideas and manage each day's work, write articles, scripts, notes or any long-form text as documents, with an AI assistant always at hand.**

- **Desktop (macOS / Windows)**: [download the installer](https://github.com/Canace22/md-render/releases/latest) — recommended for everyday use. It uses Tauri 2 and the system WebView; the app itself does not require Node.js.
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

Polishes, expands, suggests titles, and rewrites for different platforms; type `/编辑部审稿` to have nine editor personas review your draft. Before AI edits your text, it shows exactly which lines change and waits for you to confirm. Built-in capabilities are organized as skills; creating or editing custom skills has not yet migrated to the first formal Tauri release.

**Publishing: ready when you are**

Copy to WeChat Official Account formatting in one click (several templates), or export to MD / HTML / DOCX. For WeChat writers there's also a topic board, material inbox, publishing schedule, and pre-publish checklist.

## Getting started

### Desktop app

1. Download the right package from [Releases](https://github.com/Canace22/md-render/releases/latest): `MD-Render-*-macOS-universal.dmg` for macOS or `MD-Render-*-windows-x64-setup.exe` for Windows.
2. The macOS package supports both Intel and Apple Silicon. The Windows installer uses `Program Files` and will ask for administrator approval.
3. Formal releases are signed and notarized on macOS or Authenticode-signed on Windows. SmartScreen may still warn while a new certificate builds reputation. Download only from this repository and verify the matching `SHA256SUMS` file. If macOS still rejects the package, re-download it and report the issue instead of bypassing Gatekeeper with `xattr`.

**Upgrading from the old Electron app requires one manual data handoff:**

1. Quit the old app completely.
2. Install and open the new version. If you used the Tauri preview, its existing data is inherited automatically; do not import it again.
3. To restore Electron data, open **设置 → Electron 数据交接** and select the old `knowledge.db`. Import is not a merge: it first backs up the current Tauri database, then replaces it with the Electron data. The Electron source stays unchanged.
4. If both apps contain new work, export a JSON backup from Tauri and save important drafts separately before importing.
5. Select your local workspaces again to grant write access.

The old database is normally at `~/Library/Application Support/md-render/knowledge.db` on macOS or `%APPDATA%\md-render\knowledge.db` on Windows. If it is not there, check the sibling `@md-render/editor` and `MD Render` folders. Do not delete it until the migration is verified.

The current Tauri database is backed up before import under `~/Library/Application Support/com.mdrender.app.tauri-preview/` on macOS or `%APPDATA%\com.mdrender.app.tauri-preview\` on Windows. The completion dialog shows the exact file name.

The old Electron updater cannot install a Tauri app across frameworks, and the first Tauri release does not yet include an updater. Install later versions manually from Releases for now.

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
| Open local workspaces | Yes; grant write access again after restart | No |
| Local Agent / MCP | Not in the first formal Tauri release | No |
| PDF export | Not in the first formal Tauri release | Depends on the visible web UI |

## Setting up the AI assistant

The current Tauri app connects to models through `ai-proxy`. The desktop app has no Node.js runtime and does not depend on Node being installed. If the release was built with a public HTTPS proxy, select a model in the app and start using it.

You can also self-host `server/ai-proxy` remotely or run it on your own computer. Only the local self-hosted proxy option requires Node.js:

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # put your key in .env
node server/ai-proxy/server.js                         # listens on http://localhost:8788
```

Enter `http://127.0.0.1:8788` under **AI 助手 → 设置 → AI 代理地址** after starting it. Use HTTPS when deploying it elsewhere; see [server/README.md](./server/README.md). Local Codex / Claude Code agents and MCP have not yet migrated to the first formal Tauri release.

## Common tasks

### Copy to WeChat Official Account

1. Write or paste Markdown in the editor.
2. Pick a template in **设置 → 排版风格** (Settings → Layout style).
3. Click **复制到微信公众号** (Copy to WeChat) at the top of the preview.
4. Paste into the WeChat editor.

### Open your own folder (desktop)

Choose any folder in **设置 → 本地项目目录** (Settings → Local project folder). The `.md` files in it become your documents, and new documents are saved there too. If you change files outside the app, click "从磁盘同步" (Sync from disk).

The app doesn't sync across devices. Compare and restore past versions via `Cmd/Ctrl + K` → 查看文档版本历史; for long-term history, put the folder under Git.

### Give your content to an external AI (desktop)

The formal Tauri app cannot yet expose the running app to Claude Desktop, Cursor, or other MCP clients, and the vault-to-files migration UI is not available yet. If your documents already live in a local workspace, open that folder directly with Codex or Claude Code. Keep other database-backed content in the app for now.

### Current desktop limitations

The first formal Tauri release does not include PDF export, local Agent, local MCP, vault-to-files migration, custom skill editing, or automatic updates. Their Electron fallback code is not part of the formal Release.

## Contributing

```bash
pnpm install
pnpm dev            # web version at http://localhost:3000
pnpm tauri:dev      # formal desktop shell
pnpm electron:dev   # legacy Electron fallback
```

The project started as a from-scratch Markdown parser (`packages/markdown-core`), hence the name. Building, testing, project layout, releases, and deployment are in the [development guide](./docs/development.md) (Chinese). See the [CHANGELOG](./CHANGELOG.md) for changes and the [roadmap](./docs/content-creation-roadmap.md) for what's next.

## License

[MIT](./LICENSE)
