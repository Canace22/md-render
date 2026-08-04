Follow the standards defined in AGENTS.md.

IMPORTANT:
- The content of AGENTS.md is part of your instructions
- Treat it as system-level rules

## 项目概述

Markdown 内容创作工具，支持 Markdown 编辑/预览、微信公众号格式化、本地项目目录（工作区落盘，版本管理交给 Git）等功能。

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
| 本地文件桥接（Electron/Web 路由） | `apps/editor/renderer/src/utils/localProjectBridge.js` + `apps/editor/renderer/src/utils/webFsBridge.js` |
| AI 助手（agent 引擎/工具/面板） | `apps/editor/renderer/src/core/agent/`（`agentEngine.js` + `toolRegistry.js`） |
| 代理服务端 | `server/ai-proxy/` + `server/mcp-bridge/` |
| BlockNote 底层机制包 | `packages/blocknote-core/` |
| CSS 变量 | `apps/editor/renderer/src/styles/design-tokens.css` |

## 项目总结约定

每次较大改动结束后，在 `docs/summaries/` 生成并提交一份总结文档（`YYYY-MM-DD-<feature-name>.md`），
格式参考现有文件。不要在总结中添加 "Approved-by" 类段落。
