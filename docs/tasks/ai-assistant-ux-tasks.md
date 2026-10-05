# AI 助手交互优化任务清单

> 来源：[`../ai-assistant-ux-plan.md`](../ai-assistant-ux-plan.md)
> 创建：2026-10-05
> 约定：做完一条就勾选，提交信息用「完成任务：<编号> <标题>」；全部完成后在 `docs/summaries/` 写总结，并更新 `.agents/skills/md-render-agent/SKILL.md`。
> 执行顺序：P0 → P1 → P2 → P4 → P3（方案第 5 节的建议顺序）。

**状态说明**：`[ ]` 待做 · `[~]` 进行中 · `[x]` 完成 · `⛔` 阻塞

---

## 交接说明（给接手的人 / AI）

- 先读方案 `docs/ai-assistant-ux-plan.md`，再看本清单里第一个没勾的任务。
- 每条任务的「范围」就是要动的文件；「验收」对应方案第 6 节的测试 case 编号。
- 改 agent 相关代码前先读 `.agents/skills/md-render-agent/SKILL.md`（模块边界、坑）。
- 纯逻辑放 `core/agent/*.js` 并在 `apps/editor/tests-unit/` 补单测；组件只做 UI。
- 验证：`cd apps/editor && npx vitest run <相关测试>`、`npx vite build`。基线有 3 个和环境有关的失败（`canvas-bookmark`、`excalidraw-canvas-agent` 找不到 roughjs；`local-agents` 进程组 kill 用例），不是本任务引入的。
- 跑完测试删掉 `apps/editor/vitest.config.js.timestamp-*.mjs`。

---

## P0 基础：流式输出 + 排队 + 重试

- [ ] **P0-1** ai-proxy `/api/chat` 支持 `stream: true`，透传上游 SSE
  - 范围：`server/ai-proxy/server.js`
- [ ] **P0-2** 主进程 `ai:chatStream` IPC：读 SSE，按片段 `webContents.send('ai:chatStream:event')`，支持 `ai:chatStream:abort`
  - 范围：`main/aiRequest.js`、`main/ipc/aiHandlers.js`、`main/preload.js`
- [ ] **P0-3** 渲染进程流式客户端：SSE 解析（纯函数，可单测）+ Electron 订阅 / Web `fetch` + `ReadableStream`；把 delta 合并成完整 message（含 tool_calls）
  - 范围：`core/agent/sseStream.js`（新）、`core/agent/aiClient.js`
- [ ] **P0-4** `agentEngine` 新增 `onDelta` → `assistant_delta` 事件；有 tool_calls 照常执行
  - 范围：`core/agent/agentEngine.js`
- [ ] **P0-5** 面板：第一个 delta 追加 `typing` assistant 消息，后续只更新这一条；停止时保留已输出内容并标「已停止」
  - 验收：case 1–3
- [ ] **P0-6** 运行中回车 → 排队（显示「已排队 N 条」，可取消），本轮结束后自动发送
  - 验收：case 14
- [ ] **P0-7** 出错消息加 [重试]；连接类错误再加 [打开设置]
  - 验收：case 15

## P1 选区就地润色

- [ ] **P1-1** `runInlineRewrite({ text, context, instruction, signal, onDelta })`：不带工具，直接调 `callChatCompletion`；指令表（润色 / 口语 / 正式 / 简洁 / 精简）
  - 范围：`core/agent/inlineRewrite.js`（新）
- [ ] **P1-2** 稿件编辑器格式工具栏加 AI 按钮组（Daily 编辑器不显示，用 prop 控制）
  - 范围：`components/EditorFormattingToolbar.jsx`、`MarkdownEditor.jsx`
- [ ] **P1-3** 行内对比卡片：流式显示新文本，[接受] [放弃] [再来一版]；接受时只替换选中的 block 范围，进入撤销栈
  - 验收：case 4–6

## P2 找灵感：聊天模式

- [ ] **P2-1** 会话加 `mode`（`chat` / `write`，新会话默认 chat）；`runTurn` 按模式决定是否带当前稿件、工具白名单、系统提示
  - 范围：`sessionUtils.js`、`agentSlice.js`、`AgentPanel.jsx`、`core/agent/chatMode.js`（新）
  - 验收：case 7
- [ ] **P2-2** `read_url` 工具：ai-proxy 抓取公开网页并提取正文（复用 knowledgeSearch 的 SSRF 防护）；主进程 IPC + 工具执行器
  - 验收：case 8–9
- [ ] **P2-3** 输入框检测 URL → 链接 chip，发送前预取，失败标红
- [ ] **P2-4** 拖入 / 粘贴文件（md / txt / pdf / docx / 图片）→ 附件 chip
  - 验收：case 10
- [ ] **P2-5** 回复上的「📌 记下来」：追加到工作区「灵感」笔记
  - 验收：case 11

## P4 面板精简

- [ ] **P4-1** 去掉 4 个 tab：标题下拉切会话；技能、活动、上下文收进 ⚙ 菜单
- [ ] **P4-2** 会话列表：日期、模式图标、关键词搜索
- [ ] **P4-3** 欢迎页按模式区分；删掉三个徽章
- [ ] **P4-4** 设置：修空 hint；「AI 代理地址」「Base URL」收进「高级」
- [ ] **P4-5** 面板左边缘拖拽调宽，宽度存 localStorage
- [ ] **P4-6** skill 入口调整（`agents/md-render.yaml` 的 `entry`）

## P3 准备发布

- [ ] **P3-1** 文档工具栏三个平台按钮合并成「准备发布」
- [ ] **P3-2** 发布弹窗：选平台（可多选）+ 可选审稿 → 并行生成结构化结果（标题 ×3、摘要、标签、正文）
- [ ] **P3-3** 结果按平台分 tab，每块可复制；公众号可预览；[保存为平台稿] 走 `createGeneratedFile`
  - 验收：case 12–13

## 收尾

- [ ] **Z-1** 更新 `md-render-agent` skill；在 `docs/summaries/` 写总结
