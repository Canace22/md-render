# 云端工作区同步技术方案

> 目标：在保持 md-render 本地优先架构的前提下，把桌面端工作区同步到云端，让 Web 端可以看到文档目录和正文内容。

---

## 1. 结论先行

第一版建议做 **手动云端工作区同步**，同步应用内工作区快照，而不是直接同步本机磁盘目录。

同步后，Web 端可以看到：

- 普通工作区文档：目录结构、标题、正文、标签、摘要、关联等元数据
- Daily / 今日速记：日期、任务、笔记、待办池
- 发布相关字段：目标平台、稿件状态等非敏感配置
- 本地项目挂载里的 Markdown 文件：第一版建议以“桌面端上传的只读快照”显示

暂不同步：

- 本机绝对路径，例如 `/Users/...`
- Notion token、AI key、代理地址等敏感配置
- Electron-only 状态和 IPC 能力
- 非 Markdown 二进制素材的完整同步

---

## 2. 问题类型

这不是“把 SQLite 搬到云上”，也不是“让 Web 端访问桌面端文件系统”。更准确的问题是：

**把本地优先的编辑器状态，抽成一个 Web 端也能消费的云端工作区快照。**

因此要分清三层：

| 层级 | 当前形态 | Web 端可用性 | 同步策略 |
|------|----------|--------------|----------|
| 应用工作区 | `workspace_json` / localStorage / SQLite | 可用 | 直接同步 |
| Daily 数据 | `daily_workspace_json` | 可用 | 直接同步 |
| 本地项目目录 | Electron IPC 读写磁盘 | 不可直接用 | 桌面端上传内容快照 |
| 系统能力 | 文件选择、落盘、打开 Finder | 不可用 | Web 端隐藏或降级 |

---

## 3. 现有链路

### 3.1 普通工作区

普通工作区数据集中在 `useEditorStore.js`：

- Electron 桌面端：通过 `window.electronAPI.db` 保存到 SQLite
- Web 环境：保存到浏览器 localStorage
- 核心字段：`workspace`、`selectedId`、`dailyWorkspace`、`publishingPlatforms`

这条链路已经天然适合做云端 snapshot。

### 3.2 本地项目

本地项目通过 `localProjectBridge.js` 调 Electron 主进程：

- 打开本地文件夹
- 读取磁盘文件
- 保存 Markdown 到磁盘
- 监听磁盘变化

Web 端没有 `window.electronAPI`，不能访问这些能力。所以本地项目不能只同步路径，必须由桌面端把 Markdown 内容上传成云端快照。

### 3.3 同步入口

当前已有 `SyncPanel.jsx`，包含：

- Notion
- 本地项目
- 工作区导入导出

云端同步适合新增为同一个同步面板里的新渠道，而不是新增独立页面。

---

## 4. 方案范围

### 4.1 MVP 范围

第一版只做：

1. 用户手动点击“上传到云端”
2. 用户手动点击“从云端拉取”
3. 云端保存完整工作区快照
4. Web 端拉取后可查看和编辑普通工作区文档
5. 本地项目内容以只读快照出现在 Web 端
6. 有远端更新冲突时，不静默覆盖，先提示用户选择

### 4.2 不在 MVP 做

- 多人实时协作
- CRDT / OT
- 本地项目从 Web 端直接回写桌面磁盘
- 二进制素材完整同步
- 每个文件独立增量同步
- 后台自动常驻同步

这些不是不能做，而是不应该放进第一版。

---

## 5. 云端数据模型

第一版用 workspace snapshot，简单、可回滚、容易验证。

| 字段 | 说明 |
|------|------|
| `id` | 云端工作区 ID |
| `userId` | 用户 ID |
| `name` | 工作区名称 |
| `payload` | 标准化后的工作区快照 |
| `revision` | 递增版本号 |
| `updatedAt` | 远端更新时间 |
| `updatedByClientId` | 最后上传的客户端 ID |

`payload` 内建议包含：

| 字段 | 说明 |
|------|------|
| `schemaVersion` | 同步 payload 版本 |
| `workspace` | 文档树和正文内容 |
| `dailyWorkspace` | Daily 数据 |
| `publishingPlatforms` | 发布平台配置 |
| `selectedId` | 可选，用于恢复最后打开位置 |
| `localProjectSnapshots` | 本地项目的 Markdown 内容快照 |

`payload` 内不包含：

| 字段 | 原因 |
|------|------|
| `notionToken` | 敏感信息 |
| `notionProxyBase` | 环境相关，不适合跨端同步 |
| `projectRootPath` | 本机路径，Web 端不可用 |
| `diskContentSnapshot` | 桌面冲突判断字段，Web 端不需要 |
| `local-media://...` | Electron 协议，Web 端不可用 |

---

## 6. 本地项目快照策略

本地项目是最容易出问题的部分，建议拆成两步。

### 6.1 第一阶段：Web 端只读

桌面端上传时：

- 遍历当前工作区里的本地项目节点
- 只收集 Markdown 文档内容
- 移除本机绝对路径
- 保留一个来源标记，例如“来自桌面端本地项目快照”

Web 端拉取后：

- 能看到目录、标题、正文
- 默认只读
- 不显示“打开文件夹”“从磁盘同步”“在 Finder 中显示”等按钮

这样可以先满足“Web 端能看到内容”，但不制造“Web 修改后怎么安全回写磁盘”的复杂问题。

### 6.2 第二阶段：Web 端可编辑副本

如果后续要让 Web 端编辑本地项目内容，建议采用“编辑云端副本”的策略：

- Web 修改写入云端快照
- 桌面端下次拉取时识别云端副本有更新
- 用户确认后再写回本地磁盘
- 如果本地磁盘同时也改了，生成冲突副本

不要让 Web 端直接拥有“自动覆盖桌面磁盘文件”的能力。

---

## 7. 同步流程

### 7.1 上传到云端

1. 从 `useEditorStore` 读取当前状态
2. 构建标准化 payload
3. 过滤敏感字段和 Electron-only 字段
4. 如果包含本地项目，生成 Markdown 内容快照
5. 请求云端当前 `revision`
6. 如果远端 revision 与本地记录一致，上传并递增 revision
7. 如果不一致，提示远端已有更新，不直接覆盖

### 7.2 从云端拉取

1. 请求云端 workspace snapshot
2. 检查 payload schemaVersion
3. 对比本地最近同步 revision
4. 如果本地没有未同步改动，直接应用
5. 如果本地也有改动，提示用户选择：
   - 使用云端版本
   - 保留本地版本
   - 生成冲突副本后合并
6. 应用后写入现有持久化链路，仍由 Zustand / SQLite / localStorage 负责本地保存

---

## 8. 冲突处理

MVP 不做复杂合并，只保证不丢内容。

### 8.1 冲突判断

触发冲突的情况：

- 本地记录的 lastSyncedRevision 小于远端 revision
- 本地从上次同步后也发生了修改
- 用户尝试上传覆盖远端较新版本

### 8.2 处理方式

| 场景 | 处理 |
|------|------|
| 远端新，本地未改 | 直接拉取 |
| 远端未变，本地已改 | 直接上传 |
| 远端新，本地也改 | 提示冲突 |
| 用户选择云端 | 覆盖本地，但先保留本地备份 |
| 用户选择本地 | 上传本地，但先确认覆盖远端 |
| 用户选择保留两份 | 生成“冲突副本”文档 |

冲突副本命名建议：

```text
原文档名（本地冲突副本 2026-06-18 14-30）.md
```

---

## 9. 前端改动边界

### 9.1 新增工具层

新增 `cloudSyncService.js`，负责：

- 读取同步服务地址
- 调用云端 API
- 统一处理 HTTP 错误
- 不直接操作 store

### 9.2 Store 层

仍然只使用 `useEditorStore.js`，不新增全局 store。

建议新增的 store 状态：

| 状态 | 说明 |
|------|------|
| `cloudSyncEnabled` | 是否启用云同步 |
| `cloudWorkspaceId` | 当前云端工作区 ID |
| `cloudLastSyncedRevision` | 最近同步的远端版本 |
| `cloudLastSyncedAt` | 最近同步时间 |
| `cloudClientId` | 本机客户端 ID |

建议新增的 action：

- 构建云端 payload
- 应用远端 payload
- 更新同步元信息
- 标记冲突状态

复杂的纯计算，例如 payload 过滤、冲突副本生成，放在 `workspaceUtils.js` 或独立同步 utils 中，不塞进组件。

### 9.3 UI 层

在 `SyncPanel.jsx` 新增“云端”渠道：

- 连接状态
- 工作区 ID / 服务地址
- 上传到云端
- 从云端拉取
- 最近同步时间
- 冲突提示

组件只接收 handler 和状态，不直接写业务逻辑，不直接操作 localStorage。

---

## 10. 后端接口边界

后端可以先做得很薄，只负责鉴权和存取 snapshot。

| 接口 | 用途 |
|------|------|
| 获取当前用户工作区列表 | Web 端选择工作区 |
| 获取工作区 snapshot | 拉取远端状态 |
| 上传工作区 snapshot | 推送本地状态 |
| 获取工作区元信息 | 比较 revision |

上传接口需要校验：

- 用户是否有权限写这个 workspace
- 客户端传入的 baseRevision 是否等于当前 revision
- payload 大小是否超过限制
- payload schemaVersion 是否支持

如果 baseRevision 过旧，返回冲突状态，不覆盖远端。

---

## 11. 安全与隐私

必须默认安全：

- token、API key、Notion secret 不进入云端 payload
- 本地绝对路径不进入云端 payload
- Web 端不展示本机路径
- 云端 API 走 HTTPS
- 用户必须登录后才能同步
- 服务端按 userId 隔离 workspace
- payload 建议限制大小，避免误传大文件或二进制内容

本地项目快照只上传 Markdown 正文。图片、音视频、PDF 等二进制素材先显示为不可用占位，后续再单独设计素材同步。

---

## 12. 分阶段落地

### P0：手动 snapshot 同步

- 新增云端同步服务封装
- 新增同步 payload 构建和过滤
- 新增 SyncPanel 云端渠道
- 支持上传 / 拉取
- 支持 revision 冲突保护

### P1：本地项目只读快照

- 桌面端上传本地项目 Markdown 内容
- Web 端展示为只读来源
- 隐藏桌面-only 操作

### P2：自动同步

- 保存后 debounce 上传
- 应用启动时检查远端更新
- 网络失败时保留本地编辑，不阻断写作

### P3：Web 编辑本地项目云端副本

- Web 端可编辑快照副本
- 桌面端拉取后提示写回磁盘
- 本地和云端同时修改时生成冲突副本

### P4：文档级增量同步

- 从 workspace snapshot 拆成 document-level 同步
- 降低大工作区上传成本
- 支持更细粒度冲突判断

---

## 13. 建议验证 case

| # | 场景 | 预期 |
|---|------|------|
| 1 | 桌面端普通工作区新建文档并上传，Web 端拉取 | Web 端看到文档标题、目录位置和正文内容 |
| 2 | Web 端修改普通文档并上传，桌面端拉取 | 桌面端正文更新，并继续走本地 SQLite 持久化 |
| 3 | 桌面端打开本地项目并上传快照，Web 端拉取 | Web 端看到 Markdown 内容，但本地项目操作按钮不可用 |
| 4 | 桌面端和 Web 端同时修改同一文档 | 拉取或上传时提示冲突，不静默覆盖 |
| 5 | payload 内包含 Notion token、本机路径或 `local-media://` | 上传前被过滤，云端不保存这些字段 |

---

## 14. 关键取舍

第一版的核心取舍是：

**先保证 Web 端能看到内容，再考虑 Web 端能不能安全改回本地磁盘。**

这样做的好处是：

- 改动范围小，主要复用现有 store 和 SyncPanel
- 不破坏本地优先体验
- Web 端不依赖 Electron IPC
- 冲突风险可控
- 后续可以自然升级到自动同步和文档级增量同步

