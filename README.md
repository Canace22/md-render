# Markdown 渲染器

一个简单、轻量级的 Markdown 渲染器，使用原生 JavaScript 实现，无需任何依赖。

## 功能特性

- ✅ 标题（H1-H6）
- ✅ 段落
- ✅ 无序列表和有序列表
- ✅ 嵌套列表
- ✅ 代码块（集成 highlight.js 语法高亮，支持一键复制）
- ✅ 行内代码
- ✅ 链接
- ✅ 粗体和斜体文本
- ✅ 引用块
- ✅ 水平分割线
- ✅ 实时预览

## 使用方法

1. 直接在浏览器中打开 `index.html` 文件
2. 在左侧输入框中输入 Markdown 文本
3. 右侧会实时显示渲染结果

## 项目结构

```
md-render/
├── index.html      # 主页面
├── parser.js       # Markdown 解析器
├── renderer.js     # HTML 渲染器
├── app.js          # 应用主逻辑
└── styles.css      # 样式文件
```

## 支持的 Markdown 语法

- `# 标题` - 标题
- `**粗体**` - 粗体文本
- `*斜体*` - 斜体文本
- `` `代码` `` - 行内代码
- ````代码块```` - 代码块（支持语言标记进行语法高亮，如 ` ```javascript `）
- `[链接](url)` - 链接
- `> 引用` - 引用块
- `- 列表项` - 无序列表
- `1. 列表项` - 有序列表
- 嵌套列表：使用缩进（2个或更多空格）创建嵌套列表
  ```markdown
  - 一级列表
    - 二级嵌套列表
      - 三级嵌套列表
    1. 二级有序列表
    2. 另一个有序项
  ```
- `---` - 水平分割线

## 技术实现

- 纯 JavaScript，核心功能无依赖
- 集成 highlight.js 提供代码语法高亮（通过 CDN 引入）
- 模块化设计，易于扩展
- 暗黑主题，护眼舒适

## 实现原理

详细的实现原理、架构设计和执行流程，请参阅 [ARCHITECTURE.md](./ARCHITECTURE.md)。


## 变更记录

- 代码块复制（最新）：
  - ✅ 每个代码块右上角提供复制按钮
  - ✅ 使用 Clipboard API，降级到 `execCommand('copy')`
  - ✅ 成功后显示“已复制”反馈
- 代码语法高亮：
  - ✅ 集成 highlight.js，自动为代码块提供语法高亮
  - ✅ 使用 github-dark-dimmed 主题，适配暗黑界面
  - ✅ 支持所有 highlight.js 支持的语言
  - ✅ 代码块渲染后自动触发高亮处理
- 嵌套列表支持：
  - ✅ 支持多层嵌套列表（通过缩进识别层级）
  - ✅ 支持混合有序和无序列表（可在同一文档中混合使用）
  - ✅ 递归解析和渲染，支持任意深度的嵌套
- UI 与间距调整：
  - 空行渲染为 `<br>`，提供适当的段落分隔
  - 段落、列表、代码块、引用块的上下外边距调整为 `0.8em`，提供舒适的阅读间距
  - 分割线的上下外边距调整为 `1em`
  - 标题上下边距重新校准，确保层次分明
  - 代码块新增语言头部（接近 VS Code 预览），结构为 `figure.code-block > .code-header + pre`
  - 引用块采用浅色背景与浅蓝边框以增强可读性
  - 预览区域默认全宽显示，如需居中版心可在 `#markdown-output` 添加 `max-width` 与 `margin: 0 auto`
  - 详见"实现原理"中的"空白与间距策略"和"嵌套列表实现"


## 部署到 GitHub Pages

本项目为纯静态站点（`index.html` + JS/CSS），可通过 GitHub Actions 自动部署到 GitHub Pages。

### 一次性配置

1. 在 GitHub 仓库中打开 Settings → Pages。
2. 将 Source 设置为 “GitHub Actions”。
3. 确认仓库分支为 `main`（或根据你使用的默认分支调整）。

### 自动部署

- 已内置工作流：`.github/workflows/deploy-pages.yml`
- 当你向 `main` 分支 `push` 时，会自动构建并部署到 GitHub Pages。
- 也可在 Actions 页签中手动运行（Workflow Dispatch）。

### 访问地址

- 成功部署后，页面将通过环境链接暴露；一般为：
  - 个人主页：`https://<username>.github.io/`
  - 项目页：`https://<username>.github.io/<repo>/`

### 自定义与常见问题

- 若你的静态文件不在仓库根目录，请修改工作流中的 `actions/upload-pages-artifact@v3` 的 `path`。
- 工作流已设置必要权限：`pages: write` 与 `id-token: write`。
- 若仓库默认分支不是 `main`，请同步修改工作流触发分支。
