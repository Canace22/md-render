---
name: md-render-blocknote-core
description: 在 renderer 里接入/改动 @narrative/blocknote-core（编辑器底层机制包）时的规范与避坑。涉及 buildSchema、EditorToolbar、编辑器焦点/全选、消费 dist、Arco→AntD、vite CJS interop。
---

# 接入 @narrative/blocknote-core

`packages/blocknote-core`（包名 `@narrative/blocknote-core`）是从剧本项目抽出的**通用 BlockNote 机制包**：schema 组装、工具栏、插入/过滤、查找、剪贴板。本项目按「**只消费 dist 构建产物**」方式接入（renderer 不引入包的 .ts 源码，符合 AGENTS.md 禁 TS）。

## 关键约定

- renderer 通过 vite/vitest 的 `resolve.alias` 把 `@narrative/blocknote-core` 指到 `packages/blocknote-core/dist/index.js`。
- 包内 UI 已从 Arco 改为 **AntD**（本项目 UI 库）。改包 UI 时继续用 antd 的 `Button/Divider/Dropdown/message`，**不要引回 Arco**。
- 改包源码（src/*.ts/tsx）后必须 **重建 dist**；tsc 不拷非 ts 资源（如 .css），需手动 `cp` 到 dist。

## 常见的坑

1. **buildSchema 默认排除 heading / quote**（剧本编辑器不要 `#`/`>` input rule）。本项目是 Markdown 编辑器，**必须传 `excludeDefaultBlocks: []`** 才能保留标题/引用。buildSchema 内部已合并 defaultBlockSpecs，调用时只传自定义块（如 codeBlock）。

2. **dist 是 CommonJS，vite 命名导入会失败**。包经 alias 指到 `packages/`（非 node_modules），默认不走 commonjs 插件，`import { EditorToolbar } from '@narrative/blocknote-core'` 报 "not exported"。修法：vite.config 加
   ```js
   build: { commonjsOptions: { include: [/blocknote-core[\\/]dist/, /node_modules/] } }
   ```

3. **barrel(index.js) 会 eager 加载所有组件**，含 FindBar 的样式。原本是 `.scss`，会让整个 app 构建要求 sass 工具链。已改为 **plain `.css`**（本项目用 CSS，不用 Sass）。再加组件时别引 scss。

4. **EditorToolbar 是数据驱动、无单项 disabled**。业务侧用 `entries` 表达按钮/分隔线/下拉；disabled 态在 wrapper 里让 `onItemClick` no-op。不聚焦编辑器的按钮（AI/复制/预览）要设 `skipFocusEditor: true`。

5. **全选快捷键要同时守住选区和焦点**。默认全文全选直接保留 BlockNote/Tiptap 原生行为，不接管 `keydown`；如果 document 级 `keyup` 会写 Zustand，要跳过对应快捷键，避免重渲染后焦点丢失。`Meta/Control` 的 `keyup` 可能落在编辑器容器外，不能只依赖容器的 capture 阻止；要让 document 监听复用同一份快捷键释放状态做判断。这份释放状态不能和两段式全选进度共用，pointer/blur 可以重置全选进度，但必须等 `A` 和对应修饰键都释放后才结束 keyup 保护。只有产品明确要求“首次当前行、长按或第二次全文”时，才在 `editor.domElement` 范围内接管：用公开的 `editor.transact()` + `TextSelection/AllSelection`，忽略单独的 Meta/Control keydown，后续 repeat 保持全文，并在 pointer、blur、其它按键或 editor 实例变化时重置。不要调用私有 `_tiptapEditor` API，也不要劫持链接框等浮层输入框的全选。

## 重建 dist 的命令（沙箱无 tsc bin 时）

```bash
cd packages/blocknote-core
node ../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p tsconfig.build.json
cp src/components/*.css dist/components/   # tsc 不拷 css
```
> 类型报错（缺 @types/react）不阻断 JS emit；dist 的 .js 才是 renderer 实际消费物。

## 验证

- 真正的端到端验证是 `pnpm build`（vite 构建），能跑通才说明 alias + CJS interop + 资源都对。
- 纯逻辑（filterSuggestionItemsByQuery / stringToBlockContent）可在 vitest node 环境直接从 `dist/utils/editorBlockInsert.js` 导入测试；**buildSchema/UI 依赖 @blocknote/core + scss，node 环境跑不动，只能靠 vite**。

相关：[[safe-change-workflow]] [[md-render-store]]
