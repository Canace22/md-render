import { memo, useMemo } from 'react';
import { Button, Card, Dropdown, Empty, Tag } from 'antd';
import { CheckCircle2, FileText, FolderKanban, Lightbulb, MoreHorizontal, PenLine, Plus, Rocket } from 'lucide-react';
import { CREATION_STATUS_OPTIONS } from '../store/creationUtils.js';
import { getPublishingPlatformLabel } from '../utils/publishingPlatforms.js';

const DEFAULT_STATUS_OPTIONS = CREATION_STATUS_OPTIONS;

const DEFAULT_LANES = [
  { key: 'idea', title: '选题中', statusValues: ['idea'], createStatus: 'idea', icon: Lightbulb },
  { key: 'collecting', title: '收集中', statusValues: ['collecting'], createStatus: 'collecting', icon: FolderKanban },
  { key: 'draft', title: '草稿', statusValues: ['draft'], createStatus: 'draft', icon: FileText },
  { key: 'drafting', title: '写作中', statusValues: ['drafting', 'revising'], createStatus: 'drafting', icon: PenLine },
  { key: 'publishing', title: '待发布 / 已发布', statusValues: ['ready', 'published'], createStatus: 'ready', icon: Rocket },
];

const BOARD_STYLES = `
.creation-board-panel { display:flex; flex-direction:column; gap:16px; padding:16px 20px 20px; background:var(--app-bg, var(--color-bg-page, #f6f7fb)); color:var(--color-text, #1f2430); }
.creation-board-header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; }
.creation-board-title-wrap { display:flex; flex-direction:column; gap:6px; }
.creation-board-kicker { font-size:12px; color:var(--color-text-secondary, #5b6475); letter-spacing:0.04em; text-transform:uppercase; }
.creation-board-title { margin:0; font-size:24px; line-height:1.15; }
.creation-board-subtitle { margin:0; color:var(--color-text-secondary, #5b6475); line-height:1.6; }
.creation-board-summary { display:flex; flex-wrap:wrap; gap:8px; }
.creation-board-summary .ant-tag { margin-inline-end:0; padding-inline:10px; border-radius:999px; }
.creation-board-scroll { overflow-x:auto; padding-bottom:4px; }
.creation-board-grid { display:grid; grid-template-columns:repeat(5, minmax(240px, 1fr)); gap:12px; min-width:1248px; }
.creation-board-lane { border-radius:16px; border:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); background:var(--color-bg-elevated, rgba(255, 255, 255, 0.94)); box-shadow:0 10px 28px rgba(15, 23, 42, 0.05); }
.creation-board-lane .ant-card-head { min-height:auto; padding:0 14px; border-bottom:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); }
.creation-board-lane .ant-card-head-title { padding:12px 0; }
.creation-board-lane .ant-card-body { padding:12px; display:flex; flex-direction:column; gap:10px; min-height:320px; }
.creation-board-lane-head { display:flex; align-items:center; gap:10px; }
.creation-board-lane-icon { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:10px; background:var(--color-fill-secondary, rgba(15, 23, 42, 0.06)); }
.creation-board-lane-text { display:flex; flex-direction:column; gap:2px; }
.creation-board-lane-text strong { font-size:14px; line-height:1.2; }
.creation-board-lane-text span { font-size:12px; color:var(--color-text-secondary, #5b6475); }
.creation-board-create { padding-inline:10px; border-radius:999px; }
.creation-board-empty { display:flex; flex:1; align-items:center; justify-content:center; padding:12px 0; }
.creation-board-card { padding:12px; border:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); border-radius:14px; background:var(--color-bg-container, rgba(255, 255, 255, 0.92)); }
.creation-board-card-head, .creation-board-card-meta, .creation-board-card-foot { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.creation-board-card-head { margin-bottom:8px; }
.creation-board-card-title { border:none; padding:0; background:none; text-align:left; font-size:14px; line-height:1.45; font-weight:600; color:inherit; cursor:pointer; }
.creation-board-card-title:hover { color:var(--color-primary, #1677ff); }
.creation-board-card-summary { margin:0 0 10px; color:var(--color-text-secondary, #5b6475); font-size:13px; line-height:1.6; }
.creation-board-card-meta { margin-bottom:10px; font-size:12px; color:var(--color-text-secondary, #5b6475); }
.creation-board-card-foot { align-items:center; }
.creation-board-inline-tags { display:flex; flex-wrap:wrap; gap:6px; }
.creation-board-inline-tags .ant-tag { margin-inline-end:0; }
.creation-board-ghost-btn { border:none; background:none; padding:4px; border-radius:10px; color:var(--color-text-secondary, #5b6475); }
.creation-board-ghost-btn:hover { background:var(--color-fill-secondary, rgba(15, 23, 42, 0.06)); color:var(--color-text, #1f2430); }
@media (max-width: 900px) {
  .creation-board-panel { padding:16px; }
  .creation-board-header { align-items:flex-start; flex-direction:column; }
}
`;

const STATUS_ALIAS_MAP = Object.freeze({
  topic: 'idea',
  draft: 'draft',
  writing: 'drafting',
  revising: 'revising',
  ready_to_publish: 'ready',
  scheduled: 'ready',
  live: 'published',
  '\u9009\u9898': 'idea',
  '\u6536\u96c6\u4e2d': 'collecting',
  '\u8349\u7a3f': 'draft',
  '\u5199\u4f5c\u4e2d': 'drafting',
  '\u4fee\u6539\u4e2d': 'revising',
  '\u5f85\u53d1\u5e03': 'ready',
  '\u5df2\u53d1\u5e03': 'published',
});

const normalizeToken = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
const normalizeStatus = (item) => {
  const raw = item?.draftStatus ?? item?.creationStatus ?? item?.manuscriptStatus ?? item?.publishStatus ?? item?.status ?? item?.topicStatus;
  const token = normalizeToken(raw);
  return (STATUS_ALIAS_MAP[token] ?? token) || 'idea';
};
const getItemTitle = (item) => item?.title || item?.name || '未命名条目';
const getItemSummary = (item) => {
  const text = String(item?.summary ?? item?.excerpt ?? item?.description ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '先补一句摘要，后面扫板时会更快判断下一步。';
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
};
const getPlatforms = (item) => {
  const value = item?.targetPlatforms ?? item?.platforms ?? item?.publishPlatforms ?? [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean).slice(0, 2);
};
const formatDate = (value) => {
  if (!value) return '待更新';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return String(value);
  return new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};
const byRecent = (a, b) => (Date.parse(b?.updatedAt ?? b?.createdAt ?? 0) || 0) - (Date.parse(a?.updatedAt ?? a?.createdAt ?? 0) || 0);

function CreationBoardPanel({
  title = '选题 / 稿件状态看板',
  subtitle = '把选题、资料、草稿和发布节奏放到同一块板里，先看堵点，再决定下一步。',
  items = [],
  statusOptions = DEFAULT_STATUS_OPTIONS,
  platformOptions = [],
  lanes = DEFAULT_LANES,
  onOpenItem,
  onMoveStatus,
  onCreate,
}) {
  const statusLabelMap = useMemo(() => {
    return new Map((statusOptions || []).map((option) => [normalizeToken(option.value), option.label]));
  }, [statusOptions]);
  const laneItems = useMemo(() => {
    const groups = new Map((lanes || []).map((lane) => [lane.key, []]));
    for (const item of items || []) {
      const status = normalizeStatus(item);
      const lane = (lanes || []).find((entry) => entry.statusValues.some((value) => normalizeToken(value) === status));
      groups.get(lane?.key ?? lanes?.[0]?.key)?.push(item);
    }
    for (const entry of groups.values()) entry.sort(byRecent);
    return groups;
  }, [items, lanes]);

  const summaryItems = useMemo(() => {
    return (lanes || []).map((lane) => `${lane.title} ${laneItems.get(lane.key)?.length || 0}`);
  }, [laneItems, lanes]);

  const moveMenuItems = (item) => {
    const current = normalizeStatus(item);
    return (statusOptions || []).map((option) => ({
      key: option.value,
      label: option.label,
      disabled: normalizeToken(option.value) === current,
    }));
  };

  return (
    <section className="creation-board-panel" data-testid="creation-board-panel">
      <style>{BOARD_STYLES}</style>

      <header className="creation-board-header">
        <div className="creation-board-title-wrap">
          <span className="creation-board-kicker">Creation Board</span>
          <h2 className="creation-board-title">{title}</h2>
          <p className="creation-board-subtitle">{subtitle}</p>
        </div>
        <div className="creation-board-summary">
          {summaryItems.map((text) => <Tag key={text}>{text}</Tag>)}
        </div>
      </header>

      <div className="creation-board-scroll">
        <div className="creation-board-grid">
          {(lanes || []).map((lane) => {
            const LaneIcon = lane.icon || FolderKanban;
            const currentItems = laneItems.get(lane.key) || [];

            return (
              <Card
                key={lane.key}
                className="creation-board-lane"
                title={(
                  <div className="creation-board-lane-head">
                    <span className="creation-board-lane-icon"><LaneIcon size={16} strokeWidth={1.8} /></span>
                    <span className="creation-board-lane-text">
                      <strong>{lane.title}</strong>
                      <span>{currentItems.length} 项</span>
                    </span>
                  </div>
                )}
                extra={(
                  <Button
                    type="text"
                    className="creation-board-create"
                    icon={<Plus size={14} strokeWidth={1.8} />}
                    onClick={() => onCreate?.(lane.createStatus ?? lane.statusValues?.[0] ?? lane.key, lane)}
                  >
                    新建
                  </Button>
                )}
              >
                {currentItems.length ? currentItems.map((item) => {
                  const currentStatus = normalizeStatus(item);
                  const label = statusLabelMap.get(currentStatus) || lane.title;

                  return (
                    <article key={item.id || `${lane.key}-${getItemTitle(item)}`} className="creation-board-card">
                      <div className="creation-board-card-head">
                        <button type="button" className="creation-board-card-title" onClick={() => onOpenItem?.(item, lane)}>
                          {getItemTitle(item)}
                        </button>
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: moveMenuItems(item),
                            onClick: ({ key }) => onMoveStatus?.(item, key, lane),
                          }}
                        >
                          <Button type="text" className="creation-board-ghost-btn" icon={<MoreHorizontal size={16} strokeWidth={1.8} />} />
                        </Dropdown>
                      </div>

                      <p className="creation-board-card-summary">{getItemSummary(item)}</p>

                      <div className="creation-board-card-meta">
                        <span>{item.wordCount || 0} 字</span>
                        <span>{formatDate(item.updatedAt ?? item.createdAt)}</span>
                      </div>

                      <div className="creation-board-card-foot">
                        <div className="creation-board-inline-tags">
                          <Tag color={currentStatus === 'published' ? 'success' : currentStatus === 'ready' ? 'gold' : 'default'}>
                            {label}
                          </Tag>
                          {getPlatforms(item).map((platform) => (
                            <Tag key={platform}>{getPublishingPlatformLabel(normalizeToken(platform), platformOptions) || platform}</Tag>
                          ))}
                        </div>
                        {currentStatus === 'published' ? <CheckCircle2 size={15} strokeWidth={1.8} /> : null}
                      </div>
                    </article>
                  );
                }) : (
                  <div className="creation-board-empty">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这一列暂时没有内容" />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default memo(CreationBoardPanel);
