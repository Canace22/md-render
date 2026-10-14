---
name: md-render-electron-startup
description: 诊断 md-render 的 Electron 开发启动、白屏、端口冲突、preload 失效、主进程 ESM/CJS 加载崩溃，以及 Electron 打包 / CI 发版失败（尤其 Windows）。用户说“electron:dev 白屏”“Electron 启动不了”“Vite ready 但没界面”“打包失败”“Release 没出来”“Windows 发布失败”“改 package-electron.mjs / release.yml”时使用。
---

# Electron 启动与打包诊断

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
6. 新 worktree 里 `pnpm install` 后 Vite 报 `Failed to resolve import "dayjs"`：`dayjs` 只是 antd 的传递依赖，没写进任何 package.json，主仓靠旧的扁平 node_modules 才解析得到。严格安装的新环境必然报错，且它被 `MarkdownEditor → DailyNotebook` 静态引用，整个应用都起不来。属于既有缺失依赖，不是当次改动引入的。
7. 若 Electron 33/Node 20 在 `cjsPreparseModuleExports` 报 `module.exports` 异常，先检查同一 ESM 入口中的多个 CommonJS 静态 import。对确认的 CommonJS 包使用 `createRequire(import.meta.url)` 同步加载，不改动其他 ESM 依赖。
8. 打包后日志出现 `icudtl.dat not found in bundle`，GPU / network service 连续崩溃时，先查 `.app/Contents/Frameworks/` 的符号链接。`fs.cp` 默认会把相对链接改成指向临时 staging 目录的绝对链接；回拷产物必须设置 `verbatimSymlinks: true`。修复后从正式安装路径启动，确认链接留在 bundle 内、控制桥能回复，再清理 staging；不要因此改 GPU 开关或先尝试重新签名。

## 打包 / CI 发版（`package-electron.mjs`、`ci.yml`、`release.yml`）

Tauri Release 只在推 `v*` tag 时跑；Pages 每次推 `main` 自动部署（别改回 tag 触发，`github-pages` 环境保护规则只放行默认分支，deploy 会无日志失败）。`.github/workflows/ci.yml` 是手动触发的旧 Electron 回退包，不能代替 Tauri Release 验收。GitHub 重跑旧 tag 会继续使用该 tag 中的 workflow；改了 `release.yml` 后要新建 tag 才能验证新逻辑。CI 日志过期会返回 410，排查要趁早。

正式签名是可选增强，不是发布前置条件：

- macOS 只有在 Developer ID / 公证 secrets 全部齐全时才导入证书并执行公证、stapling 和 Gatekeeper 校验；否则给 Tauri 传 `APPLE_SIGNING_IDENTITY=-` 做 ad-hoc 签名。两条路径都要校验 app 签名结构、DMG 完整性和 Universal 双架构。
- Windows 打包脚本已支持可选 `WINDOWS_SIGNTOOL_COMMAND`；PFX secrets 不齐时不导入证书、不做 Authenticode 校验，但仍要完成安装、启动和卸载冒烟检查。
- 没有受信任开发者签名的产物文件名必须带 `-unsigned`，Release 说明必须明示 macOS 系统确认和 Windows SmartScreen 风险。

**推了却没触发流水线**：先 `git ls-remote --tags origin` 看远端有没有这个 `v*` tag——多半是 tag 根本没推上去，只推了分支（分支 push 不触发任何流水线）。`release:tag` 现在默认自动提交 bump，并用 `git push --atomic origin <分支> <tag>` 一起推、推完核对远端 tag；改这个脚本不要退回「bump 后不提交就退出」的旧行为。

Windows 上踩过的坑（macOS 都不会暴露）：

1. **Node 版本**：workflow 的 `node-version` 要和本地一致（现为 22）。`better-sqlite3@12` 只发 Node 20+ 预编译包，Node 18 会退回 node-gyp 源码编译，而 `windows-latest` 的新版 Visual Studio 不被 pnpm 9 自带的 node-gyp 识别 → `find VS` 报错。
2. **spawn pnpm**：Windows 上 pnpm 是 `pnpm.cmd`，`spawn('pnpm')` 不开 shell 会 `ENOENT`。脚本里调 pnpm 一律走 `runPnpm()`（优先用 `npm_execpath` 交给 `process.execPath` 执行），不要新增裸 `spawn('pnpm')`。
3. **staging 必须与仓库同盘**：pnpm 9 `deploy` 用 `path.relative(项目目录, 目标/node_modules)` 算 modulesDir，跨盘（仓库 D:、TEMP 在 C:）会得到绝对路径并被拼回项目目录，报 symlink `ENOENT`，路径形如 `D:\...\apps\editor\C:\...`。所以 Windows staging 放在仓库同级 `.md-render-electron-builder`，不要改回 `%TEMP%`。

macOS universal 包踩过的坑：

4. **CI 上 `.node` 只有 arm64**：electron-builder 在 CI 默认用硬链接拷文件，universal 构建先打 x64 再 rebuild arm64，arm64 的 `.node` 原地覆盖时把 x64 临时包里的那份也改了，合并时两份相同就跳过 lipo → Intel Mac 打不开（Electron 本体仍是 universal，很难察觉）。脚本里已设 `USE_HARD_LINKS=false`，并在 mac 打包后用 `lipo -archs` 检查所有 `.node` 同时含 `x86_64 + arm64`，缺了直接失败。验证已发布的包：解开 dmg（`7z x`），对 `app.asar.unpacked/**/*.node` 执行 `file`。

自动更新（electron-updater）踩过的坑：

5. **Release 要带更新元数据**：updater 先读 Release 里的 `latest.yml`（win）/ `latest-mac.yml`（mac）判断新版本，mac 更新包是 `.zip` 不是 `.dmg`。`release.yml` 上传 artifact 时只传 `.exe` / `.dmg` 会让检查一直报错，而 `UpdateNotifier` 遇到 error 不显示，表现为「自动更新静默失效」。改上传路径时保留这些文件，Check output 步骤里有兜底检查。
6. **mac 未签名装不上更新**：Squirrel.Mac 校验签名，CI 当前 `CSC_IDENTITY_AUTO_DISCOVERY=false` 不签名，所以 mac 只提示并跳转 Release 页下载（`UpdateNotifier` 的 `isManualUpdate`）。配好 Apple 签名和公证后才能去掉这个降级。
7. **点下载像没反应**：第一条 `download-progress` 要等连上 GitHub、拿到 blockmap 之后才推，网络慢时会等很久。所以点击时提示条先自己切到「下载中 0%」；用户点了下载之后的 `error` 要显示出来并给「前往下载」；30 分钟一次的后台检查不能把下载中的状态覆盖掉（`UpdateNotifier` 的 `mergeUpdaterStatus`）。

排查顺序：先看失败在哪一步（Install / Build / Check output），再拿日志最后 60 行定位；能在 Linux 复现的部分（vite build、pnpm deploy）可用 `pnpm --filter @md-render/editor electron:pack --linux` 验证，Windows 专属问题用 `path.win32` 模拟路径或以 CI 的 Windows 任务为准。重推同名 tag 前先删远端 tag。

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
