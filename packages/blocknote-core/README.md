# @narrative/blocknote-core

通用 BlockNote 编辑器

提供编辑器**机制**（schema 组装、工具栏、查找、剪贴板、焦点/选中/全选/右键、块插入），领域知识由业务侧经 props /
参数注入。

## 设计原则

机制进包，领域留外，中间用扩展点连接。

## 提供的能力

### Schema 组装

`buildSchema` —— 把「排除默认块 + 合并默认规格 + create」收口。块定义由调用方传入，
返回类型精确推导，不退化为 any。

```ts
import { buildSchema } from '@narrative/blocknote-core';

const schema = buildSchema({
  blockSpecs: { myBlock: myBlockSpec() },     // 业务自定义块
  inlineContentSpecs: { mention: mentionSpec }, // 业务自定义内联（自动补 text/link）
  excludeDefaultBlocks: ['heading', 'quote'],  // 默认即此值
});
```

### 工具栏（数据驱动）

`EditorToolbar` —— 内容完全由 `entries` 决定；短标签转换通过 `getShortLabel` 注入。

```tsx
<EditorToolbar
  entries={entries}
  onFocusEditor={focus}
  getShortLabel={myShortLabelMap}  // 可选，默认恒等
/>
```

### 块插入机制

`insertOrUpdateBlock` / `insertNewBlockOnly` / `stringToBlockContent` /
`filterSuggestionItemsByQuery` —— 斜杠菜单、工具栏复用的插入与过滤逻辑。
菜单项本身由业务侧定义。

### 基础编辑能力

- 查找栏：`FindBar`
- 剪贴板：`ClipboardFormattingToolbarButtons`、`useClipboardFeedback`、
  `showClipboardActionMessage`
- 键盘 / 选区：`isSelectAllShortcut`、`resolveBlockInlineContentRange`、
  `shouldPromoteBlockSelectionToFullSelection`

## 不在包内（属于业务侧）

剧本块定义（`scriptHeading`/`npcDialogue` 等）、实体提及、flow unit、AI 补全、
剧本解析（`blocksToScene`/`parseSceneToBlocks`）、全局状态读取。这些通过 props /
参数注入到上面的机制中。

## 开发

```bash
npm run build      # tsc 构建到 dist
npm run typecheck  # 仅类型检查
```

renderer 通过 vite / vitest alias 指向本包 `src` 源码；类型解析（tsconfig paths）
指向包根（读 `dist/*.d.ts`），故改动后需 `npm run build` 刷新声明。
