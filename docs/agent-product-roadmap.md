# md-render Agent 产品化路线

## 定位

Agent 不是一个独立聊天框，而是懂 md-render 工作台语义的操作层：理解当前稿件和工作区，调用受控工具，产出可复用资产，并在遇到应用问题时先收集证据再采取可逆动作。

## v0.1：App 专家 + 安全自愈助手

已落地的首版闭环：

1. 产品知识统一放在 `core/agent/appKnowledge.js`，明确界面、资产、工具边界和故障处置原则。
2. 上下文用可定位的内容资产指针表示：`id + 标题 + 摘要 + 状态 + 来源`，正文仍然按需读取。
3. `create_agent_artifact` 统一创建方案、调研、简报、清单、平台稿和事故报告，保留原稿并复用现有 `createGeneratedFile` + `sourceMaterialIds` 派生链路。
4. `inspect_app_health` 通过 Main IPC 读取脱敏运行快照：版本、打包环境、AI 代理健康、SQLite 快速检查和更新能力。
5. 当诊断返回 `availableRepairs` 时，`apply_safe_repair` 只能执行白名单动作，强制用户确认，复检失败自动回滚。当前首个修复是清除失效的 AI 代理覆盖配置。

## 真正的“发版后自己修 bug”边界

已发布的 Electron 客户端不包含源码、Git 和构建环境，不能让模型直接修改安装包。客户端 Agent 只负责：

- 识别版本、运行环境和数据状态。
- 执行有明确预检、备份、复检、回滚的本机白名单修复。
- 无法修复时生成事故报告产物，不假装已解决。

代码缺陷的后续链路应是：脱敏故障包 → 仓库 Agent 复现与修复 → CI 验证 → 人工审批 → 签名发版 → updater 安装，而不是客户端自改 asar。

## 后续分期

- **P1 可观测性**：Renderer/Main 统一结构化错误日志，全局异常捕获，支持脱敏 incident bundle。
- **P2 安全恢复**：SQLite integrity/FTS 重建、本地缓存清理、文档版本恢复、更新检查，每个动作都实现 `inspect / backup / apply / verify / rollback`。
- **P3 发版闭环**：AI proxy 鉴权、限流、工具风险分级，修复工具不走远端无鉴权 spawn。
- **P4 仓库修复 Agent**：根据故障包在真实仓库切分支、跑验证、提交 PR，最后由签名发布反馈版本。

## 不变的交互约束

- 就地改当前正文：走 `write_active_doc` 并经过 diff 确认。
- 平台版、方案、调研、事故报告：走 `create_agent_artifact`，保留原文和来源。
- 远端 server 工具：只按其声明用于文件转换，不用于修复用户设备。
