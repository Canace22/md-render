---
name: md-render-architecture-boundary
description: 在 md-render 做跨 renderer/main/server 的架构边界重整时使用。触发场景包括"架构有问题""一次性优化架构""拆 main IPC""收口 renderer IPC""拆 server 单文件""store slice 化""保持行为不变重构"。略主动。
---

# md-render 架构边界重整

用于把已经堆到组件、store、main.js 或 server.js 里的逻辑重新收回到清晰边界，同时保持用户行为和外部接口不变。

## 为什么这么做

这个项目的核心约束是 Electron/Web 分层、唯一 Zustand store、资产模型稳定、IPC 兼容。架构重整最容易犯的错不是"没拆够"，而是拆的时候顺手改了协议、数据结构或产品行为，导致回归很难定位。

## 步骤

1. 先定向搜索真实入口：`MarkdownEditor.jsx`、`useEditorStore.js`、`main.js`、`preload.js`、`server/*/server.js`。
2. 明确不改的外部契约：`window.electronAPI` 暴露字段、IPC channel、workspace 节点结构、server endpoint 和响应 shape。
3. Renderer 先补 service/bridge 薄包装，再把组件里的 `window.electronAPI` 调用迁出去；允许 utils/service 直接接 bridge。
4. Store 保持一个 `useEditorStore`，可用 `store/slices/*` 组合 action；不要新建第二个全局 store。
5. Main 侧把 `ipcMain.handle` 拆到 `main/ipc/register*Handlers`，`main.js` 只保留 app 生命周期、窗口、tray、protocol、updater 事件监听。
6. Server 侧先拆 config、route、storage、tool runner 这类内部模块；不要改 endpoint、端口默认值或环境变量含义。
7. 每完成一组边界，优先跑 `node --check`、相关单测和 build；全量单测若有既有失败，要说明和本轮无关。

## 关键约束 / 易踩坑

- `preload.js` 兼容优先：可以内部整理，不要重命名已有 API。
- `database.js` 的 SQLite state 白名单要和 renderer state map 共用 key 来源，避免字段静默丢失。
- `AgentPanel` 是 host 注入层，`agentEngine` / `toolRegistry` 仍保持纯逻辑，不 import store 或 IPC。
- `main.js` 拆 handler 时不能重复注册同一个 channel，否则 Electron 启动会报错。
- 已有用户改动要保留；同文件重构时先看 `git diff`。

## 验证

默认不主动跑 E2E。建议最小验证：

| # | Case | 预期 |
|---|------|------|
| 1 | `node --check apps/editor/main/main.js` | 语法通过 |
| 2 | `node --check server/cloud-sync/server.js` | 语法通过 |
| 3 | `node --check server/ai-proxy/server.js` | 语法通过 |
| 4 | 相关 store 单测 | `useEditorStore` action 兼容 |
| 5 | agent 写回单测 | 仍走 `updateSelectedFileContent` |
| 6 | local project create target 单测 | 创建目标不变 |
| 7 | daily 切日期单测 | carryOver 语义不变 |
| 8 | production build | renderer 打包通过 |
| 9 | 全量单测失败 | 区分本轮回归和既有环境/旧断言失败 |
| 10 | 搜索组件直连 IPC | `components/` 下不再直接访问 `window.electronAPI` |

## 完成标准

- 外部接口和数据结构不变。
- 组件层不直接碰 IPC。
- main IPC 注册模块化且无重复 channel。
- server 单文件职责被拆开。
- 有最小单测或构建验证，并清理测试临时产物。
