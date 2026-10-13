# Tauri 2 桌面端迁移方案

## 结论

可以迁移，但不做“一次性替换 Electron”。先保留现有 Electron 版本，新增一个独立的 Tauri 2 预览壳，再按文件系统、数据库、AI/Agent、导出与更新的顺序逐项迁移。每一阶段达到验收门槛后再进入下一阶段，任何阶段都能退回 Electron。

这次迁移的核心收益是：正式安装包不再携带 Chromium 和 Node.js 运行时，直接使用系统 WebView。macOS 使用 WKWebView，Windows 使用 WebView2。包体和基础内存预计会明显下降，但“15 MB”只能作为目标，最终大小要以同时打入的 Rust 能力、资源文件和安装格式实测为准。

## 迁移目标

- 正式版不要求用户安装 Node.js、pnpm、Rust 或其他开发工具。
- 继续复用现有 React + Vite 界面，不重写编辑器。
- 用户内容仍是普通文件；现有工作区、Markdown 和素材目录保持可读。
- Renderer 不直接访问系统资源，统一经过桌面桥接层。
- macOS 先完成开发和验收，Windows 随后补齐并打包验证。
- Electron 在 Tauri 达到功能等价且经过一个稳定发布周期前继续保留。

## 明确不做

- 不在第一步迁移全部 63 处 `window.electronAPI` 调用。
- 不让 Electron 和 Tauri 同时写同一份数据库。
- 不把 Node.js 作为用户机器上的前置依赖，也不把完整 Node 运行时偷偷塞回安装包。
- 不在首个里程碑替换正式安装包、自动更新渠道或现有用户数据。
- 不承诺未经实测的包体、启动耗时和内存数字。

## 运行时与依赖边界

开发和构建仍需要 Node.js/pnpm，因为前端工具链是 Vite；Tauri 的原生部分还需要 Rust。这些只存在于开发机和 CI。最终用户拿到的是已经编译好的原生应用，不需要安装 Node.js 或 Rust。

本地 Agent、MCP、SQLite/FTS5 和 PDF 等目前依赖 Electron/Node 的能力，迁移时有两条允许的路径：

1. 用 Rust/Tauri command 直接实现；
2. 对确实适合独立进程的能力，编译为随应用分发的原生 sidecar。

无论采用哪条路径，都不能退化成“在用户机器上查找 node 命令”。

## 目标架构

```text
React / Vite UI
  -> 桌面能力接口（稳定业务语义）
     -> Electron adapter -> preload / IPC / Node 主进程
     -> Tauri adapter    -> invoke / Rust command / sidecar
```

第一阶段只新增运行时识别和 Tauri 壳，不伪造完整的 `window.electronAPI`。之后按能力域迁移，每迁移一组调用就把它收口进同一个桌面接口，Electron 与 Tauri 分别实现。这样网页版、Electron 和 Tauri 可以并存，也能避免一次改动整个 Renderer。

## 用户数据与安装位置

### macOS

- 应用安装到 `/Applications`。
- 用户主动选择的工作区继续放在用户指定的位置，不搬进应用私有目录。
- 配置、缓存、日志和数据库遵循 macOS 的 Application Support、Caches、Logs 目录约定。
- Tauri 预览版使用独立 bundle identifier 和独立应用数据目录，不直接打开或写入 Electron 正式版数据库。

### Windows

- 正式应用默认安装到 `Program Files`；普通用户无法静默写入该目录，这是正常的系统安全边界。
- 用户内容仍由用户选择位置，不默认藏进 AppData。
- 配置、缓存、日志和数据库仍应放在系统规定的用户数据目录；它们不适合写进 `Program Files`，也不能因此承诺完全不用 AppData。
- 安装器可以后续评估 Inno Setup 的现代化界面，但它不能替代代码签名。SmartScreen 警告主要依赖可信签名与信誉积累，不是换安装器就能消失。

## 分阶段实施

### 0. 双壳地基

- 建立独立的 Tauri 2 预览应用与开发命令。
- 复用现有 Vite 构建产物，Electron 命令和配置保持不变。
- 增加最小运行时信息桥接，证明 UI 能与 Rust 通信。
- 记录两套运行时的能力差异和验收结果。

退出门槛：网页版和 Electron 构建不回归；Tauri 能在 macOS 打开主窗口；运行时信息来自真实 Rust command；预览版不碰正式数据。

### 1. 文件与工作区

- 迁移打开目录、读写文件、重命名、删除、系统打开和本地媒体协议。
- 保持现有文件格式与工作区目录结构不变。
- 权限只开放给明确的用户操作，不给前端任意文件系统权限。

当前进度（2026-10-13）：已完成“手动选择目录 + 只读浏览文本文件”的前半步。目录授权和扫描都在 Rust 内完成，Renderer 只拿当前会话的不透明标识；写入、改名、删除、媒体协议和目录监听尚未开放。

退出门槛：常用工作区流程在两套桌面壳行为一致，异常和取消操作不会丢数据。

### 2. 数据库与搜索

- 在 Rust 侧实现 SQLite/FTS5 能力和数据库迁移。
- 首次迁移先复制、校验，再切换；保留 Electron 原库用于回滚。
- 禁止两个运行时并发写同一数据库。
- Electron 的 Chromium profile 与 Tauri 的 WKWebView/WebView2 profile 不共享，`localStorage` 里的 `md-renderer-*` 设置也不会自动出现。稳定切换前，由最后一个 Electron 版本把白名单内的已知 key 导出为带版本号的 handoff JSON，Tauri 只导入一次，并保留迁移标记。

退出门槛：旧数据数量、搜索结果、索引体积和已知本地设置经过抽样比对，失败可无损回退。

### 3. AI、Agent 与 MCP

- 将本地 Agent 生命周期、MCP HTTP 服务和外部 CLI 调用迁到 Rust command 或原生 sidecar。
- 继续使用可配置的远程 AI 代理；密钥不进入 Renderer。
- 清除生产路径对 Electron `run-as-node` 和系统 Node.js 的依赖。

退出门槛：未安装 Node.js 的干净机器也能使用正式支持的 AI/Agent 能力。

### 4. 导出、更新与系统集成

- 迁移 PDF、剪贴板、菜单、快捷键、窗口、更新检查和安装。
- 分别验证 WKWebView 与 WebView2 的排版、输入法和打印差异。
- 建立 macOS 签名/公证与 Windows 代码签名流程。

退出门槛：签名安装包、更新和回滚在两端实机通过。

### 5. 默认切换与清理

- 先向小范围用户提供 Tauri 版本，再逐步设为默认下载。
- 至少保留一个稳定发布周期的 Electron 回滚包和数据恢复说明。
- 确认崩溃率、数据完整性和核心功能达标后，再删除 Electron 专用代码。

## 验收与回滚原则

- 一项能力只有在真实应用里跑通，才算迁移完成；仅编译通过不算。
- 每个阶段都记录包体、冷启动、空闲内存和关键操作耗时，使用同一台机器与同一份样本比较。
- 数据迁移必须先备份或复制，校验通过后才切换；失败时原数据保持不变。
- 新壳出现阻断问题时继续发布 Electron，不让迁移影响现有用户。

## 首轮验证清单

1. `pnpm dev` 仍能打开网页版，未出现桌面专属 API 报错。
2. `pnpm electron:dev` 和 Electron 构建路径不受 Tauri 配置影响。
3. Tauri 预览窗口能加载现有 React 界面并返回真实运行时、平台与版本。
4. Tauri 预览版在没有系统 Node.js 的用户环境中可以启动。
5. Tauri 与 Electron 使用不同的应用标识和数据目录，不会同时写同一数据库。
6. 打开工作区、保存 Markdown、重命名和删除文件的成功、取消、失败路径都不丢数据。
7. 粘贴或拖入图片后，本地媒体能显示，磁盘引用仍是可移植的相对路径。
8. 中文输入法、BlockNote 编辑、快捷键和剪贴板在 WKWebView/WebView2 中表现正常。
9. SQLite/FTS、AI/Agent、MCP 和 PDF 在未安装 Node.js 的干净机器上通过真实流程。
10. macOS 签名/公证、Windows 签名安装与更新回滚都经过实机验证。

## 当前步骤

阶段 0 已完成；现在进入阶段 1 的只读预演。Electron 继续作为正式版，Tauri 只读取用户明确选择的文本目录，不自动访问旧数据库，也不写任何工作区文件。下一步是在独立测试目录上补齐刷新和受控写入，再考虑媒体协议与目录监听。
