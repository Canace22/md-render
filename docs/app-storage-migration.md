# 桌面 App 与本地数据库迁移方案

## 目标

把当前纯浏览器 Markdown 写作工具迁移成一个本地桌面 App，同时保留现有 React/Vite UI 和写作体验。

第一阶段只解决三件事：

- 应用可以作为桌面 App 启动。
- 项目数据从 `localStorage` 迁到本地 SQLite。
- 现有工作区、文件切换、Markdown 导入导出不大改。

不在第一阶段做：

- 多端同步。
- 协作编辑。
- 历史版本系统。
- 全文搜索高级排序。
- 重做编辑器 UI 或工作区交互。

## 技术选择

### App 壳

优先使用 Electron。

理由：

- 当前项目已经是 React + Vite + JavaScript，Electron 接入成本最低。
- 主进程可以直接管理 SQLite、文件系统和后续系统菜单。
- 不需要为第一阶段引入 Rust 或额外跨语言构建复杂度。

Tauri 可以作为后续选项，但不建议第一阶段使用。

### 数据库

桌面版本使用 SQLite。

理由：

- 适合本地 App 的单用户数据。
- 文件可备份、可迁移。
- 后续可以加 FTS 全文搜索。
- 数据写入不再受浏览器 `localStorage` 容量和同步序列化限制。

### UI 状态

继续使用 `src/store/useEditorStore.js` 作为唯一全局状态入口。

组件不直接访问 SQLite。数据库读写通过 service/IPC 封装，store 调用这些接口完成 hydrate 和持久化。

## 架构边界

### Renderer 层

保留现有 React 页面。

职责：

- 展示工作区。
- 编辑 Markdown。
- 触发新建、删除、重命名、保存、导入导出。
- 继续从 `useEditorStore.js` 读取状态。

Renderer 不做：

- 直接打开 SQLite。
- 直接访问 Node 文件系统。
- 拼 SQL。

### Preload 层

暴露最小 API 给 Renderer。

建议 API：

```javascript
window.mdRenderApp = {
  workspace: {
    load: () => {},
    saveTree: (workspace) => {},
    saveFileContent: (fileId, content) => {},
    importLegacyWorkspace: (workspace) => {},
  },
  settings: {
    get: (key) => {},
    set: (key, value) => {},
  },
};
```

### Main 层

负责：

- 创建窗口。
- 初始化数据库。
- 注册 IPC handler。
- 处理数据库读写。
- 管理用户数据目录。

### Store 层

`useEditorStore.js` 仍然负责：

- 当前工作区树。
- 当前选中文件。
- 当前编辑内容。
- 主题、模式、面板状态等 UI 状态。

后续改造原则：

- hydrate 时从 App storage service 读取。
- 保存时调用 App storage service。
- Web 版本可以保留旧 `localStorage` fallback。

## 数据模型草案

第一阶段不把模型拆得太细，避免过度设计。

### workspaces

保存工作区元信息。

字段：

- `id`
- `name`
- `created_at`
- `updated_at`

### workspace_tree

保存文件树结构，不保存正文大文本。

字段：

- `workspace_id`
- `tree_json`
- `updated_at`

`tree_json` 的节点结构继续兼容当前 workspace，只是文件节点里的 `content` 可以逐步移除或保持为空。

### files

保存文件正文。

字段：

- `id`
- `workspace_id`
- `name`
- `content`
- `created_at`
- `updated_at`

### settings

保存偏好设置。

字段：

- `key`
- `value_json`
- `updated_at`

适合保存：

- theme
- copyStyle
- mode
- surface
- notionFilePages

Notion token 这类敏感字段后续应考虑系统 keychain，第一阶段可以先保持原有行为或单独延后。

## 迁移步骤

### 第 1 步：加 Electron 外壳

新增最小 Electron 目录：

- `electron/main.js`
- `electron/preload.js`

保留现有 `npm run dev` 给 Web 开发使用，新增桌面启动脚本。

第一步只要求能打开当前 Vite 页面，不接数据库。

### 第 2 步：加 SQLite service

新增主进程侧 storage service。

建议文件：

- `electron/storage/db.js`
- `electron/storage/workspaceRepository.js`
- `electron/storage/settingsRepository.js`

这个阶段先实现：

- 初始化数据库。
- 创建表。
- 读取默认 workspace。
- 保存 workspace tree。
- 保存单个文件内容。

### 第 3 步：接 IPC

在 preload 暴露最小 API，在 main 注册 handler。

Renderer 只能调用 preload API，不直接依赖 Electron 或 SQLite。

### 第 4 步：改 store 持久化入口

在 `useEditorStore.js` 中保留现有状态结构，但把持久化抽象成一个小的 storage adapter。

建议新增：

- `src/utils/editorStorageAdapter.js`

职责：

- 如果 `window.mdRenderApp` 存在，走桌面 App storage。
- 否则继续走当前 Web localStorage。

这样当前网页版本不会被桌面迁移打断。

### 第 5 步：旧数据迁移

首次启动桌面 App 时：

1. 读取旧 `localStorage` workspace。
2. 如果 SQLite 还没有 workspace，则导入旧数据。
3. 导入成功后标记迁移完成。
4. 不立即删除旧 `localStorage`，避免回滚困难。

### 第 6 步：保留导入导出

`src/utils/workspaceIO.js` 的 JSON 格式继续兼容现有工作区结构。

导出时从 SQLite 组装完整 workspace，包括文件 `content`。

导入时接受旧 JSON，再拆成 tree 和 files 保存。

## 第一阶段验收 case

1. 首次启动桌面 App 时，如果没有数据库，会创建默认工作区和示例文档。
2. 从现有 Web 数据迁移后，原来的文件树、选中文件和正文内容可以恢复。
3. 编辑某个 Markdown 文件，重启 App 后内容仍然存在。
4. 新建、重命名、删除文件后，重启 App 的文件树一致。
5. 导出 workspace JSON 后，再导入到空数据库，内容和文件结构一致。

## 风险点

- 不要让组件直接碰 SQLite，否则后续 Web fallback 和测试都会变复杂。
- 不要第一阶段拆太多表，文件树兼容当前 workspace JSON 更稳。
- 不要立刻删除旧 `localStorage`，迁移失败要能回退。
- 不要把 Electron 接入和编辑器 UI 重构混在同一轮。

## 推荐执行顺序

1. 先提交这份方案。
2. 单独开分支接 Electron 最小壳。
3. 再接 SQLite service 和 IPC。
4. 最后改 `useEditorStore.js` 的持久化入口。

每一步都要保持 Web 版本可运行，避免桌面迁移影响现有在线工具。
