import { describe, expect, it } from 'vitest';
import {
  buildMoveTargetTree,
  canMoveNodeToFolder,
  moveDiskNodeToFolder,
  resolveDiskMoveParentPath,
  findNodeById,
} from '../renderer/src/store/workspaceUtils.js';

const ROOT_PATH = '/Users/test/Documents/MdRender';
const CLIP_PATH = '/Users/test/Clippings';
const diskId = (type, rel, root = ROOT_PATH) => `project:${root}:${type}:${rel}`;

const diskFolder = (rel, name, children = [], root = ROOT_PATH) => ({
  id: diskId('folder', rel, root), type: 'folder', name, relativePath: rel, projectRootPath: root, children,
});
const diskFile = (rel, name) => ({
  id: diskId('file', rel), type: 'file', name, relativePath: rel, projectRootPath: ROOT_PATH, content: '',
});

const buildWorkspace = () => ({
  id: 'root',
  type: 'folder',
  name: '工作区',
  children: [
    diskFolder('Projects/微信公众号', '微信公众号', [
      diskFile('Projects/微信公众号/a.md', 'a.md'),
      diskFolder('Projects/微信公众号/新建文件夹', '新建文件夹', [
        diskFolder('Projects/微信公众号/新建文件夹/子目录', '子目录'),
      ]),
    ]),
    diskFolder('Projects/掘金', '掘金'),
    { ...diskFolder('', 'Clippings', [], CLIP_PATH), id: `project:${CLIP_PATH}`, localProjectRoot: true },
    { id: 'mem-folder', type: 'folder', name: '内存目录', children: [] },
  ],
});

const NEW_FOLDER = diskId('folder', 'Projects/微信公众号/新建文件夹');

describe('移动到根目录 / 移动目标判定', () => {
  it('Projects 下的文件夹可以移回根目录，新路径落在 Projects/', () => {
    const ws = buildWorkspace();
    expect(canMoveNodeToFolder(ws, NEW_FOLDER, 'root')).toBe(true);
    expect(resolveDiskMoveParentPath(ws, findNodeById(ws, NEW_FOLDER), ws)).toBe('Projects');

    const next = moveDiskNodeToFolder(ws, NEW_FOLDER, 'root', 'Projects/新建文件夹');
    const moved = next.children.find((c) => c.relativePath === 'Projects/新建文件夹');
    expect(moved?.id).toBe(diskId('folder', 'Projects/新建文件夹'));
    expect(moved.children[0].relativePath).toBe('Projects/新建文件夹/子目录');
  });

  it('不能移进自己、自己的子目录或当前所在目录', () => {
    const ws = buildWorkspace();
    expect(canMoveNodeToFolder(ws, NEW_FOLDER, NEW_FOLDER)).toBe(false);
    expect(canMoveNodeToFolder(ws, NEW_FOLDER, diskId('folder', 'Projects/微信公众号/新建文件夹/子目录'))).toBe(false);
    expect(canMoveNodeToFolder(ws, NEW_FOLDER, diskId('folder', 'Projects/微信公众号'))).toBe(false);
    expect(canMoveNodeToFolder(ws, NEW_FOLDER, diskId('folder', 'Projects/掘金'))).toBe(true);
  });

  it('不能跨本地项目或移到内存目录', () => {
    const ws = buildWorkspace();
    expect(canMoveNodeToFolder(ws, NEW_FOLDER, `project:${CLIP_PATH}`)).toBe(false);
    expect(canMoveNodeToFolder(ws, NEW_FOLDER, 'mem-folder')).toBe(false);
  });

  it('已在根目录的节点不能再移到根目录', () => {
    const ws = buildWorkspace();
    expect(canMoveNodeToFolder(ws, diskId('folder', 'Projects/掘金'), 'root')).toBe(false);
  });

  it('目录树只列文件夹，排除自己，非法目标置灰', () => {
    const ws = buildWorkspace();
    const [root] = buildMoveTargetTree(ws, NEW_FOLDER);
    expect(root.title).toBe('根目录');
    expect(root.disabled).toBe(false);
    const wechat = root.children.find((c) => c.title === '微信公众号');
    expect(wechat.disabled).toBe(true);
    expect(wechat.children).toHaveLength(0); // 自己被排除，文件不列
  });
});
