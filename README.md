# Markdown Renderer

[中文版说明](./README.zh.md)

A simple, lightweight Markdown renderer built with vanilla JavaScript, supporting CommonMark specification, with no dependencies required.

## Features

- ✅ Headings (H1-H6)
- ✅ Paragraphs
- ✅ Unordered and ordered lists
- ✅ Nested lists
- ✅ Code blocks (integrated highlight.js syntax highlighting with one-click copy)
- ✅ Inline code
- ✅ Links (with title attribute support)
- ✅ Bold and italic text
- ✅ Strikethrough
- ✅ Images (with alt and title attribute support)
- ✅ Blockquotes (with multi-line support)
- ✅ Horizontal rules
- ✅ Tables (GFM extension)
- ✅ Real-time preview
- ✅ Copy to WeChat Official Account format

## Usage

### Development Mode

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open `http://localhost:3000` in your browser
4. Enter Markdown text in the left input area
5. The right side will display the rendered result in real-time

### Copy to WeChat Official Account

1. Enter or edit Markdown text in the left input area
2. The right side will display the rendered result in real-time
3. Click the "复制到微信公众号" (Copy to WeChat Official Account) button in the top right corner of the preview panel
4. The converted HTML content will be automatically copied to the clipboard
5. Paste it into the WeChat Official Account editor

**Notes:**
- Code blocks will be automatically converted to WeChat-compatible `<pre><code>` format
- Image links will be automatically converted to HTTPS (if originally HTTP)
- All custom class attributes and data-* attributes will be removed to ensure compatibility

### Production Build

```bash
npm run build
```

The build output will be generated in the `dist/` directory.

## Project Structure

```
md-render/
├── index.html              # Application entry HTML
├── package.json            # Project configuration and dependencies
├── vite.config.js          # Vite build configuration
├── src/                    # Source code directory
│   ├── main.jsx            # React application entry
│   ├── components/         # React components
│   │   └── MarkdownEditor.jsx  # Main editor component
│   ├── core/               # Core functionality modules
│   │   ├── parser.js       # Markdown parser
│   │   └── renderer.js     # HTML renderer
│   └── styles/             # Style files
│       └── styles.css      # Main style file
├── README.md               # Project documentation
├── ARCHITECTURE.md         # Architecture documentation
└── REACT_MIGRATION.md      # React migration analysis report
```

## Supported Markdown Syntax

### Block Elements

- `# Heading` - Headings (H1-H6, using 1-6 # characters)
- `` ```code block```` - Code blocks (supports language tags for syntax highlighting, e.g., ` ```javascript `)
- `> Quote` - Blockquotes (supports multi-line quotes)
- `- List item` - Unordered lists
- `1. List item` - Ordered lists
- Nested lists: Use indentation (2 or more spaces) to create nested lists
  ```markdown
  - First level item
    - Second level nested item
      - Third level nested item
    1. Second level ordered item
    2. Another ordered item
  ```
- `---` / `***` / `___` - Horizontal rules (at least 3 characters)
- Tables (GFM extension):
  ```markdown
  | Column 1 | Column 2 | Column 3 |
  |----------|----------|----------|
  | Content 1 | Content 2 | Content 3 |
  ```

### Inline Elements

- `**bold**` - Bold text
- `*italic*` - Italic text
- `***bold italic***` - Bold + italic combination
- `~~strikethrough~~` - Strikethrough text
- `` `code` `` - Inline code
- `[link](url)` - Basic link
- `[link](url "title")` - Link with title
- `![image](url)` - Basic image
- `![image](url "title")` - Image with title

## Technical Implementation

- Pure JavaScript, core functionality has no dependencies
- Integrated highlight.js for code syntax highlighting (via CDN)
- Modular design, easy to extend
- Dark theme, comfortable for the eyes

## Implementation Principles

For detailed implementation principles, architecture design, and execution flow, please refer to [ARCHITECTURE.md](./ARCHITECTURE.md).

## Changelog

### v2.0 - CommonMark Support

- ✅ Strikethrough support (`~~text~~`)
- ✅ Image support (`![alt](url)` and `![alt](url "title")`)
- ✅ Link title attribute support (`[text](url "title")`)
- ✅ Multi-line blockquote support (consecutive blockquotes are merged)
- ✅ Table support (GFM extension)
- ✅ Optimized inline element parsing order
- ✅ Added image and table styles

### v1.3 - Code Block Enhancements

- ✅ Code block copy: Copy button in the top-right corner of each code block
- ✅ Uses Clipboard API with fallback to `execCommand('copy')`
- ✅ Shows "Copied" feedback on success
- ✅ Code syntax highlighting: Integrated highlight.js
- ✅ Uses github-dark-dimmed theme, adapted for dark interface
- ✅ Supports all languages supported by highlight.js

### v1.2 - Nested List Support

- ✅ Supports multi-level nested lists (identified by indentation levels)
- ✅ Supports mixed ordered and unordered lists (can be mixed in the same document)
- ✅ Recursive parsing and rendering, supports arbitrary nesting depth

### v1.1 - UI and Spacing Adjustments

- ✅ Empty lines rendered as `<br>`, providing appropriate paragraph separation
- ✅ Top and bottom margins of paragraphs, lists, code blocks, and blockquotes adjusted to `0.8em` for comfortable reading spacing
- ✅ Top and bottom margins of horizontal rules adjusted to `1em`
- ✅ Heading margins recalibrated to ensure clear hierarchy
- ✅ Code blocks now have language header (similar to VS Code preview), structure: `figure.code-block > .code-header + pre`
- ✅ Blockquotes use light background with light blue border for enhanced readability
- ✅ Preview area defaults to full-width display; to center the content, add `max-width` and `margin: 0 auto` to `#markdown-output`

## Deploy to GitHub Pages

This project is a pure static site (`index.html` + JS/CSS) and can be automatically deployed to GitHub Pages via GitHub Actions.

### One-time Configuration

1. Open Settings → Pages in your GitHub repository.
2. Set Source to "GitHub Actions".
3. Confirm the repository branch is `main` (or adjust according to your default branch).

### Automatic Deployment

- Built-in workflow: `.github/workflows/deploy-pages.yml`
- When you `push` to the `main` branch, it will automatically build and deploy to GitHub Pages.
- You can also manually run it in the Actions tab (Workflow Dispatch).
- Vite base path is handled automatically for project pages. During Actions builds, the `base` is inferred as `/<repo>/`; locally it's `/` so development is unaffected.

### Access URL

- After successful deployment, the page will be exposed through the environment link; generally:
  - Personal homepage: `https://<username>.github.io/`
  - Project page: `https://<username>.github.io/<repo>/`

### Customization and Common Issues

- If your static files are not in the repository root, modify the `path` in the workflow's `actions/upload-pages-artifact@v3`.
- The workflow has been configured with necessary permissions: `pages: write` and `id-token: write`.
- If your repository's default branch is not `main`, please update the workflow trigger branch accordingly.
- If assets 404 on Pages, ensure the `vite.config.js` `base` points to `/<repo>/` for project pages. This repo auto-inferrs base during CI via `GITHUB_REPOSITORY`.

