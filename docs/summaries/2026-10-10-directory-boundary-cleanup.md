# 目录边界小修：json-tool 归位 + @shared 别名

日期：2026-10-10

## 背景

觉得 `apps/editor` 太深。实际看下来，最深的文件也只有 6 层（`apps/editor/renderer/src/core/agent/x.js`），对 Electron + monorepo 来说不算离谱。真正别扭的是两处：

- `apps/json-tool` 有 `exports`、被 editor 当 `workspace:*` 依赖引用，其实是**库**，却放在 `apps/` 下，搞乱了 apps 和 packages 的分工；
- editor 里有 106 处 `../shared`、`../../../../shared` 这类相对路径，读着累，文件一挪就断。

## 做法

| 改动 | 文件 |
|------|------|
| `apps/json-tool` → `packages/json-tool`，包名不变，用 `pnpm install --lockfile-only` 重新生成 lockfile | `packages/json-tool/`、`pnpm-lock.yaml` |
| 新增 `@shared` → `apps/editor/shared` 别名，renderer、main、preload 三份 vite 配置都配上 | `apps/editor/vite.config.js` |
| 单测同样配上别名 | `apps/editor/vitest.config.js` |
| 加 `jsconfig.json` paths，让编辑器能跳转 `@shared/*` | `apps/editor/jsconfig.json` |
| 把 renderer / main / tests-unit 里所有 `(../)+shared/xxx` 换成 `@shared/xxx`（脚本逐条确认目标文件存在） | 70 个文件 |
| AGENTS.md 补上目录树和「引用 shared 用 @shared」的约定 | `AGENTS.md` |

`shared/` 内部互相引用仍用 `./`，没有改动。

## 没做的

- 没有把 `renderer/src/*` 上移去掉 `src` 这一层：要挪 191 个文件，收益只是少一层。
- 没有把 `apps/editor` 提到根目录：electron-builder、vite、文档和 skills 里的路径都要跟着改，回归风险大。
- editor 用相对路径直接引用根目录的 `server/mcp-bridge`（越过了 workspace 边界），这次没动。

## 验证

- `pnpm build`（renderer）通过。
- `ELECTRON=true vite build` 通过，main / preload / databaseSearchWorker 产物里没有残留未解析的 `@shared/`。
- 全仓库 `grep "(../)+shared/"` 结果为 0。
