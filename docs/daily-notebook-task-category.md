# 今日速记 · 条目类别

> 说明「今日速记」中**今日任务**、**笔记**与**待办池**的类别标注能力：有哪些类别、怎么用、数据怎么存、代码在哪改。
>
> 相关文档：
> - [cloud-sync-technical-plan.md](./cloud-sync-technical-plan.md) — Daily 数据同步
> - [ai-assistant-quality-checklist.md](./ai-assistant-quality-checklist.md) — AI 助手在今日速记场景的验收项

---

## 1. 功能概述

「今日速记」把每天的内容拆成三块：

| 类型 | 说明 |
|------|------|
| **task** | 今天要推进的事，支持优先级、完成态、**类别** |
| **note** | 随手想法与观察，支持**类别** |
| **event** | 约定、会议、临时安排 |

类别用于区分「这件事属于哪一类生活/工作场景」，方便扫一眼分清重心。对任务而言，类别与优先级（高/中/低）正交，互不替代。

**待办池**与今日任务、笔记共用同一套类别；任务移入待办池、跨天结转、再从待办池「加入今天」时，类别会一并保留。笔记跨天结转时整项搬运，`category` 随条目保留。

---

## 2. 类别定义

当前内置 5 个类别 + 未分类（默认）：

| value | 显示名 | 颜色 | 适用场景 |
|-------|--------|------|----------|
| `work` | 工作 | 蓝 `#3b82f6` | 职场交付、会议、协作、对外事项 |
| `creation` | 创作 | 紫 `#a855f7` | 写作、内容产出、博客/公众号草稿 |
| `learning` | 学习 | 青 `#06b6d4` | 阅读、课程、研究、技能练习 |
| `life` | 生活 | 绿 `#22c55e` | 家务、健康、家人、日常琐事 |
| `personal` | 个人 | 橙 `#f97316` | 兴趣、自我提升、非工作类 side project |
| _(空)_ | 未分类 | — | 默认；旧数据无此字段时等同未分类 |

**设计原则：**

- 类别是**可选**的，不强制每条都打标。
- 今日任务（`task`）、笔记（`note`）与待办池（`todoPool[]`）均可读写 `category`；event 不带此字段。
- 任务还可单独设置优先级；笔记无优先级。

常量定义在 `apps/editor/renderer/src/utils/dailyWorkspace.js` 的 `DAILY_TASK_CATEGORY_OPTIONS`，UI 与 normalize 逻辑共用这一份。

---

## 3. 使用方式

### 3.1 新建任务

在「今日任务」输入区：

1. 左侧 **类别** 下拉（可选，默认未分类）
2. 中间输入任务文字
3. 回车或点「+」添加

连续添加同类任务时，类别选择会保留到下一次提交前；提交后自动清空类别选择（文字框同样清空）。

### 3.2 新建笔记

在「笔记」输入区交互与任务相同：左侧可选类别 → 输入内容 → 提交。任务与笔记各自维护独立的类别草稿（在任务区选了「工作」不会自动带到笔记区）。

### 3.3 修改已有任务 / 笔记的类别

- 已有类别：点击右侧**彩色标签**，在下拉菜单中切换或选「未分类」清除。
- 未分类：点击虚线 **「类别」** 按钮，选择目标类别。

### 3.4 与优先级的关系（仅任务）

| 控件 | 位置 | 交互 |
|------|------|------|
| 优先级 | 任务左侧圆点 | 点击循环：高 → 中 → 低 |
| 类别 | 任务文字右侧标签 | 点击打开下拉菜单 |

排序规则不变：未完成优先于已完成，同组内按优先级（高 → 中 → 低）排序；**暂不按类别分组或筛选**。

### 3.5 待办池

**新建待办：** 输入区左侧同样有类别下拉（可选），交互与今日任务一致；提交后类别选择清空。

**修改类别：** 与今日任务相同，点击彩色标签或「类别」按钮切换。

**类别流转：**

| 操作 | 类别行为 |
|------|----------|
| 今日任务 → 移到待办 | 保留原 category |
| 跨天结转（未完成 task 沉池） | 保留原 category |
| 待办 → 加入今天 | 带入 category，成为今日任务 |
| 手动在待办池新建 | 可选 category，默认可不选 |

---

## 4. 数据模型

Daily workspace 整体形状：

```json
{
  "currentDate": "2026-06-26",
  "entries": {
    "2026-06-26": {
      "date": "2026-06-26",
      "items": [
        {
          "id": "task-xxx",
          "type": "task",
          "text": "写完本周公众号草稿",
          "priority": "high",
          "category": "creation",
          "done": false,
          "createdAt": 1719360000000,
          "updatedAt": 1719360000000
        },
        {
          "id": "note-yyy",
          "type": "note",
          "text": "公众号标题可以改成疑问句",
          "category": "creation",
          "priority": "medium",
          "done": false,
          "createdAt": 1719360000000,
          "updatedAt": 1719360000000
        }
      ]
    }
  },
  "todoPool": [
    {
      "id": "todo-xxx",
      "text": "补完 AI 测试文档",
      "category": "work",
      "sourceDate": "2026-06-25",
      "createdAt": 1719360000000,
      "updatedAt": 1719360000000
    }
  ]
}
```

**字段约定：**

- 今日任务与笔记：`category` 出现在 `type === 'task' | 'note'` 且值合法时；未分类时不写入该字段。
- 待办池：每条 todo 可选 `category`，规则相同。
- 非法或未知 `category` 值在 normalize 时被丢弃，视为未分类。
- 任务 ↔ 待办池流转、笔记跨天结转（整项搬运）时保留 `category`。

**兼容性：** 升级前已有的任务没有 `category` 字段，打开后显示为未分类，无需迁移脚本。

---

## 5. 代码结构

```text
dailyWorkspace.js          纯函数：normalize、增删改、category 校验
       ↓
useEditorStore.js          addDailyItem(date, type, text, category?)
                           addTodoItem(text, category?)
                           updateDailyItemCategory(date, itemId, category)
                           updateTodoItemCategory(todoId, category)
       ↓
DailyNotebook.jsx          今日任务 + 笔记 + 待办池：类别 Select（新建）、Tag / 下拉（编辑）
MarkdownEditor.jsx         把 store 动作传给 DailyNotebook
styles.css                 .daily-notebook-category-* 样式
```

**关键 API（`dailyWorkspace.js`）：**

| 函数 | 作用 |
|------|------|
| `addDailyEntryItem(ws, date, { type, text, category? })` | 新建条目，task / note 可带 category |
| `addTodoPoolItem(ws, text, sourceDate?, category?)` | 新建待办，可带 category |
| `updateDailyEntryItemCategory(ws, date, itemId, category)` | 更新或清除任务 / 笔记类别 |
| `updateTodoPoolItemCategory(ws, todoId, category)` | 更新或清除待办类别 |
| `sendDailyEntryTaskToTodo(...)` | 移入待办时传递 category |
| `carryOverIncompleteTasks(...)` | 结转沉池时传递 category |
| `promoteTodoToDaily(...)` | 加入今天时传递 category |
| `normalizeDailyItem` / `normalizeTodoItem` | 读盘/合并时校验 category |

**Store 动作：**

- `addDailyItem(dateKey, type, text, category?)` — 第 4 参对 task / note 有效
- `addTodoItem(text, category?)` — 手动补待办
- `updateDailyItemCategory(dateKey, itemId, category)` — 传空字符串清除类别
- `updateTodoItemCategory(todoId, category)` — 传空字符串清除类别

改动 Daily 数据时仍须走纯函数 + `persistDailyWorkspaceBackup`；切日期语义见 skill `md-render-daily`（切日期 ≠ 结转）。

---

## 6. 已知限制与后续可扩展

| 项 | 现状 | 可扩展方向 |
|----|------|------------|
| 筛选 / 分组 | 无 | 任务区 / 待办池顶部按类别 chip 筛选 |
| 自定义类别 | 固定 5 类 | 用户配置 + 持久化到 workspace 或 settings |
| 事件 | 无类别 | 若需求明确可单独设计 |
| 云同步 | 随 `dailyWorkspace` JSON 同步 | 无额外协议变更 |

---

## 7. 验证清单

手动或单测可参考：

1. 新建任务选「工作」→ 显示蓝色「工作」标签  
2. 点击标签改为「创作」→ 立即更新  
3. 选「未分类」→ 标签消失，数据无 `category` 字段  
4. 切换日期再切回 → 类别保留  
5. 任务移到其他日期 → 类别随 item 一起移动  
6. 未完成任务移入待办池 → 待办池保留类别；再「加入今天」类别仍在  
7. 跨天结转未完成任务 → 沉池后保留 category  
8. 新建笔记选「创作」→ 显示紫色标签  
9. 笔记批量改日期 → category 随条目保留  
10. event 条目 → 不出现类别 UI，数据中无 category  

单测入口：`apps/editor/tests-unit/dailyWorkspace-switch-date.test.js`（切日期与结转；类别可在此文件或新文件中补 case）。

---

## 8. 修改此类别时的注意点

- 支持 category 的条目类型由 `DAILY_CATEGORY_ITEM_TYPES`（`task` / `note`）集中定义；增删类型或类别值时同步改此处与 `DAILY_TASK_CATEGORY_OPTIONS`。
