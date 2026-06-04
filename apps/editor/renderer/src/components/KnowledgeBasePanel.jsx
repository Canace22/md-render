import { useMemo } from 'react';
import { ArrowRight, FileText, Folder, Network, Search, Sparkles, Tag } from 'lucide-react';
import {
  collectFiles,
  collectTags,
  getFileKnowledgeSearchText,
  getKnowledgeNodeTypeLabel,
} from '../store/workspaceUtils.js';

const GRAPH_NODE_LAYOUTS = [
  { top: '10%', left: '18%' },
  { top: '18%', right: '10%' },
  { top: '46%', left: '6%' },
  { top: '56%', right: '14%' },
  { bottom: '14%', left: '24%' },
  { bottom: '8%', right: '22%' },
];

const formatDate = (value) => {
  if (!value) return '未编辑';
  try {
    return new Date(value).toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return '未编辑';
  }
};

const truncateText = (value, maxLength = 96) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '这篇文档还没有摘要内容。';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const countFolderNodes = (node) => {
  if (!node || node.type !== 'folder') return 0;
  const children = Array.isArray(node.children) ? node.children : [];
  return 1 + children.reduce((sum, child) => sum + countFolderNodes(child), 0);
};

const countMountedRoots = (node, fieldName) => {
  if (!node) return 0;
  const children = Array.isArray(node.children) ? node.children : [];
  const ownCount = node[fieldName] ? 1 : 0;
  return ownCount + children.reduce((sum, child) => sum + countMountedRoots(child, fieldName), 0);
};

const getSearchSnippet = (content, query) => {
  const source = String(content ?? '').replace(/\s+/g, ' ').trim();
  if (!source) return '空文档';
  const keyword = String(query ?? '').trim().toLowerCase();
  if (!keyword) return truncateText(source, 120);
  const hitIndex = source.toLowerCase().indexOf(keyword);
  if (hitIndex < 0) return truncateText(source, 120);
  const start = Math.max(0, hitIndex - 28);
  const end = Math.min(source.length, hitIndex + keyword.length + 48);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < source.length ? '...' : '';
  return `${prefix}${source.slice(start, end)}${suffix}`;
};

const getSearchPreview = (file, query) => {
  const summary = String(file?.summary ?? '').trim();
  if (summary) {
    const lowered = summary.toLowerCase();
    const keyword = String(query ?? '').trim().toLowerCase();
    if (!keyword || lowered.includes(keyword)) {
      return truncateText(summary, 120);
    }
  }
  return getSearchSnippet(file?.content, query);
};

export default function KnowledgeBasePanel({
  mode = 'overview',
  workspace,
  selectedFile,
  selectedFolder,
  searchQuery,
  onSearchQueryChange,
  onOpenFile,
  onOpenFolder,
  onOpenSurface,
}) {
  const files = useMemo(() => collectFiles(workspace), [workspace]);
  const tags = useMemo(() => collectTags(workspace), [workspace]);
  const folderCount = useMemo(() => Math.max(0, countFolderNodes(workspace) - 1), [workspace]);
  const localRootCount = useMemo(() => countMountedRoots(workspace, 'localProjectRoot'), [workspace]);
  const notionRootCount = useMemo(() => countMountedRoots(workspace, 'notionSyncRoot'), [workspace]);

  const recentFiles = useMemo(() => {
    return files
      .slice()
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 6);
  }, [files]);

  const filesById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);

  const searchResults = useMemo(() => {
    const query = String(searchQuery ?? '').trim().toLowerCase();
    if (!query) return [];
    return files.filter((file) => getFileKnowledgeSearchText(file).includes(query));
  }, [files, searchQuery]);

  const graphNodes = useMemo(() => {
    if (selectedFile?.relatedIds?.length) {
      return selectedFile.relatedIds
        .map((id) => filesById.get(id))
        .filter(Boolean)
        .slice(0, GRAPH_NODE_LAYOUTS.length)
        .map((file) => ({
          key: `related-${file.id}`,
          kind: 'related',
          label: file.name.replace(/\.md$/i, ''),
          meta: getKnowledgeNodeTypeLabel(file.nodeType),
          fileId: file.id,
        }));
    }
    const tagNodes = tags.slice(0, 4).map((item) => ({
      key: `tag-${item.tag}`,
      kind: 'tag',
      label: item.tag,
      meta: `${item.count} 篇文档`,
    }));
    const fileNodes = recentFiles.slice(0, 2).map((file) => ({
      key: `file-${file.id}`,
      kind: 'file',
      label: file.name.replace(/\.md$/i, ''),
      meta: formatDate(file.updatedAt),
      fileId: file.id,
    }));
    return [...tagNodes, ...fileNodes].slice(0, GRAPH_NODE_LAYOUTS.length);
  }, [filesById, recentFiles, selectedFile, tags]);

  const selectedSummary = selectedFile
    ? truncateText(selectedFile.summary || selectedFile.content, 140)
    : selectedFolder
      ? `当前目录下共有 ${(selectedFolder.children ?? []).length} 个子项。`
      : '从左侧目录选择一篇文档，或先从搜索开始。';

  const renderOverview = mode === 'overview';
  const renderSearch = mode === 'overview' || mode === 'search';
  const renderGraph = mode === 'overview' || mode === 'graph';

  return (
    <div className={`knowledge-stage knowledge-stage--${mode}`} data-testid="knowledge-panel">
      {renderOverview ? (
        <>
          <div className="knowledge-hero">
            <div className="knowledge-hero-copy">
              <span className="knowledge-eyebrow">Knowledge Workspace</span>
              <h1 className="knowledge-title">知识库</h1>
              <p className="knowledge-subtitle">
                这里先看全局结构、搜索结果和主题关系，编辑器退到内容生产环节。
              </p>
              <div className="knowledge-hero-actions">
                <button
                  type="button"
                  className="knowledge-primary-btn"
                  onClick={() => onOpenSurface('search')}
                >
                  <Search size={16} strokeWidth={1.8} />
                  <span>全局搜索</span>
                </button>
                <button
                  type="button"
                  className="knowledge-secondary-btn"
                  onClick={() => onOpenSurface('graph')}
                >
                  <Network size={16} strokeWidth={1.8} />
                  <span>图谱视图</span>
                </button>
              </div>
            </div>
            <div className="knowledge-hero-stats">
              <div className="knowledge-stat-card">
                <span className="knowledge-stat-label">文档</span>
                <strong>{files.length}</strong>
              </div>
              <div className="knowledge-stat-card">
                <span className="knowledge-stat-label">目录</span>
                <strong>{folderCount}</strong>
              </div>
              <div className="knowledge-stat-card">
                <span className="knowledge-stat-label">标签</span>
                <strong>{tags.length}</strong>
              </div>
              <div className="knowledge-stat-card">
                <span className="knowledge-stat-label">外部来源</span>
                <strong>{localRootCount + notionRootCount}</strong>
              </div>
            </div>
          </div>

          <div className="knowledge-grid">
            <section className="knowledge-card knowledge-card--wide">
              <div className="knowledge-card-head">
                <div>
                  <span className="knowledge-card-kicker">知识库总览</span>
                  <h2>当前内容焦点</h2>
                </div>
                {selectedFile ? (
                  <button
                    type="button"
                    className="knowledge-inline-link"
                    onClick={() => onOpenFile(selectedFile.id)}
                  >
                    打开文档
                    <ArrowRight size={14} strokeWidth={1.8} />
                  </button>
                ) : selectedFolder ? (
                  <button
                    type="button"
                    className="knowledge-inline-link"
                    onClick={() => onOpenFolder(selectedFolder.id)}
                  >
                    打开目录
                    <ArrowRight size={14} strokeWidth={1.8} />
                  </button>
                ) : null}
              </div>
              <div className="knowledge-focus-card">
                <div className="knowledge-focus-icon">
                  {selectedFile ? <FileText size={20} strokeWidth={1.7} /> : <Folder size={20} strokeWidth={1.7} />}
                </div>
                <div className="knowledge-focus-copy">
                  <strong>{selectedFile?.name ?? selectedFolder?.name ?? '尚未选中文档'}</strong>
                  <p>{selectedSummary}</p>
                </div>
              </div>
            </section>

            <section className="knowledge-card">
              <div className="knowledge-card-head">
                <div>
                  <span className="knowledge-card-kicker">热点标签</span>
                  <h2>主题分布</h2>
                </div>
                <button
                  type="button"
                  className="knowledge-inline-link"
                  onClick={() => onOpenSurface('graph')}
                >
                  去图谱
                  <ArrowRight size={14} strokeWidth={1.8} />
                </button>
              </div>
              <div className="knowledge-tag-cloud">
                {tags.length > 0 ? tags.slice(0, 8).map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    className="knowledge-tag-pill"
                    onClick={() => {
                      onSearchQueryChange(tag);
                      onOpenSurface('search');
                    }}
                  >
                    <Tag size={13} strokeWidth={1.6} />
                    <span>{tag}</span>
                    <em>{count}</em>
                  </button>
                )) : (
                  <p className="knowledge-empty-text">先给文档加一些标签，图谱和筛选会更有用。</p>
                )}
              </div>
            </section>

            <section className="knowledge-card knowledge-card--wide">
              <div className="knowledge-card-head">
                <div>
                  <span className="knowledge-card-kicker">最近更新</span>
                  <h2>最新内容</h2>
                </div>
              </div>
              <div className="knowledge-list">
                {recentFiles.length > 0 ? recentFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    className="knowledge-list-item"
                    onClick={() => onOpenFile(file.id)}
                  >
                    <div className="knowledge-list-item-main">
                      <strong>{file.name}</strong>
                      <p>{truncateText(file.content, 96)}</p>
                    </div>
                    <span>{formatDate(file.updatedAt)}</span>
                  </button>
                )) : (
                  <p className="knowledge-empty-text">还没有可展示的文档内容。</p>
                )}
              </div>
            </section>

            <section className="knowledge-card">
              <div className="knowledge-card-head">
                <div>
                  <span className="knowledge-card-kicker">接入状态</span>
                  <h2>来源结构</h2>
                </div>
              </div>
              <div className="knowledge-source-list">
                <div className="knowledge-source-row">
                  <span>本地目录挂载</span>
                  <strong>{localRootCount}</strong>
                </div>
                <div className="knowledge-source-row">
                  <span>Notion 同步根</span>
                  <strong>{notionRootCount}</strong>
                </div>
                <div className="knowledge-source-row">
                  <span>可搜索文档</span>
                  <strong>{files.length}</strong>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="knowledge-mode-header">
          <span className="knowledge-eyebrow">Knowledge Workspace</span>
          <h1 className="knowledge-mode-title">{mode === 'search' ? '全局搜索' : '图谱视图'}</h1>
          <p className="knowledge-mode-desc">
            {mode === 'search'
              ? '跨文件检索标题、正文和标签，先找到知识，再决定是否进入编辑。'
              : '先看高频主题和最新文档的关系，再回到具体内容。'}
          </p>
        </div>
      )}

      {renderSearch && (
        <div className="knowledge-section">
          <div className="knowledge-section-head">
            <div>
              <span className="knowledge-card-kicker">全局搜索</span>
              <h2>搜索知识库</h2>
            </div>
          </div>
          <div className="knowledge-search-bar">
            <Search size={18} strokeWidth={1.7} className="knowledge-search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="按标题、正文、标签搜索知识库…"
              aria-label="全局搜索知识库"
            />
          </div>
          {searchQuery.trim() ? (
            <div className="knowledge-search-results">
              <div className="knowledge-search-meta">
                找到 <strong>{searchResults.length}</strong> 篇相关文档
              </div>
              {searchResults.length > 0 ? searchResults.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className="knowledge-search-result"
                  onClick={() => onOpenFile(file.id)}
                >
                  <div className="knowledge-search-result-head">
                    <strong>{file.name}</strong>
                    <span>{formatDate(file.updatedAt)}</span>
                  </div>
                  <p>{getSearchPreview(file, searchQuery)}</p>
                </button>
              )) : (
                <div className="knowledge-empty-block">
                  <Sparkles size={18} strokeWidth={1.7} />
                  <span>没有匹配结果，试试换个关键词或先补标签。</span>
                </div>
              )}
            </div>
          ) : (
            <div className="knowledge-empty-block">
              <Search size={18} strokeWidth={1.7} />
              <span>输入关键词后，这里会直接返回全库命中结果。</span>
            </div>
          )}
        </div>
      )}

      {renderGraph && (
        <div className="knowledge-section">
          <div className="knowledge-section-head">
            <div>
              <span className="knowledge-card-kicker">轻图谱</span>
              <h2>知识关系预览</h2>
            </div>
          </div>
          <div className="knowledge-graph-canvas">
            <div className="knowledge-graph-core">
              <span>知识库</span>
              <small>{searchQuery.trim() || selectedFile?.name?.replace(/\.md$/i, '') || '内容中心'}</small>
            </div>
            {graphNodes.map((node, index) => (
              <button
                key={node.key}
                type="button"
                className={`knowledge-graph-node knowledge-graph-node--${node.kind}`}
                style={GRAPH_NODE_LAYOUTS[index]}
                onClick={() => {
                  if (node.fileId) {
                    onOpenFile(node.fileId);
                    return;
                  }
                  onSearchQueryChange(node.label);
                  onOpenSurface('search');
                }}
              >
                <strong>{node.label}</strong>
                <span>{node.meta}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
