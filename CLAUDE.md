Follow the standards defined in AGENTS.md.

IMPORTANT:
- The content of AGENTS.md is part of your instructions
- Treat it as system-level rules

## 项目概述

Markdown 内容创作工具，支持 Markdown 编辑/预览、微信公众号格式化、Notion 导出、小说写作辅助等功能。

## 快速上手

```bash
pnpm dev          # 开发服务器
pnpm build        # 构建
pnpm test:unit    # 单元测试（vitest）
pnpm test:e2e     # E2E 测试（playwright）
```

## 常见入口

| 需求 | 看这里 |
|------|--------|
| 编辑器主逻辑 | `apps/editor/renderer/src/components/MarkdownEditor.jsx` |
| 全局状态 | `apps/editor/renderer/src/store/useEditorStore.js` |
| Electron 主进程 | `apps/editor/main/main.js` + `apps/editor/main/preload.js` |
| Markdown 解析/渲染 | `packages/markdown-core/src/parser.js` + `packages/markdown-core/src/renderer.js` |
| 微信格式化 | `apps/editor/renderer/src/utils/wechatCopy.js` + `apps/editor/renderer/src/utils/wechatTemplates.js` |
| Notion 集成 | `apps/editor/renderer/src/utils/notionService.js` + `apps/editor/renderer/src/utils/notionConverter.js` |
| 小说辅助 | `apps/editor/renderer/src/core/novel/` |
| CSS 变量 | `apps/editor/renderer/src/styles/design-tokens.css` |
