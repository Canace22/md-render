# 文档目录按文件类别筛选

日期：2026-09-15

## 现象

本地库里粘贴图、视频和 Markdown 混在同一棵目录树里。侧边栏「文档类型」以前按知识条目 `nodeType`（文档/书签/概念）统计，粘贴图默认也是「文档」，所以选「文档」挡不住 `Pasted image xxx.png`。

## 改动

「文档类型」改成按扩展名分三类，并记住上次选择：

- 文档：Markdown 及其余非图片、非视频文件
- 图片：`.png` / `.jpg` / `.svg` 等
- 视频：`.mp4` / `.webm` / `.mov` 等

选择写入 `useEditorStore.sidebarFileKind`，Electron 走 `sidebar_file_kind`，Web 走 `md-renderer-sidebar-file-kind`。刷新后仍是上次的类别。知识条目类型（书签/概念）仍在，有这类文件时显示为「知识类型」。
