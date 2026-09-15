# 粘贴图片落盘改成 Obsidian 可识别的相对路径

日期：2026-09-15

## 现象

编辑器里粘贴的图片，用 Obsidian 打开同一份 `.md` 时显示成原文链接，不能出图。链接形如：

```
![hash.png](local-media://users/canace/Documents/MdRender/素材/截图-xxx.png)
```

连续两张图还会粘在同一行：`...png)![...`

## 根因

`uploadFile` 为了在 Electron 里显示本地文件，会返回 `local-media://` 绝对路径。BlockNote 把这个 URL 原样写进磁盘 Markdown。Obsidian 不认自定义协议，也不认 percent-encode 后的中文路径。

## 改动

编辑器内存里继续用 `local-media://` 显示；进出磁盘时做一次转换：

1. 新增 `localMediaMarkdown.js`：相对路径 ↔ `local-media://`，连续图片补空行，跳过代码块 / `https:` / `data:`。
2. 保存（`contentToDiskMarkdown`、防抖落盘、图片回填落盘）走 `rewriteMarkdownImagesForDisk`。
3. 打开 Markdown 走 `rewriteMarkdownImagesForEditor`，再交给 BlockNote 解析。
4. 路径相对当前笔记，例如 `Projects/原稿/a.md` → `../../assets/截图.png`；中文不编码。

旧稿里的 `local-media://` 再保存时会改写成相对路径。

## 关键决策

- 不把 `local-media://` 写进 vault 文件；那是 Electron 显示协议，不是 Markdown 资源地址。
- 用相对当前笔记的路径，而不是 vault 根路径，这样标准 Markdown 和 Obsidian 都能解析。
