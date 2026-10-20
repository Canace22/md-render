# Electron 恢复为正式桌面壳

## 结果

- `main` 恢复为 Electron 正式桌面端，Tauri 源码、依赖、脚本和发布配置不再混在主线。
- Tauri 的完整现状保留在本地分支 `codex/tauri-experiment`，后续实验从该分支继续。
- 正式 Release 只接受 `main` 上的 `v*` tag，同时构建 macOS Universal 和 Windows x64 Electron 安装包。
- Electron 沿用 `com.mdrender.app` 应用标识，原 Electron 用户的数据目录和工作区授权不变。

## 实现原则

这次不做运行时双壳开关。Git 分支就是隔离边界：正式分支只承担 Electron 的开发、打包和发版，实验分支自行承担 Tauri 迁移验证。这样正式用户不会再遇到 Tauri 文件夹授权流程，实验代码也没有丢失。

发布链保留 Electron 更新需要的 `.zip`、`.blockmap`、`latest-mac.yml` 和 `latest.yml`。macOS 当前没有代码签名，因此应用内只提示新版本并跳转 Release 手动下载；Windows 未签名安装包仍可能触发 SmartScreen。

## 主要改动

- 从 `main` 移除 `apps/editor/src-tauri/`、Tauri renderer bridge、迁移文档和相关依赖。
- 恢复 Electron main / preload / renderer IPC 链路及 Electron 打包脚本。
- 重建 `release.yml`：校验 tag、版本号和 `origin/main` 归属，产出双平台安装包、更新元数据和 SHA-256 校验文件。
- `release-tag.sh` 拒绝从非 `main` 分支直接推正式 tag。
- 对外产物名固定为 `MD-Render-<version>.dmg`、`MD-Render-<version>-mac.zip` 和 `MD-Render-Setup-<version>.exe`。

## 数据边界

- 旧 Electron 正式版升级：继续读取原 Electron 数据目录，不需要迁移。
- Tauri 实验版：数据仍留在 Tauri 自己的数据目录或用户选定目录，不自动合并回 Electron。
- 本地项目中的普通 `.md` 文件不绑定桌面壳，可由用户在任一版本重新选择目录打开。

## 验证清单

| # | 场景 | 预期 |
|---|---|---|
| 1 | 查看 `main` 文件树 | 不存在 `apps/editor/src-tauri/` |
| 2 | 查看实验分支 | `codex/tauri-experiment` 指向隔离前完整 Tauri 提交 |
| 3 | 搜索主线 Tauri 入口 | 正式源码、脚本、workflow 无 Tauri 运行入口 |
| 4 | 运行 Electron 构建 | renderer、main、preload 均编译成功 |
| 5 | 构建 macOS Universal app | Electron 与原生 `.node` 同时含 x86_64、arm64 |
| 6 | 检查 macOS 产物 | 有固定名称 DMG、zip、blockmap，且 zip 与 `latest-mac.yml` URL 一致 |
| 7 | 检查 Windows workflow | 产出固定名称 exe、blockmap、`latest.yml` |
| 8 | 从实验分支运行正式发版脚本 | 默认拒绝推送正式 tag |
| 9 | tag 不属于 `origin/main` | Release 校验任务失败，不发布安装包 |
| 10 | 检查工作区 | 不残留 Vite/Vitest timestamp 临时文件 |

Windows 打包和 GitHub Release 聚合仍需在 Actions 手动 CI 中验证；本地 macOS 构建不能替代目标平台 CI。
