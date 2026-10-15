# md-render 桌面版发布流程

正式桌面包使用 Tauri 2。推送 `v*` tag 后，`.github/workflows/release.yml` 会构建并发布 macOS Universal DMG 和 Windows x64 Inno Setup；签名凭证齐全时同时完成签名与公证，否则仍发布并在安装说明中提示系统拦截风险。Electron 只保留手动回退包，不进入正式 Release。

脚本路径：`scripts/release-tag.sh`

npm 命令：`pnpm release:tag`

## 1. 发布约定

| 项 | 规则 |
|---|---|
| 版本号 | 根目录和 `apps/editor/package.json` 必须一致 |
| Tag | `v` + 版本号，如 `v1.0.21`；使用 annotated tag |
| 发布提交 | tag 指向的 commit 必须已经进入 `origin/main` |
| macOS | `MD-Render-<version>.dmg`，同时支持 Apple Silicon 和 Intel |
| Windows | `MD-Render-Setup-<version>.exe`，使用 Inno Setup 安装到 `Program Files` |
| 更新方式 | 当前从 Releases 手动下载安装；尚未接入 Tauri updater |

## 2. 仓库一次性配置

签名是可选增强。某个平台的 secrets 全部齐全时，该平台走签名和校验路径；任一项缺失时，该平台改为发布未签名包。签名状态不写入文件名，系统拦截处理固定写在 Release 安装说明中。

| 名称 | 用途 |
|---|---|
| `APPLE_CERTIFICATE` | Base64 编码的 Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` 密码 |
| `APPLE_SIGNING_IDENTITY` | Developer ID Application 证书 identity |
| `APPLE_ID` | Apple 开发者账号 |
| `APPLE_PASSWORD` | Apple app-specific password |
| `APPLE_TEAM_ID` | Apple Team ID |
| `KEYCHAIN_PASSWORD` | CI 临时 keychain 密码 |
| `WINDOWS_CERTIFICATE` | Base64 编码的 Windows 代码签名 `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | `.pfx` 密码 |

可选仓库变量 `AI_PROXY_BASE` 用来写入默认 AI 代理地址。配置时必须是 HTTPS；留空仍可发布，但用户需要在应用里手动填写代理地址。

## 3. 发布前检查

1. 把准备发布的改动合并到 `main`，并确认本地 `main` 与 `origin/main` 一致。
2. 更新 [CHANGELOG](../CHANGELOG.md)，把升级步骤和已知边界写清楚。
3. 运行与改动相符的构建或功能验证。桌面壳改动至少验证 Tauri 构建；不要用 Electron 构建代替。
4. 确认根目录和 editor 的版本号一致。
5. 扫描待发布内容：

```bash
bash .agents/skills/pre-commit-secrets/scripts/scan-secrets.sh --working
```

6. 先预览版本和 tag：

```bash
pnpm release:tag -- --dry-run
```

## 4. 创建并推送 tag

默认命令会自动 patch bump，同时修改根目录和 `apps/editor/package.json`，提交 `chore: bump version to x.y.z`，再创建并推送 annotated tag：

```bash
pnpm release:tag
```

常用参数：

| 命令 | 作用 |
|---|---|
| `pnpm release:tag -- --minor` / `--major` | 指定 bump 类型 |
| `pnpm release:tag -- --no-bump` | 使用 package.json 现有版本 |
| `pnpm release:tag -- --no-commit` | bump 后停下，由人手动提交 |
| `pnpm release:tag -- --no-push` | 只在本地创建 tag |
| `pnpm release:tag -- --message "说明"` | 自定义 tag 说明 |

脚本可以在任意分支执行，但正式工作流只接受位于 `origin/main` 历史上的 tag。不要在功能分支直接发正式 tag。

## 5. CI 会做什么

发布工作流按以下顺序执行：

1. 校验根目录版本、editor 版本和 tag 版本完全一致，并确认发布 commit 属于 `origin/main`。
2. 校验可选 `AI_PROXY_BASE` 使用 HTTPS。
3. macOS 始终构建 Universal app / DMG 并检查 app 签名结构、DMG 完整性和双架构；secrets 齐全时执行 Developer ID 签名、公证、stapling 和 Gatekeeper 校验，否则使用 ad-hoc 签名。
4. Windows 始终构建 Tauri exe 和 Inno 安装包，并完成安装、启动、卸载冒烟检查；PFX secrets 齐全时额外验证应用、安装包、安装后应用和卸载器签名。
5. 生成两端 SHA-256 校验文件，全部成功后才创建 GitHub Release。

任何平台的构建或必做检查失败，都不会创建只含单平台文件的 Release。未签名不再视为构建失败，但 Release 必须保留 macOS Gatekeeper 和 Windows SmartScreen 的处理说明。

## 6. Release 说明与升级文档

Release 固定保留“下载 / macOS 安装 / Windows 安装”三段和网页版入口，版本差异由 GitHub 自动追加到 `What's Changed`。不要为每个版本重写整篇 Release 说明。

第一次从 Electron 版迁移的长期说明维护在 README，包含：

1. 完全退出旧 Electron 版。
2. 手动安装 Tauri 新版。已有 Tauri 预览数据会沿用，不需要重复导入。
3. 需要恢复 Electron 数据时，在 **设置 → Electron 数据交接** 选择旧 `knowledge.db`。导入不是合并：当前 Tauri 数据库会先备份，再由 Electron 数据替换；Electron 源库保持不变。
4. 两边都有新内容时，先导出 Tauri JSON 备份并另存重要文稿。
5. 重新选择本地工作区，恢复写入授权。

Electron 旧库通常在 macOS 的 `~/Library/Application Support/md-render/knowledge.db` 或 Windows 的 `%APPDATA%\md-render\knowledge.db`；找不到时再检查同级 `@md-render/editor` 和 `MD Render` 目录。

旧 Electron updater 无法跨框架完成首次安装。当前 Inno 安装包也没有接入 Tauri updater，所以后续版本暂时继续从 Releases 手动安装。PDF、本机 Agent、本机 MCP、“数据文件化”和自定义 skill 编辑等边界继续维护在 README 和 CHANGELOG，不每版复制到 Release 正文。

## 7. Electron 回退

`.github/workflows/ci.yml` 可从 Actions 手动构建 macOS / Windows Electron 回退包，保留 7 天。它只用于首个稳定发布周期内排障和回滚：

- 不跟随 `v*` tag 自动运行。
- 不上传到正式 GitHub Release。
- 不与 Tauri 同时打开并写同一份业务数据。
- 稳定周期结束、数据迁移确认后，再单独决定是否删除 Electron 代码和工作流。

网页版仍由 `.github/workflows/deploy-pages.yml` 在 `main` 更新时独立部署，与桌面 tag 无关。
