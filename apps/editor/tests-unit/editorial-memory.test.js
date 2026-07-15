import { describe, expect, it } from 'vitest';
import {
  EDITORIAL_MEMORY_DOC_NAME,
  MEMORY_CATEGORIES,
  appendMemoryEntry,
  buildMemoryTemplate,
  findEditorialMemoryFile,
} from '../renderer/src/core/agent/editorialMemory.js';
import { executeTool } from '../renderer/src/core/agent/toolRegistry.js';
import { buildAgentArtifactPayload } from '../renderer/src/core/agent/artifactUtils.js';

const call = (name, args) => ({
  id: 'call-1',
  function: { name, arguments: JSON.stringify(args ?? {}) },
});

describe('记忆文档模板与查找', () => {
  it('模板包含四个固定小节', () => {
    const template = buildMemoryTemplate();
    for (const heading of Object.values(MEMORY_CATEGORIES)) {
      expect(template).toContain(`## ${heading}`);
    }
  });

  it('按名称找记忆文件，兼容 .md 后缀，忽略文件夹', () => {
    const files = [
      { id: 'a', type: 'file', name: '别的.md' },
      { id: 'b', type: 'folder', name: `${EDITORIAL_MEMORY_DOC_NAME}` },
      { id: 'c', type: 'file', name: `${EDITORIAL_MEMORY_DOC_NAME}.md` },
    ];
    expect(findEditorialMemoryFile(files)?.id).toBe('c');
    expect(findEditorialMemoryFile([])).toBeNull();
  });
});

describe('appendMemoryEntry', () => {
  it('空内容时从模板创建并写入首条', () => {
    const result = appendMemoryEntry('', {
      category: 'experience',
      text: '具体场景标题点击率高',
      dateKey: '2026-07-11',
    });
    expect(result.ok).toBe(true);
    expect(result.content).toContain('- 2026-07-11：具体场景标题点击率高');
  });

  it('追加到中间小节末尾，不越过下一节标题', () => {
    const base = buildMemoryTemplate();
    const { content } = appendMemoryEntry(base, {
      category: 'persona',
      text: '喜欢第一人称工程实践',
      dateKey: '2026-07-11',
    });
    const personaIndex = content.indexOf('## 作者写作画像');
    const entryIndex = content.indexOf('- 2026-07-11：喜欢第一人称工程实践');
    const nextSectionIndex = content.indexOf('## 平台经验库');
    expect(entryIndex).toBeGreaterThan(personaIndex);
    expect(entryIndex).toBeLessThan(nextSectionIndex);
  });

  it('多行文本续行缩进，保持一条条目', () => {
    const { content } = appendMemoryEntry('', {
      category: 'retro',
      text: '第一行结论\n第二行补充',
      dateKey: '2026-07-11',
    });
    expect(content).toContain('- 2026-07-11：第一行结论\n  第二行补充');
  });

  it('小节被删掉时在文末补回，不丢内容', () => {
    const { content } = appendMemoryEntry('# 编辑部记忆\n\n## 作者知识体系\n', {
      category: 'retro',
      text: '一条复盘',
      dateKey: '2026-07-11',
    });
    expect(content).toContain('## 复盘日志');
    expect(content).toContain('- 2026-07-11：一条复盘');
    expect(content).toContain('## 作者知识体系');
  });

  it('拒绝未知分类和空内容', () => {
    expect(appendMemoryEntry('', { category: 'nope', text: 'x' }).ok).toBe(false);
    expect(appendMemoryEntry('', { category: 'retro', text: '  ' }).ok).toBe(false);
  });
});

describe('记忆工具执行器（假 host）', () => {
  it('read：记忆不存在时给可行动提示', async () => {
    const result = await executeTool(call('read_editorial_memory'), {
      readEditorialMemory: async () => null,
    });
    expect(result).toContain('还不存在');
    expect(result).toContain('update_editorial_memory');
  });

  it('read：存在时返回 JSON 内容', async () => {
    const result = await executeTool(call('read_editorial_memory'), {
      readEditorialMemory: async () => ({ id: 'm1', name: '编辑部记忆.md', content: '## 平台经验库' }),
    });
    expect(JSON.parse(result).id).toBe('m1');
  });

  it('update：非法分类不触达 host', async () => {
    let touched = false;
    const result = await executeTool(call('update_editorial_memory', { category: 'bad', text: 'x' }), {
      updateEditorialMemory: async () => { touched = true; },
    });
    expect(result).toContain('不支持的记忆分类');
    expect(touched).toBe(false);
  });

  it('update：透传 host 结果文案', async () => {
    const result = await executeTool(
      call('update_editorial_memory', { category: 'experience', text: '认知升级类分享率高' }),
      { updateEditorialMemory: async ({ category }) => `已把新经验追加到「${MEMORY_CATEGORIES[category]}」。` },
    );
    expect(result).toBe('已把新经验追加到「平台经验库」。');
  });
});

describe('.agent 元数据目录（隐藏工作区）', () => {
  const workspace = {
    id: 'root',
    type: 'folder',
    name: '工作区',
    children: [
      { id: 'doc-1', type: 'file', name: '正常笔记.md', content: 'x', updatedAt: 100 },
      {
        id: 'agent-folder',
        type: 'folder',
        name: '.agent',
        agentMetaFolder: true,
        children: [
          { id: 'memory-1', type: 'file', name: '编辑部记忆.md', content: '## 平台经验库', updatedAt: 999 },
        ],
      },
    ],
  };

  it('isHiddenWorkspaceNode 识别标记和点开头命名', async () => {
    const { isHiddenWorkspaceNode } = await import('../renderer/src/store/workspaceUtils.js');
    expect(isHiddenWorkspaceNode({ type: 'folder', name: '.agent' })).toBe(true);
    expect(isHiddenWorkspaceNode({ type: 'folder', name: '别的', agentMetaFolder: true })).toBe(true);
    expect(isHiddenWorkspaceNode({ type: 'folder', name: '笔记本' })).toBe(false);
  });

  it('collectHiddenFileIds 只收隐藏子树的文件', async () => {
    const { collectHiddenFileIds } = await import('../renderer/src/store/workspaceUtils.js');
    const ids = collectHiddenFileIds(workspace);
    expect(ids.has('memory-1')).toBe(true);
    expect(ids.has('doc-1')).toBe(false);
  });

  it('findAgentMetaFile 在 .agent 目录里按名找到记忆', async () => {
    const { findAgentMetaFile } = await import('../renderer/src/store/workspaceUtils.js');
    expect(findAgentMetaFile(workspace, EDITORIAL_MEMORY_DOC_NAME)?.id).toBe('memory-1');
    expect(findAgentMetaFile({ id: 'root', type: 'folder', children: [] }, EDITORIAL_MEMORY_DOC_NAME)).toBeNull();
  });

  it('collectRecentFiles 不把记忆等元数据算进最近文档', async () => {
    const { collectRecentFiles } = await import('../renderer/src/store/workspaceUtils.js');
    const recent = collectRecentFiles(workspace, 5);
    expect(recent.map((f) => f.id)).toEqual(['doc-1']);
  });
});

describe('editorial_review 产出物类型', () => {
  it('可构建审稿报告 payload，默认名与状态正确', () => {
    const result = buildAgentArtifactPayload({
      artifactType: 'editorial_review',
      content: '## 最终结论\n是否建议发布：建议',
    });
    expect(result.ok).toBe(true);
    expect(result.artifact.label).toBe('审稿报告');
    expect(result.artifact.name).toBe('编辑部审稿报告');
    expect(result.artifact.meta.draftStatus).toBe('collecting');
  });
});
