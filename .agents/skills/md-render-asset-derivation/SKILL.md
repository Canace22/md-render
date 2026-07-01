---
name: md-render-asset-derivation
description: 在 md-render 中实现“保留原稿、生成派生资产、记录来源关系”的功能时使用。触发场景包括“生成平台版本”“另存为新稿”“不要覆盖原文”“派生资产”“来源素材”“sourceMaterialIds”“资产和业务解耦”。略主动。
---

# 派生资产工作流

把改写、摘要、平台稿、发布稿等结果做成新资产，并记录它来自哪里。

## 为什么这么做

这个项目长期要沉淀可复用资产。派生结果如果只写回当前文档，原稿会丢失；如果只新建文档但不记录来源，后面搜索、图谱、复用和同步都会断线。所以默认做法是：业务流程只负责编排，新结果落成文档资产，并写清来源关系。

## 步骤

1. 先判断这次需求是不是派生：改写、摘要、平台适配、发布稿、从素材生成稿件，都按派生资产处理。
2. 默认保留原稿，除非用户明确说覆盖当前文档。
3. 新建文档优先走 `useEditorStore.js` 里的 `createGeneratedFile`，不要在组件里拼 workspace 结构。
4. 纯计算放 `workspaceUtils.js`：用 `getDerivationSourceFileId` 判断来源，用 `buildDerivedAssetKnowledgeFields` 合并元数据。
5. 来源关系写进 `sourceMaterialIds`；如果来自当前文档，让 store action 调纯函数自动补当前文档 id。
6. 平台、状态、摘要等元数据放进 `meta`，由 `createDefaultKnowledgeFields` 归一化。
7. UI 只展示和触发动作；资产创建、派生、关联逻辑放在 store action 或 utils/service。
8. 如果是 AI 助手链路，`toolRegistry.js` 只定义工具和转发参数，`AgentPanel.jsx` 的 host 再对接 store。

## 易踩的坑

- 不要用 `write_active_doc` 做平台稿或改写稿，除非用户明确要覆盖。
- 不要只靠文件名表达来源，必须写 `sourceMaterialIds`。
- 不要在 store action 里临时拼派生字段；能用输入输出表达的规则先抽纯函数。
- 不要让 `toolRegistry.js` 直接 import store 或 IPC；它只能通过 host 调能力。
- 本地项目文件和普通 workspace 文件都要走同一个 `createGeneratedFile` 元数据归一逻辑。
- Renderer 里不能直接用 Node.js API。

## 验证

改代码后列 10 条 case，覆盖：

- 当前选中文档生成新稿
- 没有选中文档时新建稿
- 显式传入多个 `sourceMaterialIds`
- 来源 id 重复时去重
- 选中文件夹时不错误写入来源
- 本地项目目录下新建派生稿
- 普通 workspace 下新建派生稿
- 生成内容为空时拒绝
- 平台参数保留到 `targetPlatforms`
- 元数据面板能看到并打开来源素材

默认不主动跑测试；用户要求或需要提交前验证时，优先跑最小范围的构建或单测。

## 完成标准

- 原稿未被覆盖
- 新资产有稳定 id、正文、时间戳和归一化知识字段
- 来源关系进入 `sourceMaterialIds`
- 业务入口没有直接操作 workspace 内部结构
- 已说明建议验证项或实际执行的验证命令
