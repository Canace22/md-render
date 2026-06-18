import { describe, expect, it } from 'vitest';
import {
  createDefaultWorkspace,
  resolveLocalProjectCreateTarget,
} from '../renderer/src/store/workspaceUtils.js';

const makeLocalFolder = (projectRootPath, relativePath, name, children = [], extra = {}) => ({
  id: `project:${projectRootPath}:folder:${relativePath}`,
  type: 'folder',
  name,
  relativePath,
  projectRootPath,
  children,
  ...extra,
});

const makeLocalFile = (projectRootPath, relativePath, name) => ({
  id: `project:${projectRootPath}:file:${relativePath}`,
  type: 'file',
  name,
  relativePath,
  projectRootPath,
  content: '',
});

describe('resolveLocalProjectCreateTarget', () => {
  const fallbackProjectRootPath = '/Users/test/Documents/MdRender';
  const importedProjectRootPath = '/Users/test/Desktop/notes';
  const projectFolder = makeLocalFolder(
    importedProjectRootPath,
    '',
    'notes',
    [
      makeLocalFolder(
        importedProjectRootPath,
        'articles',
        'articles',
        [makeLocalFile(importedProjectRootPath, 'articles/intro.md', 'intro.md')],
      ),
    ],
    { localProjectRoot: true },
  );

  const workspace = {
    ...createDefaultWorkspace(),
    children: [
      projectFolder,
      { id: 'folder-ideas', type: 'folder', name: '想法', children: [] },
    ],
  };

  it('在导入项目根目录下创建', () => {
    const target = resolveLocalProjectCreateTarget(
      workspace,
      projectFolder.id,
      fallbackProjectRootPath,
    );

    expect(target).toEqual({
      parentFolderId: projectFolder.id,
      projectRootPath: importedProjectRootPath,
      parentRelativePath: '',
      parentFolder: projectFolder,
    });
  });

  it('在导入项目子目录下创建', () => {
    const articlesFolder = projectFolder.children[0];
    const target = resolveLocalProjectCreateTarget(
      workspace,
      articlesFolder.id,
      fallbackProjectRootPath,
    );

    expect(target).toEqual({
      parentFolderId: articlesFolder.id,
      projectRootPath: importedProjectRootPath,
      parentRelativePath: 'articles',
      parentFolder: articlesFolder,
    });
  });

  it('选中文件时回退到父目录', () => {
    const articleFile = projectFolder.children[0].children[0];
    const target = resolveLocalProjectCreateTarget(
      workspace,
      articleFile.id,
      fallbackProjectRootPath,
    );

    expect(target).toEqual({
      parentFolderId: projectFolder.children[0].id,
      projectRootPath: importedProjectRootPath,
      parentRelativePath: 'articles',
      parentFolder: projectFolder.children[0],
    });
  });

  it('普通工作区节点回退到默认 Projects 目录', () => {
    const target = resolveLocalProjectCreateTarget(
      workspace,
      'folder-ideas',
      fallbackProjectRootPath,
    );

    expect(target).toEqual({
      parentFolderId: workspace.id,
      projectRootPath: fallbackProjectRootPath,
      parentRelativePath: 'Projects',
      parentFolder: workspace,
    });
  });

  it('没有项目根路径时返回 null', () => {
    expect(resolveLocalProjectCreateTarget(workspace, 'folder-ideas', '')).toBeNull();
  });
});
