/** app 主界面的中文名（AI 简报、工具结果用） */
export const SURFACE_LABELS = Object.freeze({
  overview: '总览',
  daily: '今日速记',
  canvas: '灵感白板',
  'creation-board': '创作看板',
  publishing: '发布队列',
  search: '知识库搜索',
  graph: '关系图谱',
  sync: '同步中心',
  settings: '设置',
  paper: '文档工作区',
  folder: '文件夹',
});

export const getSurfaceLabel = (surface, selectedNode) => {
  if (surface === 'paper') {
    return selectedNode?.type === 'folder' ? '文件夹' : '文档工作区';
  }
  return SURFACE_LABELS[surface] || '当前界面';
};
