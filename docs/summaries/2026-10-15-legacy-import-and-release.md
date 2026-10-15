# 旧数据导入与发布输出修复

日期：2026-10-15

## 结果

- Tauri 客户端导入旧 Electron 数据库时，以 `workspace_json` 中仍有效的节点为准；历史遗留的孤儿索引和 Electron 写入的 SQLite `REAL` 时间戳都不会再阻断导入。
- GitHub Release 固定保留下载、macOS 安装、Windows 安装和网页版入口；版本差异只由 GitHub 自动生成 `What's Changed`。
- Release 公开产物改为 `MD-Render-<version>.dmg`、`MD-Render-<version>.app.zip` 和 `MD-Render-Setup-<version>.exe`，不再把 `-unsigned` 写进文件名。

## 根因与修复

真实旧库的 `workspace_json` 只有 29 个有效节点，但 `documents` 留有 5115 条历史索引。旧导入器先全量复制，再要求两者完全相等，因此必然失败。v1.0.26 已解决这层问题，但继续复制有效节点时又暴露出第二个兼容问题：Electron 直接把文件的 `mtimeMs` 写入 SQLite，带小数的毫秒值会以 `REAL` 保存，而导入器此前只接受 `INTEGER`。

现在的导入规则是：

1. 源库必须包含工作区引用的全部文档；缺失任何有效文档仍拒绝导入。
2. 只复制工作区中的文档、两端都有效的双链，以及这些文档的历史版本。
3. 文档和历史版本的时间戳同时接受 SQLite `INTEGER`、`REAL` 和 `NULL`；有限且范围合法的 `REAL` 会截成整数毫秒，文本、二进制或越界值仍拒绝导入。
4. `workspace_json` 中的浮点 `createdAt` / `updatedAt` 使用同一转换规则，避免导入后首次保存又把时间写成 `NULL`。
5. 候选库仍要求工作区节点与文档索引完全一致，并继续校验记录数、FTS 和 `quick_check`。
6. 旧库拒绝非空 WAL / journal 后以 immutable 只读方式打开，导入前后复核文件未变化。
7. Tauri 自有 WAL 库用不带 `CREATE` 的读写连接打开后立即设为 `query_only`，避免缺少 WAL 边车文件时只读连接打不开。
8. 切换前失败会清理候选库和未使用的备份；切换失败时优先保留可恢复备份。

按本机真实旧库过滤后，应迁移 29 个文档、0 条有效双链和 25 条有效历史版本；5086 条孤儿索引不会进入新库。

## 发布约定

- Release 正文不再每版重写迁移说明和功能边界。
- `softprops/action-gh-release` 继续使用 `generate_release_notes: true`，由 GitHub 在固定正文后追加 `What's Changed` 和完整对比链接。
- 签名检测、签名校验、DMG / Windows 安装冒烟和 SHA-256 生成逻辑保持不变；签名状态不再影响公开文件名。
- 长期升级说明与能力边界继续维护在 README、CHANGELOG 和发布流程文档中。

## 验证证据

- `cargo fmt --manifest-path apps/editor/src-tauri/Cargo.toml -- --check` 通过。
- `cargo check --manifest-path apps/editor/src-tauri/Cargo.toml` 通过。
- 针对 SQLite `REAL` 时间戳的完整旧库导入回归通过：`documents.created_at`、`documents.updated_at`、`versions.created_at` 均转为整数毫秒，`workspace_json` 的浮点时间也能正常生成文档索引。
- `.github/workflows/release.yml` 通过 Ruby YAML 解析。
- `git diff --check` 通过。
- 已将本机真实旧库完整导入临时数据库：29 个文档、0 条有效双链、25 条有效历史版本，FTS 为 29，`quick_check` 为 `ok`。
- 真实旧库导入前后 SHA-256 都是 `017aa6b51d27dd58a715786d8204a5ee3ec5b75d3a7e9b2692a112591a615ffd`，源文件没有变化。
- v1.0.26 安装包仍会触发 `Invalid column type Real`；修复需要新的 tag 和安装包，正式 macOS 包内验收仍待新流水线完成。

## 验收用例

| # | 场景 | 预期 |
|---|---|---|
| 1 | 旧库含工作区外的历史 `documents` | 导入成功，孤儿索引不进入候选库 |
| 2 | 文档或历史版本时间戳为 SQLite `INTEGER` | 原值保留 |
| 3 | 文档或历史版本时间戳为有限、范围合法的 SQLite `REAL` | 截成整数毫秒后导入 |
| 4 | 时间戳为 `NULL` | 继续保持 `NULL` |
| 5 | 时间戳为文本、二进制、非有限值或越界值 | 明确失败，当前 Tauri 库不切换 |
| 6 | `workspace_json` 的 `createdAt` / `updatedAt` 为小数 | 保存索引时转为整数毫秒，不写成 `NULL` |
| 7 | 工作区引用缺失文档 | 导入失败，当前 Tauri 库不切换 |
| 8 | 源库存在非空 WAL / journal | 明确提示先退出 Electron，不导入可能落后的主库 |
| 9 | 候选库记录数、FTS 或完整性不一致 | 切换前失败并清理临时库 |
| 10 | 新 tag 创建 GitHub Release | 固定说明不变，只追加当版 `What's Changed`，包名保持简洁 |
