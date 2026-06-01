# 编码规范

本文档定义了在进行代码编写时应遵循的规范和风格约定，适用于本项目（React + Vite + Zustand + BlockNote）。

## 总则

1. **最小化改动** - 只修改完成任务所需的最少代码，避免过度工程化
2. **复用优先** - 优先使用现有组件和工具函数，不要重复造轮子
3. **遵循约定** - 严格遵循项目的既定模式和命名规范
4. **务实类型** - 项目使用纯 JavaScript（无 TypeScript），不要引入类型定义文件

## 技术栈约束

### 框架与库

- **Vite 5.x** - 构建工具，开发服务器
- **React 18** - 函数式组件 + Hooks
- **JavaScript（JSX）** - 项目无 TypeScript，所有文件均为 `.js` / `.jsx`
- **Zustand 5.x** - 全局状态管理（`src/store/useEditorStore.js`）
- **@blocknote/react 0.47.x** - 富文本块编辑器（Novel 模式）
- **Ant Design 5.x** - 部分 UI 组件
- **shiki 3.x** - 代码语法高亮
- **lucide-react** - 图标库

### 禁止行为

- 禁止引入 TypeScript（`.ts` / `.tsx`）
- 禁止使用 class 组件
- 禁止直接操作 `localStorage`（统一通过 zustand `persist` 中间件或已有的常量 key 访问）
- 禁止在 JSX 中写复杂的业务逻辑，抽到 hooks 或 utils
- 禁止直接 `fetch`（封装到 `src/utils/` 下对应模块，如 `notionService.js`）

## 项目结构

```
src/
├── components/          # React 组件
│   ├── MarkdownEditor.jsx     # 主编辑器（Markdown 编辑 + 预览）
│   ├── WorkspaceSidebar.jsx   # 左侧工作区文件树
│   ├── SettingsPanel.jsx      # 设置面板
│   ├── NotionPanel.jsx        # Notion 导出面板
│   ├── NovelAssistantPanel.jsx# 小说写作助手面板
│   ├── DocHeader.jsx          # 顶部标题栏
│   └── ...
├── core/                # 核心解析/渲染逻辑
│   ├── parser.js        # Markdown 解析器 → token 数组
│   ├── renderer.js      # token 数组 → HTML 字符串
│   └── novel/           # 小说辅助（实体抽取、场景分析等）
├── hooks/               # 自定义 Hooks
│   ├── useTitleEditing.js
│   └── useWorkspaceActions.js
├── store/
│   ├── useEditorStore.js  # 全局状态（zustand + persist）
│   └── workspaceUtils.js  # 工作区纯函数工具
├── utils/               # 工具函数
│   ├── markdownIO.js      # Markdown 文件导入导出
│   ├── markdownUtils.js
│   ├── notionService.js   # Notion API 调用
│   ├── notionConverter.js # 内容格式转换
│   ├── themeUtils.js      # 主题工具
│   ├── wechatCopy.js      # 微信格式复制
│   ├── wechatTemplates.js # 微信模板
│   └── workspaceIO.js     # 工作区导入导出
└── styles/
    ├── styles.css         # 主样式（暗黑主题）
    └── design-tokens.css  # CSS 变量（颜色、间距等）
```

## 状态管理

项目使用 **Zustand** 管理全局状态，所有编辑器状态集中在 `src/store/useEditorStore.js`。

```javascript
// ✅ 组件中读取状态
const { markdown, setMarkdown, theme } = useEditorStore();

// ✅ 工作区相关纯函数放在 workspaceUtils.js
import { findNodeById, buildUniqueName } from '../store/workspaceUtils.js';
```

- 持久化通过 zustand `persist` 中间件实现，key 统一在 store 文件顶部定义为常量
- 页面内临时状态使用 `useState`

## 组件编写

```javascript
// ✅ 函数式组件 + Hooks
import React, { useState, useEffect } from 'react';

const MyComponent = ({ title, onClose }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await someAction();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-component">
      {/* ... */}
    </div>
  );
};

export default MyComponent;
```

## 文件命名

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| React 组件 | PascalCase.jsx | `SettingsPanel.jsx` |
| 工具/Hook 文件 | camelCase.js | `markdownUtils.js` |
| 样式文件 | styles.css / design-tokens.css | - |

## 命名规范

| 场景 | 规则 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `MarkdownEditor`, `WorkspaceSidebar` |
| 普通函数 | camelCase | `handleClick`, `parseMarkdown` |
| 变量 | camelCase | `isLoading`, `selectedId` |
| 常量（模块级） | UPPER_SNAKE_CASE | `STORAGE_KEY`, `DEFAULT_FILE_ID` |
| 事件处理 | handle 前缀 | `handleChange`, `handleSubmit` |
| 异步数据获取 | fetch/load/save 前缀 | `fetchNotionPages`, `saveWorkspace` |

## 样式规范

- 样式写在 `src/styles/styles.css`，CSS 变量定义在 `design-tokens.css`
- 优先使用 CSS class，不写大段内联 style
- 简单动态样式可用内联 `style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}`
- 主题颜色通过 CSS 变量控制，不要硬编码颜色值

## 核心模块约定

### parser.js / renderer.js

- `parser.js` 只负责文本 → token，无副作用
- `renderer.js` 只负责 token → HTML 字符串，无副作用
- 新增语法支持：先在 parser 中加 token 类型，再在 renderer 中加对应渲染方法

### notionService.js

Notion API 调用统一封装在此文件，组件不直接调用 Notion API。

### wechatCopy.js / wechatTemplates.js

微信公众号格式化逻辑，模板定义在 `wechatTemplates.js`，复制逻辑在 `wechatCopy.js`。

## 错误处理

```javascript
// ✅ 异步操作统一 try/finally 管理 loading
const handleSubmit = async () => {
  setLoading(true);
  try {
    const result = await someApi();
    // 处理结果
  } catch (err) {
    console.error(err);
    // 必要时展示错误提示
  } finally {
    setLoading(false);
  }
};
```

## 代码质量约束

- ✅ 单一职责：每个函数只做一件事，保持小函数
- ✅ 纯函数优先：工具函数和核心逻辑尽量无副作用
- ✅ 禁止魔法数字：抽成常量并放在文件顶部
- ✅ 组件超过 300 行考虑拆分

## 验证与测试

- 默认不要主动执行测试命令；只列出建议验证项或测试 case
- 只有用户明确要求“跑测试”“帮我验证”“跑单测”等，才执行对应命令
- 不要主动运行 Playwright / E2E / 浏览器自动化测试，除非用户明确点名 e2e、Playwright 或浏览器验证

## Git 提交规范

```
feat: 新增功能
fix: 修复问题
style: 样式调整
refactor: 代码重构
docs: 文档更新
test: 测试相关
chore: 构建/工具相关
```

示例：
```
feat: 新增微信模板切换功能
fix: 修复工作区文件重命名后 id 丢失
style: 调整设置面板暗黑主题配色
```
