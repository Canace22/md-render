# 旧数据导入与发布输出修复

日期：2026-10-15

## 结果

- Tauri 客户端导入旧 Electron 数据库时，以 `workspace_json` 中仍有效的节点为准，不再被历史遗留的孤儿索引阻断。
- GitHub Release 固定保留下载、macOS 安装、Windows 安装和网页版入口；版本差异只由 GitHub 自动生成 `What's Changed`。
- Release 公开产物改为 `MD-Render-<version>.dmg`、`MD-Render-<version>.app.zip` 和 `MD-Render-Setup-<version>.exe`，不再把 `-unsigned` 写进文件名。

## 根因与修复

真实旧库的 `workspace_json` 只有 29 个有效节点，但 `documents` 留有 5115 条历史索引。旧导入器先全量复制，再要求两者完全相等，因此必然失败。

现在的导入规则是：

1. 源库必须包含工作区引用的全部文档；缺失任何有效文档仍拒绝导入。
2. 只复制工作区中的文档、两端都有效的双链，以及这些文档的历史版本。
3. 候选库仍要求工作区节点与文档索引完全一致，并继续校验记录数、FTS 和 `quick_check`。
4. 旧库拒绝非空 WAL / journal 后以 immutable 只读方式打开，导入前后复核文件未变化。
5. Tauri 自有 WAL 库用不带 `CREATE` 的读写连接打开后立即设为 `query_only`，避免缺少 WAL 边车文件时只读连接打不开。
6. 切换前失败会清理候选库和未使用的备份；切换失败时优先保留可恢复备份。

按本机真实旧库过滤后，应迁移 29 个文档、0 条有效双链和 25 条有效历史版本；5086 条孤儿索引不会进入新库。

## 发布约定

- Release 正文不再每版重写迁移说明和功能边界。
- `softprops/action-gh-release` 继续使用 `generate_release_notes: true`，由 GitHub 在固定正文后追加 `What's Changed` 和完整对比链接。
- 签名检测、签名校验、DMG / Windows 安装冒烟和 SHA-256 生成逻辑保持不变；签名状态不再影响公开文件名。
- 长期升级说明与能力边界继续维护在 README、CHANGELOG 和发布流程文档中。

## 验证证据

- `cargo fmt --manifest-path apps/editor/src-tauri/Cargo.toml -- --check` 通过。
- `cargo check --manifest-path apps/editor/src-tauri/Cargo.toml` 通过。
- `.github/workflows/release.yml` 通过 Ruby YAML 解析。
- `git diff --check` 通过。
- 已用只读查询确认真实旧库的有效/孤儿数据分布；没有改动源数据库。
- 尚未创建新 tag，因此新的 GitHub Release 页面、双平台正式产物名称和安装包内实际导入仍需下一次 tag 流水线验收。

## 验收用例

| # | 场景 | 预期 |
|---|---|---|
| 1 | 旧库含工作区外的历史 `documents` | 导入成功，孤儿索引不进入候选库 |
| 2 | 旧库工作区节点都能找到对应文档 | 有效文档完整保留 |
| 3 | 工作区引用缺失文档 | 导入失败，当前 Tauri 库不切换 |
| 4 | `links` 任一端不属于工作区 | 该双链被忽略；两端有效的双链保留 |
| 5 | `versions.document_id` 不属于工作区 | 该历史版本被忽略；有效历史保留 |
| 6 | 源库存在非空 WAL / journal | 明确提示先退出 Electron，不导入可能落后的主库 |
| 7 | 源库只有零字节 WAL 或孤立 SHM | 不因边车文件存在而误拒 |
| 8 | 候选库记录数、FTS 或完整性不一致 | 切换前失败并清理临时库 |
| 9 | 新 tag 创建 GitHub Release | 固定说明不变，只追加当版 `What's Changed` |
| 10 | 有签名或无签名两种流水线路径 | 公开文件名相同且简洁，签名/安装校验逻辑不变 |
