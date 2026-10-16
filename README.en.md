# MD Render

[中文](./README.md)

**A local-first personal workbench: use Daily notes to capture ideas and manage each day's work, write articles, outlines, scripts, or any long-form text in Markdown, with an AI assistant always at hand.**

- **Desktop (macOS / Windows)**: [Download the installer](https://github.com/Canace22/md-render/releases/latest) — recommended for everyday use. Your content lives on your own computer and can be saved as plain `.md` files any editor can open.
- **Web**: [Open in browser](https://canace22.github.io/md-render/) — nothing to install, great for a quick try (data is stored only in your current browser).

> Note: The application UI is currently in Chinese.

## What it helps you do

**Daily notes: the first page you open each day**

One Workflowy-style outline per day for jotting down ideas, to-dos, and schedules. Supports nested lists, pasted images, and a one-click mind map view. Unfinished tasks automatically carry over to the next day.

**Documents: write anything**

Articles, outlines, scripts, technical docs, reading notes — all standard Markdown, with live preview, code highlighting, Mermaid diagrams, tables, table of contents, and light / dark themes.

- **Multiple views**: Switch any document to an **Outline / Mind Map** view or **Screenplay mode** (automatic scene & character stats, `Tab` dialogue cycling, and story beats).
- **Direct local files**: Use the built-in folders or open any folder on your computer to edit its `.md` files directly.
- **Connected knowledge base**: Type `@` or `[[Document Name]]` for wikilinks, backlinks, graph view, full-text search, plus an infinite whiteboard canvas for structuring ideas.

**AI assistant: docked on the right**

Polishes, expands, suggests titles, and rewrites drafts for different platforms; type `/编辑部审稿` to have 9 editor personas review your draft. Before AI modifies your text, it highlights the exact line changes and waits for your confirmation.

**Publishing & export: ready when you are**

Copy to WeChat Official Account formatting in one click (multiple templates included), or export to MD / HTML / DOCX. Includes a topic board, material inbox, publishing schedule, and pre-publish checklist.

## Getting started

### Desktop app

1. Download the installer from [Releases](https://github.com/Canace22/md-render/releases/latest):
   - **macOS**: `MD-Render-*.dmg` (Universal, supports both Intel and Apple Silicon)
   - **Windows**: `MD-Render-Setup-*.exe`
2. **First launch notice**: If the package is unsigned, approve it on macOS under **System Settings → Privacy & Security**, or click **More info → Run anyway** on Windows SmartScreen (you can verify the download against `SHA256SUMS` on the release page).
3. **Updates**: The app shows a banner when a newer version is available. Open the linked Release to download and install it manually; automatic in-app installation is not enabled yet.

<details>
<summary><b>Upgrading from the legacy Electron app? Click for data migration steps</b></summary>

The desktop app has moved from Electron to Tauri 2. If you are upgrading from an older Electron build, follow these steps once to bring your data over (existing Tauri preview users inherit their data automatically):

1. Quit the old MD Render completely, then install and open the new version.
2. Open **设置 → Electron 数据交接** and select your old `knowledge.db`:
   - macOS: `~/Library/Application Support/md-render/knowledge.db`
   - Windows: `%APPDATA%\md-render\knowledge.db` (or check sibling `@md-render/editor` / `MD Render` folders)
3. The import backs up your current Tauri database and replaces it with the Electron data (the original Electron database is never modified or deleted). If both versions contain new work, export a JSON backup first under **设置 → 备份（JSON）**.
4. Re-select your local workspace folders once to grant write access. Do not delete the old database until you have verified the migration.

</details>

### Web version

Open <https://canace22.github.io/md-render/>.

**Heads-up: the web version stores everything in your current browser only.** Clearing browser data or switching computers will erase your content. For ongoing writing, use the desktop app or export backups regularly via **设置 → 备份（JSON）**.

### Desktop vs. Web

| | Desktop | Web |
|---|---|---|
| Where content lives | Your computer (can directly edit local `.md` folders) | Current browser |
| Full-text search | Searches titles and document bodies | Keyword matching only |
| Version history | Keeps the last 7 days automatically | Not available |

## Common tasks

### Copy to WeChat Official Account

1. Write or paste Markdown in the editor.
2. Pick a template in **设置 → 排版风格** (Settings → Layout style).
3. Click **复制到微信公众号** (Copy to WeChat) at the top of the preview.
4. Paste directly into the WeChat Official Account editor.

### Open a folder on your computer (desktop)

Choose any folder in **设置 → 本地项目目录** (Settings → Local project folder). The `.md` files inside become your documents, and new documents are saved there too. If you edit files outside the app, click **从磁盘同步** (Sync from disk). After restarting the app, re-authorize the folder once to resume writing.

The app does not do multi-device sync by itself. Use `Cmd/Ctrl + K` → **查看文档版本历史** to compare and restore recent versions, or manage the folder with Git / cloud drive for long-term history and sync.

### Set up the AI assistant

If your build includes a configured public proxy, you can pick a model and use it right away.

To use your own API keys (MiniMax, DeepSeek, or any OpenAI-compatible endpoint), run the bundled proxy locally or on your server (requires Node.js):

```bash
git clone https://github.com/Canace22/md-render.git && cd md-render
cp server/ai-proxy/.env.example server/ai-proxy/.env   # add your API keys to .env
node server/ai-proxy/server.js                         # listens on http://localhost:8788
```

Then set **AI 助手 → 设置 → AI 代理地址** to `http://127.0.0.1:8788`. Use HTTPS when deploying remotely; see [server/README.md](./server/README.md).

## Contributing

```bash
pnpm install
pnpm dev            # web version (http://localhost:3000)
pnpm tauri:dev      # desktop app (Tauri 2)
```

The project started as a custom Markdown parser (`packages/markdown-core`), hence the name MD Render. Following the Tauri 2 desktop migration, features like PDF export, local CLI Agent / MCP, and custom skill editing are still being migrated.

- Product scope & principles: [PRODUCT.md](./PRODUCT.md) (Chinese)
- Build, test, architecture & release guide: [docs/development.md](./docs/development.md) (Chinese)
- Release notes & upgrade guide: [CHANGELOG.md](./CHANGELOG.md) (Chinese)
- What's next: [Roadmap](./docs/content-creation-roadmap.md) (Chinese)

## License

[MIT](./LICENSE)
