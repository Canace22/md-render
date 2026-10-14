# 桌面发布支持无签名降级

## 背景

Tauri 正式发布工作流原本强制要求 macOS Developer ID / 公证凭证和 Windows Authenticode PFX。仓库没有配置这些 secrets 时，两个平台都会在构建前失败，GitHub Release 不会创建。

## 改动

- 发布前检测每个平台的签名 secrets 是否齐全。
- 凭证齐全时保留原有签名、公证、stapling 和签名校验。
- 凭证缺失时继续构建，macOS 使用 ad-hoc 签名，并跳过只有受信任签名包才能通过的公证与系统信任校验。
- 未签名产物在文件名中增加 `-unsigned`，Release 说明中同步提示 macOS Gatekeeper 和 Windows SmartScreen 风险。
- 两种路径都保留产物完整性、macOS 双架构、Windows 安装 / 启动 / 卸载冒烟检查和 SHA-256 生成。

## 发布影响

`v1.0.22` 引用的是修改前的工作流，重跑仍会因缺少 secrets 失败。本改动合并到 `main` 后，需要创建新 tag 触发新工作流。

## 验证边界

本地可检查 workflow YAML、Shell / PowerShell 分支和文档一致性。GitHub 托管的 macOS Universal 和 Windows Inno 实际产物，必须以新 tag 触发的 Actions 结果为准。

| # | 场景 | 预期 |
|---|---|---|
| 1 | macOS secrets 全部缺失 | 警告后用 ad-hoc 签名构建，产物带 `-unsigned` |
| 2 | macOS secrets 只配了一部分 | 不导入不完整证书，降级到 ad-hoc 路径 |
| 3 | macOS secrets 全部齐全 | 导入证书，执行正式签名、公证、stapling 和 Gatekeeper 校验 |
| 4 | macOS 主程序不是 Universal | 双架构检查失败，不发布 |
| 5 | macOS DMG 损坏 | `hdiutil verify` 失败，不上传产物 |
| 6 | Windows secrets 全部缺失 | 不导入证书，生成带 `-unsigned` 的 Inno 安装包 |
| 7 | Windows secrets 只配了一项 | 不尝试使用不完整凭证，降级到未签名路径 |
| 8 | Windows secrets 两项齐全 | 导入 PFX，签名并验证 exe、安装包、安装后应用和卸载器 |
| 9 | Windows 未签名包 | 仍完成静默安装、启动和卸载冒烟检查 |
| 10 | 任一平台构建或必做检查失败 | GitHub Release 不创建；两端都通过时才发布并带 SHA-256 |
