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

1. **确认版本号**：在根 `package.json` 里改好 `version`（patch / minor 按变更规模定，沿用现有 `v1.0.x` 习惯即可）。
2. **提交版本变更**（如有）：

```bash
git add package.json
git commit -m "chore: bump version to x.y.z"
```

3. **预览**（可选）：

```bash
pnpm release:tag -- --dry-run
```

4. **打 tag 并推送**：

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
| `pnpm release:tag` | 创建 tag 并推送到 `origin` |
| `pnpm release:tag -- --no-push` | 仅本地创建 tag |
| `pnpm release:tag -- --dry-run` | 预览 tag 名与说明，不写入 |
| `pnpm release:tag -- --message "说明"` | 使用自定义 tag 说明 |

---

## 4. 发布前检查

- 工作区尽量干净；有未提交改动时脚本会警告，tag 仍指向当前 HEAD。
- 本地或远程已存在同名 tag 时会直接失败，避免覆盖。
- `package.json` 版本不能低于或等于最新 tag，需先 bump 版本号。
- 推送前如需扫敏感信息：

```bash
bash .agents/skills/pre-commit-secrets/scripts/scan-secrets.sh --working
```

---

## 5. 完整示例

```bash
# 1. 改 package.json version → 1.0.6
# 2. 提交
git add package.json
git commit -m "chore: bump version to 1.0.6"

# 3. 预览
pnpm release:tag -- --dry-run

# 4. 发版
pnpm release:tag
```
