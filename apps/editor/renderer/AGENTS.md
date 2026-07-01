# Renderer Process 规范

React 前端：UI 渲染与状态管理。**禁止使用任何 Node.js API**，系统调用一律通过 `window.electron`。
通用规则（命名、进程边界、Git 等）见根 [`AGENTS.md`](../../../AGENTS.md)。

## 运行命令

- 开发：`pnpm dev`（从项目根目录）
- 测试：`pnpm test:unit`（从项目根目录）

## React 组件规范

- 使用函数式组件 + Hooks
- 单文件 **≤ 300 行**，超过必须拆分
- 组件必须保持**单一职责**，不得混合业务逻辑

## UI 规范

### 组件库

- **必须优先使用 Ant Design 组件库**，禁止自行实现已有组件
- 图标统一使用 `lucide-react`
- 富文本 / 编辑器统一使用 BlockNote

### UI 与业务边界（非常重要）

- **组件中禁止直接调用 IPC**
- UI 仅通过 Zustand Store 读取/触发状态变化
- 禁止在组件中编写业务逻辑，应抽取到 utils 或 hooks
- 资产创建、派生、关联、导入、发布等动作必须走 store action 或 utils/service，不要写成页面私有逻辑

## 状态管理（Zustand）

- 全局状态集中在 `src/store/useEditorStore.js`，**不新建其他全局 store**
- **共享状态必须使用 Zustand**，不得在组件间私自同步状态
- 异步逻辑使用 `async/await`，状态更新保持不可变
- 页面内临时状态使用 `useState`

## 性能与渲染

- 对列表 / 重渲染频繁组件使用 `React.memo`
- 使用 `useMemo` / `useCallback` 避免不必要渲染
- 禁止在 render 阶段创建 debounce / throttle（用 `useRef` 保存实例）
- 路由与大型组件使用懒加载

## 样式规范

- 样式写在 `src/styles/styles.css`，CSS 变量定义在 `design-tokens.css`
- 优先使用 CSS class，不写大段内联 style
- 主题颜色通过 CSS 变量控制，不硬编码
- 需要考虑暗色 / 亮色主题

## 错误处理

- 检查 IPC 返回值
- 使用 Ant Design `message.error` 显示错误
- 关键组件使用 ErrorBoundary
