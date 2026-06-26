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

## 项目 Skills（`.agents/skills/`）

可复用工作流（改 parser、微信模板、store、跑构建等）的**正文只维护在** [`.agents/skills/`](.agents/skills/)。  
各 AI 工具通过**适配入口**或工具内置 skill 发现机制引用，**禁止**在 `.cursor/rules/` 等规则文件中复制完整 Skill 正文。

### 何时必须加载

- 用户意图或任务描述**匹配**某 Skill 的触发场景时，**先读取**对应 `.agents/skills/<name>/SKILL.md`，再按其中步骤执行。
- 不要跳过 Skill 正文，直接用通用推断代替。
- Skill 优先级：**低于**本文件强制约束，**高于**模型默认行为。
- 未在 `.agents/skills/` 声明的工作流，不要自行发明 Skill。

### 目录约定

| 路径 | 用途 |
|------|------|
| `.agents/skills/<name>/SKILL.md` | Skill 正文（frontmatter、触发词、步骤、约束、示例） |
| `.agents/skills/<name>/scripts/` | 可选脚本（如 `pre-commit-secrets` 扫描脚本） |

新增 Skill 时：**先写** `.agents/skills/<name>/SKILL.md`，并在下表登记；按 [`skill-harvest`](.agents/skills/skill-harvest/SKILL.md) 规范判断是否值得沉淀。

### Skill 自主进化

每完成一个有实质内容的任务后，主动做一次沉淀判断（走 `skill-harvest` skill），不要等用户开口。

**触发条件（满足任一即评估）：**

- 这类任务**会反复出现**（如又加了一种 Markdown 语法、又加了一个微信模板）
- 踩到了**不看代码想不到的坑**，并找到了正确做法
- 走了一套**固定多步、容易漏步**的流程
- 用到了**项目特有约定**且现有 skill 没覆盖

**自动动作：**

1. 命中触发条件 → 读取并执行 `skill-harvest` skill。
2. **先查重**：扫 `.agents/skills/`，已有相关 skill 就**更新**它，不新建重复的。
3. 没有就**新建** `.agents/skills/<name>/SKILL.md`。
4. 沉淀后用**一句话**告知用户：沉淀/更新了哪个 skill、为什么值得沉淀。

**边界（避免噪音）：** 一次性任务、纯通用常识、本文件已写清的静态规范——不沉淀。拿不准时先问用户一句。

### 现有 Skills

| 名称 | 作用 |
|------|------|
| `safe-change-workflow` | 改代码标准流程：定向搜索 → 最小改动 → 10 case |
| `mermaid-verify` | Mermaid 图自检：语法可渲染、暗黑主题清晰 |
| `md-render-parser-renderer` | 改 parser/renderer 核心解析渲染逻辑 |
| `md-render-store` | 改全局状态（zustand） |
| `md-render-wechat` | 微信公众号格式化 |
| `md-render-external-api-proxy` | 前端调第三方 API 的代理化（CORS、可配置） |
| `md-render-binary-asset` | 二进制媒体存盘与 local-media:// 引用 |
| `md-render-daily` | 今日速记面板（切日期 / carryOver 约定） |
| `md-render-blocknote-core` | BlockNote 底层接入与避坑 |
| `md-render-agent` | Agent 工具、引擎、面板 |
| `md-render-kb-source` | 知识库新增节点类型 / 外部来源 |
| `skill-harvest` | 判断并生成新 skill（沉淀机制执行器） |
| `pre-commit-secrets` | 提交/push 前扫描敏感信息 |

> 维护说明：新增或变更 Skill 时，同步更新上表；正文细节以 `.agents/skills/` 为准。

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

## 验证与测试

- 默认不要主动执行测试命令；只列出建议验证项或测试 case
- 只有用户明确要求「跑测试」「帮我验证」「跑单测」等，才执行对应命令
- 不要主动运行 Playwright / E2E / 浏览器自动化测试，除非用户明确点名
- **跑完测试必须清理临时产物**：一旦执行过测试，完成后检查并删除工作区里残留的临时文件，尤其是 `vitest.config.*.timestamp-*.mjs` / `vite.config.*.timestamp-*.mjs`（Vitest 加载配置时生成，进程被超时打断会残留）。不能把这类文件留在工作区污染 git 状态

## 增量提交（小步快跑）

**每次完成一个独立功能点，必须立即 commit，不允许积累多个未提交改动。**

- **验证前置：功能验证通过后才可提交。** 未验证的改动不算「完成」，不可提交。
  - 验证方式：本地编译通过 / 启动成功 / 功能正常运行 / 用户确认 OK
  - 反面教训：AI 助手全局化改动未验证 GPU 渲染问题就提交，导致窗口打不开；提交了无效代码还要回退，浪费时间
- 触发条件（满足任一即提交）：
  - 一个功能点写完并**验证通过**
  - 一个 bug 修复完成并**验证修复生效**
  - 一组相关的样式调整结束并**目视确认效果**
  - 一个文件被删除或重命名
  - 用户明确说「做完一个功能」 / 「先这样」 / 「提交一下」
- 提交前检查：`git status` 确认改动范围只覆盖当前功能，不夹带无关文件
- 提交粒度：一个 commit 只描述一件事，commit message 用一句话说清「做了什么」
- 提交时机不要等：验证通过后立即提交，不要积攒；也不要为了「完整性」把多个功能堆在一起——丢失比不完美更糟，但提交未验证的代码比不提交更糟
- 反面教训：工作区改动未提交，可能被上下文压缩、shell 异常、误操作冲掉，且无法回滚；但反过来，提交未验证的改动也会引入新 bug，两害相权取其轻是验证后立即提交

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
