---
name: md-render-excalidraw-canvas
description: 在 md-render 中新增或修改 Excalidraw 无限画布的场景同步、防抖保存、卡片插入、清空、视口和快捷键交互时使用。触发场景包括“无限画布抖动”“编辑被打断”“画布内容回退/丢失”“新建卡片闪现”“Excalidraw 无法交互”“画布保存竞争”。略主动。
---

# Excalidraw 无限画布

把画布内部场景、Zustand 持久化状态和外部 AI 写入当作三个不同的更新来源，避免它们相互覆盖。

## 定位边界

- components/CanvasSurface.jsx：Excalidraw API、临时 UI 状态、交互事件和防抖。
- utils/excalidrawCanvas.js：场景转换、卡片元素和持久化 appState 字段；保持纯函数。
- components/MarkdownEditor.jsx：把画布事件编排到 store，不复制场景逻辑。
- store/useEditorStore.js：清洗、去重和持久化 workspace.canvasState。

## 修改步骤

1. 先分清更新来自用户本地编辑、本地保存回声，还是 AI/store 的真实外部更新。
2. 在防抖窗口内以 Excalidraw 当前场景为真相源；有待保存本地场景时，不用旧 props 调用 updateScene 覆盖。
3. 保存前记录标准化场景签名。props 回传同一签名时当作本地回声，不重复 updateScene 或 scrollToContent。
4. 只有确认为外部场景更新时才同步 props；不要因普通 workspace 重渲染重置视口。
5. 插入卡片时保证 Excalidraw 元素 ID 唯一，并在必须立即可见时绕过防抖完成一次原子回写。
6. 清空或切换场景前处理待执行定时器和未落盘场景，避免旧内容被延迟回写“复活”。
7. 检查 document 级快捷键监听；画布获得焦点时，不得抢走 Excalidraw 的全选、删除、撤销等交互。

## 关键约束

- 场景签名只基于持久化字段，忽略选中态、指针态等瞬时 appState。
- 不要在每次 props 变化时无条件 scrollToContent，这会直接表现为画布抖动。
- onChange 可高频触发；不在其中直接持久化每一帧。
- Renderer 不使用 Node.js API，全局状态仍只走 useEditorStore.js。
- 遵循 safe-change-workflow：默认不主动跑测试或 E2E，改完列 10 条交互 case 与预期。

## 验证重点

至少覆盖：持续输入文字、短暂停顿后继续、拖拽、缩放/平移、插入卡片、连续插入同一素材、AI 外部更新、清空前存在待保存编辑、切换页面再返回、Cmd/Ctrl+A 全选画布元素。
