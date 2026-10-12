# md-render 版本发布流程

> 日常发版用固定脚本，避免手工打 tag 时版本号不一致或漏推远程。
>
> 脚本路径：`scripts/release-tag.sh`  
> npm 命令：`pnpm release:tag`

---

## 1. 约定

| 项 | 规则 |
|----|------|
| 版本号来源 | 根目录 `package.json` 的 `version` 字段 |
| Tag 格式 | `v` + 版本号，如 `v1.0.5` |
| Tag 类型 | annotated tag（带说明，可追溯变更摘要） |
| 变更摘要 | 默认取「上个 tag → HEAD」之间的 commit subject 列表 |

---

## 2. 标准步骤

1. **版本号**：默认自动 patch bump 并提交 `chore: bump version to x.y.z`（同时改根目录和 `apps/editor/package.json`）；要 minor / major 加 `--minor` / `--major`。也可以先手动改好并提交，脚本发现版本已超前就不再 bump。
2. **预览**（可选）：

```bash
pnpm release:tag -- --dry-run
```

3. **打 tag 并推送**（当前分支和 tag 一起推，推完会核对远端 tag 是否存在）：

```bash
pnpm release:tag
```

等价于：

```bash
bash scripts/release-tag.sh
```

---

## 3. 脚本参数

| 命令 | 作用 |
|------|------|
| `pnpm release:tag` | bump + 提交 + 创建 tag，并把当前分支和 tag 一起推到 `origin` |
| `pnpm release:tag -- --minor` / `--major` | 指定 bump 类型 |
| `pnpm release:tag -- --no-bump` | 不 bump，直接用 package.json 现有版本 |
| `pnpm release:tag -- --no-commit` | bump 后不自动提交（脚本会停下，需手动提交后重跑） |
| `pnpm release:tag -- --no-push` | 仅本地创建 tag，不推分支和 tag |
| `pnpm release:tag -- --dry-run` | 预览 tag 名与说明，不写入 |
| `pnpm release:tag -- --message "说明"` | 使用自定义 tag 说明 |

---

## 4. 发布前检查

- 工作区尽量干净；有未提交改动时脚本会警告，tag 仍指向当前 HEAD。
- 本地或远程已存在同名 tag 时会直接失败，避免覆盖。
- `package.json` 版本不能低于或等于最新 tag，需先 bump 版本号。
- **客户端发版只认 tag**：Release 只在推 `v*` tag 时触发，只 `git push` 分支不会出安装包。没触发时先看远端有没有这个 tag：`git ls-remote --tags origin`。网页版（Pages）不走 tag，每次推 `main` 自动部署。
- 推送前如需扫敏感信息：

```bash
bash .agents/skills/pre-commit-secrets/scripts/scan-secrets.sh --working
```

---

## 5. 完整示例

```bash
# 1. 预览（看会 bump 到哪个版本、tag 说明是什么）
pnpm release:tag -- --dry-run

# 2. 发版：自动 bump + 提交 + 打 tag + 推分支和 tag
pnpm release:tag
```
