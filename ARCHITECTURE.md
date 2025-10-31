# 实现原理

Markdown 渲染器采用两步流程：**解析 → 渲染**。解析器将 Markdown 文本转换为结构化的 token 数组，渲染器将 token 数组转换为最终的 HTML。

## 工作流程图

```mermaid
graph TD
    A[用户输入 Markdown 文本] --> B[MarkdownParser 解析]
    B --> C{识别语法规则}
    C --> D1[标题 token]
    C --> D2[段落 token]
    C --> D3[列表 token]
    C --> D4[代码块 token]
    C --> D5[链接/强调 token]
    D1 --> E[Token 数组]
    D2 --> E
    D3 --> E
    D4 --> E
    D5 --> E
    E --> F[MarkdownRenderer 渲染]
    F --> G[生成 HTML]
    G --> H[显示在预览区]
    
    style A fill:#4ec9b0
    style H fill:#007acc
    style E fill:#d7ba7d
```

## 执行步骤序列图

```mermaid
sequenceDiagram
    participant U as 用户
    participant HTML as index.html
    participant App as app.js
    participant Parser as parser.js
    participant Renderer as renderer.js
    
    U->>HTML: 打开页面
    HTML->>App: 加载并初始化
    App->>HTML: 绑定输入事件监听
    
    U->>HTML: 输入/修改 Markdown 文本
    HTML->>App: 触发 input 事件
    App->>Parser: 调用 parse(text)
    Parser->>Parser: 逐行分析语法
    Parser->>Parser: 生成 token 数组
    Parser-->>App: 返回 tokens
    
    App->>Renderer: 调用 render(tokens)
    Renderer->>Renderer: 遍历 tokens
    Renderer->>Renderer: 转换每个 token 为 HTML
    Renderer->>Renderer: 处理行内元素（链接、强调等）
    Renderer-->>App: 返回 HTML 字符串
    
    App->>HTML: 更新预览区域
    HTML-->>U: 显示渲染结果
```

## 核心模块说明

### 1. MarkdownParser（解析器）

负责将 Markdown 文本解析为结构化的 token 数组。

**主要方法：**

- `parse(text)`: 主解析方法，将整个文本解析为 token 数组
- `parseHeading(line)`: 解析标题（以 # 开头）
- `parseCodeBlock(lines, startIndex)`: 解析代码块（被 ``` 包围）
- `parseList(lines, startIndex, listType, baseIndent)`: 解析列表（有序/无序），支持递归解析嵌套列表
- `parseInline(text)`: 解析行内元素（链接、强调、代码等）

**解析策略：**
- 逐行扫描，根据行首特征判断语法类型
- 代码块和列表需要多行处理，使用循环收集完整内容
- 列表通过缩进层级递归解析嵌套结构
- 行内元素使用正则表达式匹配

### 2. MarkdownRenderer（渲染器）

负责将 token 数组转换为 HTML 字符串。

**主要方法：**

- `render(tokens)`: 主渲染方法，遍历 tokens 并生成 HTML
- `renderToken(token)`: 根据 token 类型分发到具体的渲染方法
- `renderHeading(token)`: 渲染标题，支持行内元素
- `renderParagraph(token)`: 渲染段落，处理行内格式
- `renderCodeBlock(token)`: 渲染代码块，进行 HTML 转义
- `renderList(token)`: 渲染列表，递归渲染嵌套列表（通过 item.children）
- `renderBlockquote(token)`: 渲染引用块
- `escapeHtml(text)`: HTML 转义，防止 XSS 攻击

**渲染策略：**
- 每个 token 类型都有对应的渲染方法
- 行内元素（链接、强调等）在渲染段落和标题时处理
- 代码块内容需要 HTML 转义，避免被解析为 HTML

### 3. app.js（应用逻辑）

连接用户输入和渲染输出的桥梁。

**功能：**

- 监听文本输入框的 `input` 事件
- 调用解析器和渲染器处理文本
- 将生成的 HTML 更新到预览区域
- 页面加载时执行一次初始渲染

## 解析流程详解

### Token 类型

解析器支持以下 token 类型：

| Token 类型 | 示例 | 说明 |
|-----------|------|------|
| `heading` | `{ type: 'heading', level: 1, content: '标题' }` | 标题，level 为 1-6 |
| `paragraph` | `{ type: 'paragraph', content: '段落文本' }` | 普通段落 |
| `code-block` | `{ type: 'code-block', language: 'js', content: '代码' }` | 代码块 |
| `list` | `{ type: 'list', listType: 'unordered', items: [{content, children?}] }` | 列表，支持嵌套（items 中的 item 可包含 children 数组） |
| `blockquote` | `{ type: 'blockquote', content: '引用内容' }` | 引用块 |
| `hr` | `{ type: 'hr' }` | 水平分割线 |
| `empty` | `{ type: 'empty' }` | 空行 |

### 解析优先级

解析器按照以下优先级识别语法：

1. **代码块**（```） - 最高优先级，避免内容被其他规则匹配
2. **引用**（>） - 块级元素
3. **标题**（#） - 块级元素
4. **列表**（-、*、+、数字） - 块级元素，支持多行
5. **水平分割线**（---） - 块级元素
6. **段落** - 默认处理，包含行内元素解析

### 行内元素处理

行内元素在渲染阶段处理，解析顺序：

1. **代码**（`） - 优先处理，避免与其他语法冲突
2. **粗体+斜体**（***） - 组合格式
3. **粗体**（**）
4. **斜体**（*）
5. **链接**（[text](url)）

## 渲染流程详解

### HTML 生成策略

1. **块级元素**：每个 token 对应一个 HTML 块级元素
2. **行内元素**：在渲染块级元素时，递归调用 `parseInline()` 处理内容
3. **HTML 转义**：代码块内容必须转义，防止注入攻击

### 样式支持

渲染器输出带有语义化的 HTML 标签和 CSS 类名：

- 代码块：`<figure class="code-block" data-code="..."><div class="code-header"><span class="code-lang">{language}</span><button class="code-copy-btn">...</button></div><pre><code class="language-{language}">...` - 接近 VS Code 预览的结构，配合 highlight.js 实现语法高亮，并内置复制按钮
- 链接：`<a href="...">` - 标准 HTML 链接
- 其他：标准 HTML5 语义化标签

### UI 风格（接近 Markdown All in One）

1. **代码块头部**：在代码块上方增加 `.code-header`，右侧显示语言（来自围栏语言标记）。
2. **代码语法高亮**：集成 highlight.js（v11.9.0），使用 `github-dark-dimmed` 主题，适配暗黑界面。`app.js` 在渲染后调用 `hljs.highlightAll()`。
3. **代码复制按钮**：在 `.code-header` 右侧加入 `.code-copy-btn`，点击复制 `figure.code-block` 的 `data-code` 内容，成功后按钮显示“已复制”。
4. **引用块**：采用浅蓝边框与淡色背景，提升可读性。
5. **版心宽度**：默认预览全宽显示；如需居中版心，可在 `#markdown-output` 添加 `max-width` 与 `margin: 0 auto`（当前默认未启用）。

### 代码块复制实现

1. **数据来源**：渲染时使用原始代码文本存入 `figure.code-block` 的 `data-code` 属性。
2. **安全编码**：通过 `encodeURIComponent` 编码（`renderer.encodeForDataAttr`），事件侧用 `decodeURIComponent` 还原。
3. **事件绑定**：`app.js` 在每次渲染后执行 `bindCopyButtons()`，为 `.code-copy-btn` 绑定点击处理；优先使用 `navigator.clipboard.writeText`，失败时降级为 `execCommand('copy')`。
4. **交互反馈**：复制成功为按钮添加 `copied` 类名，2 秒后移除；样式在 `styles.css` 中控制。

### 嵌套列表实现

解析器支持多层嵌套列表，通过缩进层级识别嵌套关系：

1. **缩进识别**：通过前导空格数量判断列表层级，每2个或更多空格为一个缩进层级
2. **递归解析**：`parseList()` 方法接受 `baseIndent` 参数，递归解析嵌套列表
3. **数据结构**：每个列表项（item）可以包含 `children` 数组，存储完整的嵌套列表 token
4. **混合类型**：支持同一文档中混合使用有序和无序列表，每个嵌套列表保持独立类型
5. **渲染策略**：`renderList()` 递归渲染 `item.children`，确保每个嵌套列表使用正确的标签（`<ul>` 或 `<ol>`）

**示例结构**：
```javascript
{
  type: 'list',
  listType: 'unordered',
  items: [
    { content: '一级列表项', children: [
      {
        type: 'list',
        listType: 'ordered',
        items: [{ content: '二级有序列表项' }]
      }
    ]}
  ]
}
```

### 空白与间距策略

为获得舒适、统一的版式，本项目对空白和间距做了如下约定：

1. **空行渲染为 `<br>`**：空行 token（`empty`）在渲染阶段输出 `<br>` 标签，提供适当的段落分隔。

2. **段落与块级元素的外边距**：
   - 段落：上下 `0.8em` - 提供舒适的段落间距
   - 列表与列表项：列表上下 `0.8em`、列表项上下 `0.25em`
   - 代码块：上下 `0.8em` - 与其他块级元素保持一致
   - 引用：上下 `0.8em` - 与其他块级元素保持一致
   - 分割线：上下 `1em` - 提供更明显的视觉分隔

3. **标题间距重新校准**（确保层次分明）：
   - H1：`0.8em 0 0.4em 0`（上边距 0.8em，下边距 0.4em）
   - H2：`0.7em 0 0.3em 0`（上边距 0.7em，下边距 0.3em）
   - H3：`0.6em 0 0.3em 0`（上边距 0.6em，下边距 0.3em）
   - H4：`0.5em 0 0.2em 0`（上边距 0.5em，下边距 0.2em）
   - H5：`0.4em 0 0.2em 0`（上边距 0.4em，下边距 0.2em）
   - H6：`0.3em 0 0.2em 0`（上边距 0.3em，下边距 0.2em）

这些数值在 `styles.css` 中定义，旨在提升可读性，提供舒适的视觉间距，同时保持文档结构的清晰层次。

## 设计模式应用

1. **职责分离**：Parser 负责解析，Renderer 负责渲染，互不干扰
2. **策略模式**：`renderToken()` 根据 token 类型选择不同的渲染策略
3. **函数式编程**：各模块都是纯函数，无副作用，易于测试
4. **单一职责**：每个方法只做一件事，函数尽量小且可复用

## 扩展性

### 添加新的语法支持

1. **在 Parser 中添加识别逻辑**：
   ```javascript
   // 在 parse() 方法中添加新的条件判断
   if (isNewSyntax(line)) {
       return this.parseNewSyntax(lines, i);
   }
   ```

2. **定义新的 Token 类型**：
   ```javascript
   {
       type: 'new-syntax',
       // ... 相关属性
   }
   ```

3. **在 Renderer 中添加渲染逻辑**：
   ```javascript
   case 'new-syntax':
       return this.renderNewSyntax(token);
   ```

### 性能优化建议

- 使用防抖（debounce）减少频繁渲染和高亮处理
- 大文档可以考虑增量解析
- 代码语法高亮已集成 highlight.js，如需自定义可以：
  - 更换主题：修改 `index.html` 中的 CSS 链接
  - 限制语言支持：引入特定语言的子集以减少体积
  - 使用 CDN 或本地文件：当前使用 CDN，离线环境需要下载到本地

