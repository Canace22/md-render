---
name: md-render-electron-startup
description: 诊断 md-render 的 Electron 开发启动、白屏、端口冲突、preload 失效或主进程 ESM/CJS 加载崩溃。用户说“electron:dev 白屏”“Electron 启动不了”“Vite ready 但没界面”时使用。
---

# Electron 启动诊断

先区分“页面尚未挂载”和“主进程已崩溃”，再做最小修复。

## 诊断步骤

1. 检查 `git status --short`，保留用户现有改动。
2. 运行 `pnpm electron:dev` 并保留完整终端输出。`VITE ready` 只代表服务已监听，不代表 Renderer 已挂载。
3. 用 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 和定向 `ps` 确认是否有旧 Vite/Electron 进程。未确认 PID 归属前不结束进程。
4. 已开启 9222 调试端口时，查看 `http://127.0.0.1:9222/json/list`：
   - 没有 HTTP page：主进程或窗口创建未成功。
   - page 存在但 `#root` 为空：继续查 Renderer 资源和异常。
   - `#root` 已有内容：再查计算样式和合成层，不要凭白屏截图直接归因 GPU。
5. preload 验证使用项目真实入口 `window.electronAPI`，并检查所需子能力，不要猜测变量名。
6. 若 Electron 33/Node 20 在 `cjsPreparseModuleExports` 报 `module.exports` 异常，先检查同一 ESM 入口中的多个 CommonJS 静态 import。对确认的 CommonJS 包使用 `createRequire(import.meta.url)` 同步加载，不改动其他 ESM 依赖。

## 边界

- 不因一次白屏就改 GPU 开关；先用 DOM、进程和终端证据区分慢启动、Renderer 错误和合成问题。
- 端口被占用时不要同时启动第二个 Electron 实例；它会干扰调试端口和日志判断。
- 默认不跑单测或 E2E；用户要求时再执行。运行态启动复现属于该诊断的必要证据。
- 不提交 `dist-electron/`、Vite/Vitest timestamp 文件或其他生成物。

## 验证

修复后至少确认这 10 项预期：

| # | 场景 | 预期 |
|---|---|---|
| 1 | 3000 端口空闲 | Vite 使用 3000 |
| 2 | 存在旧开发进程 | 先识别归属，不盲目启第二个实例 |
| 3 | Electron 主进程启动 | 输出 `app ready` |
| 4 | SQLite 初始化 | 无原生模块加载崩溃 |
| 5 | 自动更新模块加载 | 无 CJS/ESM 预解析崩溃 |
| 6 | Renderer 导航 | HTTP page 指向当前 Vite 地址 |
| 7 | React 挂载 | `#root` 至少有一个子元素 |
| 8 | preload | `window.electronAPI` 存在 |
| 9 | 数据库桥接 | `window.electronAPI.db.load` 可调用 |
| 10 | 界面布局 | 根容器可见且非零尺寸 |

## 完成标准

- 根因有运行时证据，并明确区分慢启动与崩溃。
- 修复只触及启动链路必要文件。
- 开发窗口、preload 和关键 IPC 桥接均可用。
