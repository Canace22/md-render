# Main Process 规范

Electron 主进程：窗口管理、文件系统、preload bridge。**禁止任何 UI 逻辑。**
通用规则（命名、进程边界、Git 等）见根 [`AGENTS.md`](../../../AGENTS.md)。

## 运行命令

- 开发：`pnpm dev`（从项目根目录）
- 测试：`pnpm test:unit`（从项目根目录）

## IPC 规范

- 主进程通过 `preload.js` 暴露 `window.electron` 接口给 Renderer
- 主进程必须捕获异常并返回错误，不得抛出到 Renderer

## 模块职责

- **main.js**：窗口生命周期管理、文件系统操作，可独立测试
- **preload.js**：仅做 contextBridge 暴露，**不写业务逻辑**

## 禁止行为

- 禁止在 preload 中写业务逻辑
- 禁止从 Main 直接操作 Renderer DOM
