# CLAUDE.md

编码规范见 [AGENTS.md](./AGENTS.md)，以下是快速摘要和补充说明。

## 项目概述

Markdown 内容创作工具，支持 Markdown 编辑/预览、微信公众号格式化、Notion 导出、小说写作辅助等功能。

- **技术栈**：React 18 + Vite 5 + Zustand 5 + BlockNote 0.47 + Ant Design 5 + shiki 3
- **语言**：纯 JavaScript（JSX），无 TypeScript
- **包管理**：pnpm

## 快速上手

```bash
pnpm dev          # 开发服务器
pnpm build        # 构建
pnpm test:unit    # 单元测试（vitest）
pnpm test:e2e     # E2E 测试（playwright）
```

## 关键约定（必须遵守）

1. **不引入 TypeScript**，所有文件保持 `.js` / `.jsx`
2. **全局状态**统一走 `src/store/useEditorStore.js`（zustand），不要新建其他全局 store
3. **样式**用 CSS class + CSS 变量，颜色值从 `design-tokens.css` 取，不硬编码
4. **核心逻辑**（解析/渲染）保持无副作用纯函数，改 `parser.js` / `renderer.js` 前先看懂现有结构
5. **改动后必须跑** `pnpm test:unit`

## 常见入口

| 需求 | 看这里 |
|------|--------|
| 编辑器主逻辑 | `src/components/MarkdownEditor.jsx` |
| 全局状态 | `src/store/useEditorStore.js` |
| Markdown 解析/渲染 | `src/core/parser.js` + `src/core/renderer.js` |
| 微信格式化 | `src/utils/wechatCopy.js` + `src/utils/wechatTemplates.js` |
| Notion 集成 | `src/utils/notionService.js` + `src/utils/notionConverter.js` |
| 小说辅助 | `src/core/novel/` |
| CSS 变量 | `src/styles/design-tokens.css` |
