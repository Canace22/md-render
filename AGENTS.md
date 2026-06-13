# md-render 开发规范（根）

> 本文件是所有 AI 协作工具（Claude Code / Cursor / Codex 等）的**规则真相源**。
> 各工具只通过指针引用，**不复制正文**：Claude → 根 `CLAUDE.md`；Cursor → `.cursor/rules/base.mdc`。
>
> 本文件只放**跨模块通用规则**。区域专属规则按目录分层，碰到该区域才加载：
> - Electron 主进程规则 → [`apps/editor/main/AGENTS.md`](apps/editor/main/AGENTS.md)
> - 渲染进程规则 → [`apps/editor/renderer/AGENTS.md`](apps/editor/renderer/AGENTS.md)

## 总则

- 修改前先定向搜索，只看相关文件；忽略 lockfile、构建产物和大型生成文件。
- **遵循约定** —— 严格遵循项目的既定模式和命名规范。
- 简洁、易懂、实用，避免过度设计。
- 做最小化改动，避免影响无关模块。
- 代码保持小函数、低复杂度、少重复、少副作用；设计模式只在确实合适时使用。
- 禁止使用魔法数字，使用常量代替。
- 禁止在 JSX 中使用 `eval()` 或 `Function()`。

## 技术栈

- **Vite 5.x** - 构建工具
- **React 18** - 函数式组件 + Hooks
- **JavaScript（JSX）** - 纯 JS，**禁止引入 TypeScript**（`.ts` / `.tsx`）
- **Zustand 5.x** - 全局状态管理
- **@blocknote/react 0.47.x** - 富文本块编辑器（Novel 模式）
- **Ant Design 5.x** - UI 组件
- **shiki 3.x** - 代码语法高亮
- **lucide-react** - 图标库
- **包管理** - pnpm

## 进程边界与安全（核心架构约束）

- **Renderer 进程禁止使用任何 Node.js API**（如 `fs`、`path`、`os` 等）。
- **所有系统级操作必须通过 IPC** 在主进程完成。
- Renderer 仅允许通过 `window.electron` 调用主进程能力。
- 禁止在 Renderer 中直接访问文件系统，禁止绕过 IPC 访问系统资源。
- 禁止引入未声明的状态管理或副作用方案。

## 架构与工程规范

### 进程分离

- **Main Process**：窗口管理、文件系统、IPC、preload —— 规则见 `apps/editor/main/AGENTS.md`
- **Renderer Process**：React UI + Zustand 状态 —— 规则见 `apps/editor/renderer/AGENTS.md`
- **通信方式**：仅通过 IPC（`window.electron`）

### 推荐调用链路（标准模式）

```text
React Component
  → Zustand Store
    → Renderer Service / Utils（IPC Client）
      → IPC Handler（preload.js）
        → Main Process Service（main.js）
```

### 目录结构

```text
apps/
└── editor/
    ├── main/                    # Electron 主进程（main.js、preload.js）
    ├── renderer/                # 渲染进程（Vite + React）
    │   ├── index.html
    │   └── src/
    │       ├── components/      # React 组件
    │       ├── core/novel/      # 小说辅助（实体抽取、场景分析等）
    │       ├── hooks/
    │       ├── store/
    │       │   ├── useEditorStore.js  # 全局状态（zustand + persist）
    │       │   └── workspaceUtils.js  # 工作区纯函数工具
    │       ├── utils/
    │       └── styles/
    └── tests/                   # app 相关测试
packages/
└── markdown-core/
    └── src/
        ├── parser.js            # Markdown 解析器 → token 数组
        └── renderer.js          # token 数组 → HTML 字符串
```

### 模块职责

- **Main Service**（main.js）：窗口管理、文件系统操作，不依赖 UI
- **IPC Handler**（preload.js）：仅做 bridge 转发，**不写业务逻辑**
- **Renderer Utils/Service**：IPC 客户端，封装调用（如 `notionService.js`）
- **Component**：纯 UI，不直接调用 IPC

## 代码组织规范

### 文件命名

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| React 组件 | PascalCase.jsx | `SettingsPanel.jsx` |
| 工具/Hook 文件 | camelCase.js | `markdownUtils.js` |
| 样式文件 | styles.css / design-tokens.css | - |

### 命名规范

| 场景 | 规则 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `MarkdownEditor`, `WorkspaceSidebar` |
| 普通函数 | camelCase | `handleClick`, `parseMarkdown` |
| 变量 | camelCase | `isLoading`, `selectedId` |
| 常量（模块级） | UPPER_SNAKE_CASE | `STORAGE_KEY`, `DEFAULT_FILE_ID` |
| 事件处理 | handle 前缀 | `handleChange`, `handleSubmit` |
| 异步数据获取 | fetch/load/save 前缀 | `fetchNotionPages`, `saveWorkspace` |

### 导入顺序

```javascript
// 1. 外部库
import React, { useState } from 'react';
import { Button } from 'antd';

// 2. 内部组件/工具
import MarkdownEditor from '../components/MarkdownEditor';

// 3. 相对路径导入
import { SubComponent } from './components/SubComponent';
```

## 状态管理

全局状态集中在 `apps/editor/renderer/src/store/useEditorStore.js`（Zustand + persist），**不新建其他全局 store**。

- 持久化通过 zustand `persist` 中间件实现，key 统一在 store 文件顶部定义为常量
- 页面内临时状态使用 `useState`
- 禁止直接操作 `localStorage`（统一通过 zustand `persist` 中间件或已有的常量 key 访问）

## 样式规范

- 样式写在 `apps/editor/renderer/src/styles/styles.css`，CSS 变量定义在 `design-tokens.css`
- 优先使用 CSS class，不写大段内联 style
- 主题颜色通过 CSS 变量控制，不要硬编码颜色值
- 需要考虑暗色 / 亮色主题

## 核心模块约定

### parser.js / renderer.js

- `packages/markdown-core/src/parser.js` 只负责文本 → token，无副作用
- `packages/markdown-core/src/renderer.js` 只负责 token → HTML 字符串，无副作用
- 新增语法支持：先在 parser 中加 token 类型，再在 renderer 中加对应渲染方法

### notionService.js

Notion API 调用统一封装在此文件，组件不直接调用 Notion API。

### wechatCopy.js / wechatTemplates.js

微信公众号格式化逻辑，模板定义在 `wechatTemplates.js`，复制逻辑在 `wechatCopy.js`。

## 禁止行为

- 禁止引入 TypeScript（`.ts` / `.tsx`）
- 禁止使用 class 组件
- 禁止直接 `fetch`（封装到 `apps/editor/renderer/src/utils/` 下对应模块）
- 禁止在 JSX 中写复杂的业务逻辑，抽到 hooks 或 utils

## 代码质量约束

- 单一职责：每个函数只做一件事，保持小函数
- 纯函数优先：工具函数和核心逻辑尽量无副作用
- 组件超过 300 行考虑拆分

## 错误处理

- 异步操作统一 try/finally 管理 loading
- 必要时展示错误提示（Ant Design Message）
- 关键组件使用 ErrorBoundary

## 验证与测试

- 默认不要主动执行测试命令；只列出建议验证项或测试 case
- 只有用户明确要求"跑测试""帮我验证""跑单测"等，才执行对应命令
- 不要主动运行 Playwright / E2E / 浏览器自动化测试，除非用户明确点名
- **跑完测试必须清理临时产物**：一旦执行过测试，完成后检查并删除工作区里残留的临时文件，尤其是 `vitest.config.*.timestamp-*.mjs` / `vite.config.*.timestamp-*.mjs`（Vitest 加载配置时生成，进程被超时打断会残留）。不能把这类文件留在工作区污染 git 状态

## Git 提交规范

```text
feat: 新增功能
fix: 修复问题
style: 样式调整
refactor: 代码重构
docs: 文档更新
test: 测试相关
chore: 构建/工具相关
```

## 说明

- 本文档为 **AI Agent 优先规范**，适用于所有协作模型。
- 强制约束优先级高于所有其他说明。
- 未声明的行为默认不允许。

## 参考文档

[README.md](./README.md)
