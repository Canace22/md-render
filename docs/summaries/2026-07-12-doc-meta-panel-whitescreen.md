# 元数据面板白屏修复 — 改动说明

日期：2026-07-12

## 背景

工作区文档打开后，点击「元数据」按钮出现白屏。点击后渲染的 `DocMetaPanel.jsx` 在 JSX 中调用了 `hasElectronSelectCoverImage()` 和 `hasElectronDb()` 两个函数，但它们既未从 `electronBridge.js` 导入，也未在文件内定义——`electronBridge.js` 实际导出的是 `hasDbBridge`，且没有封面选择能力的探测函数。渲染一执行到这些调用就抛 `ReferenceError`，导致 React 组件树卸载，页面白屏。

`KnowledgeMetaPanel.jsx`（知识节点元数据面板）存在同样的 `hasElectronDb` 漏网引用，会在渲染知识节点元数据时白屏。

## 改动概述

最小化修复，仅动 3 个文件，无新增行为、无外部契约变更。

- **`services/electronBridge.js`**：新增导出 `hasCoverImagePicker()`，探测 `window.electronAPI.selectCoverImage` 是否可用，语义对齐已有的 `hasFilePickerBridge` / `hasDbBridge`。
- **`components/DocMetaPanel.jsx`**：
  - `hasElectronSelectCoverImage()` → `hasCoverImagePicker()`（封面「选择图片」按钮的显示门控）
  - `hasElectronDb()` → `hasDbBridge()`（反向链接区、版本历史区的显示门控，2 处）
  - 补齐 `hasCoverImagePicker` import。
- **`components/KnowledgeMetaPanel.jsx`**：`hasElectronDb()` → `hasDbBridge()`（2 处）；该文件已 import 过 `hasDbBridge`，无需改 import。

## 关键决策

- **复用已有 bridge 探测函数**而非在组件里重新定义能力判断：`hasDbBridge` 与 store 内私有的 `hasElectronDb`（`typeof window.electronAPI?.db === 'object'`）语义完全一致，直接替换即可，避免重复逻辑。
- **新增 `hasCoverImagePicker` 放在 electronBridge 统一层**，与其他 `has*Bridge` 探测函数并列，保持「环境能力探测集中在 bridge」的既有约定，组件不直接摸 `window.electronAPI`。

## 影响范围

| 层 | 文件 |
|----|------|
| Bridge | `services/electronBridge.js`（新增 `hasCoverImagePicker`） |
| 组件 | `components/DocMetaPanel.jsx`（import + 3 处调用）、`components/KnowledgeMetaPanel.jsx`（2 处调用） |

外部契约未变：`window.electronAPI` 字段、workspace 节点结构、IPC channel 均保持兼容。

## 验证

`pnpm test:unit`：257 passed / 7 failed。7 条失败为预存基线（platform-variant / excalidraw / sqlite 沙盒环境等 5 文件），与本轮改动无关，改动前后一致。

10 条输入用例预期（环境 = 有无 `window.electronAPI`）：

| # | 场景 | 预期 |
|---|------|------|
| 1 | Web 端（无 electronAPI）点元数据 | 正常展开，不白屏 |
| 2 | Electron 端点元数据 | 正常展开 |
| 3 | Web 端封面区 | 不显示「选择图片」按钮 |
| 4 | Electron 端封面区 | 显示「选择图片」 |
| 5 | Web 端反向链接区 | 不渲染 |
| 6 | Electron 有版本历史 | 渲染版本历史 |
| 7 | Electron 无版本 | 版本区不渲染 |
| 8 | Web 端打开知识节点元数据 | KnowledgeMetaPanel 正常，不白屏 |
| 9 | 封面填 URL | 预览图正常，无崩溃 |
| 10 | 切换选中文档再开元数据 | 每次正常，无残留报错 |

## 已知问题 / 后续

- 全量单测基线失败 5 文件 7 条为沙盒环境问题，与本轮无关。
- 建议后续给 `DocMetaPanel` / `KnowledgeMetaPanel` 补一个「面板能渲染不抛错」的冒烟测试，这类未定义引用可在单测阶段拦截，避免再次白屏。
