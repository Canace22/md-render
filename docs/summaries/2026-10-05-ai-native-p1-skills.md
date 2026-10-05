# 功能 skill 化（AI Native 重构 P1）

日期：2026-10-05

## 背景

AI 面板里的功能（平台版、改写、编辑部、选题、Daily、白板……）都是写死在 `AgentPanel.jsx` / `aiActions.js` / `platformVariant.js` 里的 prompt 常量，分成 agent / quick / platform 三套 handler。加一个功能要改 JS、重新发版；外部 agent（Claude Code 等）也用不上这些 prompt。

## 改动

| 任务 | 文件 | 做法 |
|------|------|------|
| P1-1 | `.agents/skills/README.md` | 定义产品 skill 格式：`SKILL.md` + `agents/md-render.yaml`（label / group / aliases / entry / input / tools / output） |
| P1-2 | `core/agent/skillRegistry.js`、`builtinSkills.js` | 纯函数解析与校验；内置（构建期 `import.meta.glob`）+ 内容库合并，同名内容库优先；单个出错跳过并给原因 |
| P1-3 | `main/skillFiles.js`、`main/ipc/skillHandlers.js`、`preload.js`、`hooks/useSkillRegistry.js` | 主进程读 `MdRender/.agents/skills`，递归监听，变化推 `skills:changed`，renderer 自动重载 |
| P1-4 ~ P1-7 | `apps/editor/resources/skills/`（30 个） | 平台版 3、改写 9、编辑部 1+3、入口类 14 全部迁成 skill 文件，每个声明最小工具白名单 |
| P1-8 | `agentEngine.js`、`toolRegistry.js` | `runAgent({ allowedTools })`：只发白名单工具，执行前再拦一次，拒绝结果回填模型 |
| P1-9 | `core/agent/skillRunner.js`、`AgentPanel.jsx`、`agentSkillItems.js` | 三套 handler 合并为 `runSkill(skillId)`；slash / 欢迎页 / 「+」菜单 / 技能页都从 registry 生成；删除全部 prompt 常量和 `platformVariant.js` |
| P1-10 | `services/fileConvertTools.js`、`FileConvertMenuItems.jsx`、`WorkspaceSidebar.jsx` | PDF→Word、视频→音频移到工作区右键菜单 |
| P1-11 | `.agents/skills/md-render-agent/SKILL.md` | 写清「加功能 = 加 skill 文件」 |
| U1 | `AgentSkillsTab.jsx`、`skills:write` / `skills:open` | 技能页可编辑（内置先复制到内容库）、可新建（模板），显示 skill 文件错误 |
| U2 | `EditorQuickToolbar.jsx`、`MarkdownEditor.jsx`、`agentSlice.js` | 文档工具栏「平台版」下拉来自 `entry: doc-toolbar`；经 `requestAgentSkill` 交给 AI 面板运行 |

## 设计取舍

- 没有引入 YAML 依赖：`md-render.yaml` 只支持扁平 key、行内列表和 `- 项`，复用 `shared/frontmatterDocument.js` 解析。
- 内置 skill 在 renderer 构建期内联，打包不用拷资源目录，Web 版也能用；内容库 skill 走 IPC，Web 版暂不支持。
- `input` 由运行时处理（开场句、选区拼接），skill 正文只写任务本身，内置和自定义规则一致。
- 编辑部规范只有一份（`ai-editorial-board`），三个入口在运行时按章节拼接；内容库可单独覆盖规范或入口。
- 「编辑」用系统默认程序打开 SKILL.md：`.agents` 是隐藏目录，不在工作区树里。

## 已知限制

- 内容库 skill 只在桌面版可用。
- 打开 SKILL.md 用的是系统默认程序，不是 app 内编辑器。
- `AgentPanel.jsx` 里 `host.getDailyOverview` 引用了未定义的 `buildDailyOverview`（改动前就存在，没有工具会调用到它），未处理。

## 验证

- 新增单测：`skill-registry`（21）、`skill-files`（8）、`skill-runner`（10）、`agent-skill-tools`（6）、`editorial-board` 增 2 条；全量 388 条中 3 个文件失败，均为本机环境问题（原生模块架构、excalidraw 依赖），与本次改动无关。
- 单测守住的约束：内置 skill 全部通过校验；白名单里的工具都真实存在；需要读文档的 skill 都带 `read_active_doc`。

建议手动过一遍：

1. 在 `~/Documents/MdRender/.agents/skills/jike-version/` 放一个 SKILL.md，不重启，slash 列表出现它并能运行
2. 技能页点内置「润色」的编辑按钮，内容库出现 `polish/` 副本，改正文后再运行，用的是新规则
3. 文档工具栏「平台版 → 公众号版」，AI 面板自动打开并生成平台稿
4. 选中一段文字「引用到 AI」，再跑「润色」，只改选中段
5. 工作区右键「PDF 转 Word…」能走完转换
