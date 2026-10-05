# README 按「第一次来的人」重写

日期：2026-10-05

## 背景

用新装的 `human-readable-docs` skill 审了一遍 README，问题集中在三点：

- 开头讲的是技术栈和内部模块（`packages/markdown-core`、`apps/editor`），读者读完前一屏还不知道怎么装、怎么用。
- 三个新人必踩的坑都没写：安装包未签名打不开；AI 助手不接 `ai-proxy` 就不回复；网页版内容只存在浏览器里。
- 开发、发版、部署、变更记录、路线图和用户内容混在一起，334 行里用户真正要看的不到三分之一。

另外，README 和 `docs/产品功能说明.md` 都还写着桌面版有「版本历史」，但界面里已经没有入口（同步和历史已交给本地项目目录 + Git）。

## 改动

| 文件 | 做法 |
|------|------|
| `README.md`（中文，默认）/ `README.en.md` | 重写为：一句话定位 → 开始使用（桌面版 / 网页版 / 接 AI）→ 能做什么 → 常用操作 → 参与开发。两版结构一致；中文版作为默认 `README.md`，英文版移到 `README.en.md` |
| `docs/development.md`（新） | 承接原 README 的开发、构建、测试、项目结构（按现状更新）、技术栈、Markdown 支持范围、公众号转换细节、发版、Pages 部署、文档索引 |
| `CHANGELOG.md`（新） | 承接原「变更记录」；新增「未发布」段，把 v1.0.11 之后移除 Notion / 云端同步写成升级提醒（改了什么、为什么、怎么办） |
| `docs/产品功能说明.md` | 删掉过时的「版本历史 ✅」一行 |
| `server/ai-proxy/README.md` | 部署链接指向已删除的 `notion-proxy`，改为指向 `server/README.md` |

## 已知限制

- Releases 最新安装包是 v1.0.11，`v1.0.12` tag 没有对应 release；main 上 AI 编辑部、MCP 等功能还没进安装包。README 用一句话提示「安装包会比 main 稍旧」，没写死版本号，避免过时。
- `docs/development.md` 只有中文；英文 README 里的链接注明了 (Chinese)。
- 仓库根目录还没有 `PRODUCT.md`（产品意图文档），这次的取舍以 `docs/产品功能说明.md` 为准。

## 验证

- 所有相对链接逐个检查文件存在。
- 关键事实对照代码确认：dev 端口 3000（`vite.config.js`）、桌面版默认 AI 地址 `http://localhost:8788`（`main/main.js`）、AI 面板字段名「AI 代理地址」、服务端只内置 MiniMax / DeepSeek 的 Key、`start-ai-proxy.sh` 没有执行权限（所以 README 用 `node server/ai-proxy/server.js`）、推 `v*` tag 触发 `release.yml`。
