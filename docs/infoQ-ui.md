### InfoQ 风格 Design Token 体系

这套 Token 的核心逻辑是：**通过大间距制造呼吸感，通过高对比度字体建立层级**。

#### 1. 色彩 Tokens (Color Palette)

InfoQ 的配色非常克制，主要依靠黑白灰构建骨架，用蓝色作为功能性强调色。

```
{
  "color": {
    "brand": {
      "primary": { "value": "#0052CC" }, 
      "primary-hover": { "value": "#003E99" }
    },
    "text": {
      "primary": { "value": "#242424" }, 
      "secondary": { "value": "#666666" }, 
      "tertiary": { "value": "#999999" }, 
      "inverse": { "value": "#FFFFFF" }
    },
    "background": {
      "main": { "value": "#FFFFFF" },
      "surface": { "value": "#F7F8FA" }, 
      "code-block": { "value": "#F5F7FA" }
    },
    "border": {
      "light": { "value": "#E5E6EB" },
      "divider": { "value": "#DCDFE6" }
    }
  }
}
```

#### 2. 排版 Tokens (Typography)

这是 InfoQ 风格的灵魂。注意其**行高（Line Height）**通常较大，以保证长文阅读的舒适度。

```
{
  "typography": {
    "fontFamily": {
      "base": { "value": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" },
      "code": { "value": "'Menlo', 'Monaco', 'Courier New', monospace" }
    },
    "fontSize": {
      "heading-1": { "value": "24px" }, 
      "heading-2": { "value": "20px" },
      "heading-3": { "value": "18px" },
      "body-large": { "value": "17px" }, 
      "body-medium": { "value": "15px" },
      "caption": { "value": "12px" }
    },
    "fontWeight": {
      "regular": { "value": "400" },
      "medium": { "value": "500" },
      "bold": { "value": "700" }
    },
    "lineHeight": {
      "tight": { "value": "1.3" },
      "base": { "value": "1.6" }, 
      "relaxed": { "value": "1.8" } 
    }
  }
}
```

#### 3. 间距与布局 Tokens (Spacing & Layout)

InfoQ 的排版之所以看起来“不累”，是因为它使用了 **8pt 栅格系统**，且段落间距非常大。

```
{
  "spacing": {
    "xs": { "value": "4px" },
    "sm": { "value": "8px" },
    "md": { "value": "16px" },
    "lg": { "value": "24px" }, 
    "xl": { "value": "32px" }, 
    "xxl": { "value": "48px" } 
  },
  "layout": {
    "container-width": { "value": "720px" }, 
    "paragraph-margin-bottom": { "value": "24px" } 
  }
}
```

#### 4. 组件语义 Tokens (Semantic Tokens)

将上述基础 Token 组合成具体组件的样式，这是直接应用在 Figma 组件中的层级。

```
{
  "component": {
    "article": {
      "title": {
        "value": {
          "fontFamily": "{typography.fontFamily.base}",
          "fontSize": "{typography.fontSize.heading-1}",
          "fontWeight": "{typography.fontWeight.bold}",
          "color": "{color.text.primary}",
          "lineHeight": "{typography.lineHeight.tight}"
        }
      },
      "subtitle": {
        "value": {
          "fontSize": "{typography.fontSize.heading-3}",
          "fontWeight": "{typography.fontWeight.medium}",
          "color": "{color.text.secondary}",
          "marginTop": "{spacing.xl}",
          "marginBottom": "{spacing.md}"
        }
      },
      "body": {
        "value": {
          "fontSize": "{typography.fontSize.body-large}",
          "color": "{color.text.primary}",
          "lineHeight": "{typography.lineHeight.relaxed}",
          "marginBottom": "{spacing.paragraph-margin-bottom}"
        }
      },
      "quote": {
        "value": {
          "borderLeft": "4px solid {color.brand.primary}",
          "paddingLeft": "{spacing.md}",
          "color": "{color.text.secondary}",
          "fontStyle": "italic"
        }
      }
    }
  }
}
```

### 如何在 Figma 中使用这套 Token

1. **安装插件**：在 Figma 中打开 **Tokens Studio**。
2. **导入 JSON**：将上面的 JSON 代码块分别复制到插件的编辑器中。
3. **应用样式**：
    - **正文**：选中文字图层，应用 `component.article.body`。你会发现文字自动变成了 17px，行高 1.8，颜色深灰，且自带底部间距。
    - **小标题**：应用 `component.article.subtitle`，它会自动居中（如果你加了 Alignment Token）或加粗变色。
4. **一键换肤**：如果你想把 InfoQ 风格改成“暗黑模式”，只需修改 `color.background.main` 为黑色，`color.text.primary` 为白色，所有应用了 Token 的文字和背景都会瞬间切换。
