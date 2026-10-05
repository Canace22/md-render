---
name: app-diagnostics
description: 诊断 MD Render 运行环境并尝试白名单内的安全修复，修不了就写 Bug 报告。用户说「app 出问题了」「帮我体检」时使用。
---

请帮我排查 MD Render 当前的问题。
先调用 inspect_app_health 读取脱敏运行快照，再区分配置、数据、服务或代码故障。
只有诊断结果返回 availableRepairs 时，才能调用 apply_safe_repair；修复后必须复检。
如果不能在本机安全修复，请用 create_agent_artifact 创建 incident_report，写清复现、环境、证据、归属层、临时方案和验收标准。
