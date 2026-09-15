import { describe, expect, it } from 'vitest';
import {
  encodeLocalMediaPath,
  rewriteMarkdownImagesForDisk,
  rewriteMarkdownImagesForEditor,
  toDiskImageSrc,
  toEditorImageSrc,
} from '../renderer/src/utils/localMediaMarkdown.js';

const PROJECT_ROOT = '/Users/canace/Documents/MdRender';
const NESTED_NOTE = 'Projects/原稿/判断模型降智的方式.md';
const ROOT_NOTE = 'readme.md';
const CONTEXT_NESTED = { projectRootPath: PROJECT_ROOT, noteRelativePath: NESTED_NOTE };
const CONTEXT_ROOT = { projectRootPath: PROJECT_ROOT, noteRelativePath: ROOT_NOTE };

const assetAbs = (relativePath) => `${PROJECT_ROOT}/${relativePath}`;
const localMedia = (relativePath) => `local-media://${encodeLocalMediaPath(assetAbs(relativePath))}`;

describe('local-media markdown round-trip', () => {
  it('粘贴 PNG 后保存成相对当前笔记的路径，不写 local-media', () => {
    const src = localMedia('assets/截图-2026-09-15T05-58-12-110Z-ykbg.png');
    const markdown = `![bc9628ae.png](${src})`;
    const disk = rewriteMarkdownImagesForDisk(markdown, CONTEXT_NESTED);
    expect(disk).toBe('![bc9628ae.png](../../assets/截图-2026-09-15T05-58-12-110Z-ykbg.png)');
    expect(disk).not.toContain('local-media:');
  });

  it('重新打开时把相对路径转回 local-media，编辑器能加载', () => {
    const disk = '![截图](../../assets/foo.png)';
    const editor = rewriteMarkdownImagesForEditor(disk, CONTEXT_NESTED);
    expect(editor).toBe(`![截图](${localMedia('assets/foo.png')})`);
  });

  it('旧稿里的 local-media 绝对路径再保存时改成相对路径', () => {
    const src = 'local-media://users/canace/Documents/MdRender/%E7%B4%A0%E6%9D%90/%E6%88%AA%E5%9B%BE-old.png';
    const disk = rewriteMarkdownImagesForDisk(`![old](${src})`, CONTEXT_NESTED);
    expect(disk).toBe('![old](../../素材/截图-old.png)');
  });

  it('vault 根目录笔记不写 ../', () => {
    expect(toDiskImageSrc(localMedia('assets/foo.png'), PROJECT_ROOT, ROOT_NOTE)).toBe('assets/foo.png');
    const editor = rewriteMarkdownImagesForEditor('![x](assets/foo.png)', CONTEXT_ROOT);
    expect(editor).toBe(`![x](${localMedia('assets/foo.png')})`);
  });

  it('连续两张图落盘时拆成两行', () => {
    const first = localMedia('assets/a.png');
    const second = localMedia('assets/b.png');
    const disk = rewriteMarkdownImagesForDisk(`![a](${first})![b](${second})`, CONTEXT_NESTED);
    expect(disk).toBe('![a](../../assets/a.png)\n\n![b](../../assets/b.png)');
  });

  it('外链 https 保持原样', () => {
    const markdown = '![cover](https://cdn.example.com/a.png)';
    expect(rewriteMarkdownImagesForDisk(markdown, CONTEXT_NESTED)).toBe(markdown);
    expect(rewriteMarkdownImagesForEditor(markdown, CONTEXT_NESTED)).toBe(markdown);
  });

  it('内嵌 data URL 保持原样', () => {
    const markdown = '![x](data:image/png;base64,AAA)';
    expect(rewriteMarkdownImagesForDisk(markdown, CONTEXT_NESTED)).toBe(markdown);
    expect(rewriteMarkdownImagesForEditor(markdown, CONTEXT_NESTED)).toBe(markdown);
  });

  it('无项目根时不改写相对路径', () => {
    const src = localMedia('assets/foo.png');
    const markdown = `![x](${src})`;
    expect(rewriteMarkdownImagesForDisk(markdown, {})).toBe(markdown);
    expect(rewriteMarkdownImagesForEditor(markdown, {})).toBe(markdown);
  });

  it('中文文件名落盘不 percent-encode', () => {
    const src = localMedia('素材/截图-中文.png');
    expect(toDiskImageSrc(src, PROJECT_ROOT, NESTED_NOTE)).toBe('../../素材/截图-中文.png');
    expect(toDiskImageSrc(src, PROJECT_ROOT, NESTED_NOTE)).not.toContain('%');
  });

  it('代码块里的图片语法不改写', () => {
    const src = localMedia('assets/foo.png');
    const markdown = ['```md', `![x](${src})`, '```'].join('\n');
    expect(rewriteMarkdownImagesForDisk(markdown, CONTEXT_NESTED)).toBe(markdown);
  });
});
