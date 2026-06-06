import { memo, useMemo } from 'react';
import { Button, Card, Empty, Progress, Tag } from 'antd';
import {
  ArrowRight,
  CalendarClock,
  FilePlus2,
  FileText,
  Inbox,
  Lightbulb,
  Rocket,
  Sparkles,
} from 'lucide-react';

const DEFAULT_QUICK_ACTIONS = [
  { key: 'draft', label: '新建稿件', description: '从空白稿开始写', icon: <FilePlus2 size={16} strokeWidth={1.8} /> },
  { key: 'topic', label: '新建选题', description: '先把方向和角度定下来', icon: <Lightbulb size={16} strokeWidth={1.8} /> },
  { key: 'material', label: '整理素材', description: '把收藏和灵感收进收件箱', icon: <Inbox size={16} strokeWidth={1.8} /> },
  { key: 'publish', label: '发布排期', description: '整理待发布稿件和渠道', icon: <Rocket size={16} strokeWidth={1.8} /> },
];

const DASHBOARD_STYLES = `
.creation-dashboard { display:flex; flex:1; flex-direction:column; gap:16px; min-height:0; overflow-y:auto; padding:20px; background:var(--app-bg, var(--color-bg-page, #f6f7fb)); color:var(--color-text, #1f2430); }
.creation-dashboard-hero { display:grid; grid-template-columns:minmax(0, 1.8fr) minmax(260px, 1fr); gap:16px; }
.creation-dashboard-panel { border-radius:16px; border:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); background:var(--color-bg-elevated, rgba(255, 255, 255, 0.92)); box-shadow:0 12px 32px rgba(15, 23, 42, 0.06); }
.creation-dashboard-hero-copy { display:flex; flex-direction:column; gap:14px; }
.creation-dashboard-eyebrow { display:inline-flex; width:max-content; padding:4px 10px; border-radius:999px; background:var(--color-fill-secondary, rgba(15, 23, 42, 0.06)); color:var(--color-text-secondary, #5b6475); font-size:12px; letter-spacing:0.04em; }
.creation-dashboard-title { margin:0; font-size:28px; line-height:1.15; }
.creation-dashboard-subtitle { margin:0; color:var(--color-text-secondary, #5b6475); line-height:1.7; }
.creation-dashboard-actions, .creation-dashboard-quick-actions { display:grid; gap:12px; }
.creation-dashboard-actions { grid-template-columns:repeat(2, minmax(0, 1fr)); }
.creation-dashboard-quick-actions { grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); }
.creation-dashboard-action { height:auto; padding:14px 16px; border-radius:14px; text-align:left; }
.creation-dashboard-action .ant-btn-icon { align-self:flex-start; margin-top:2px; }
.creation-dashboard-action-copy { display:flex; flex-direction:column; gap:4px; }
.creation-dashboard-action-copy strong { font-size:14px; }
.creation-dashboard-action-copy span { color:var(--color-text-secondary, #5b6475); font-size:12px; line-height:1.5; }
.creation-dashboard-stats { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
.creation-dashboard-stat { padding:16px; border-radius:14px; background:var(--color-fill-tertiary, rgba(15, 23, 42, 0.04)); }
.creation-dashboard-stat-label { display:block; margin-bottom:8px; color:var(--color-text-secondary, #5b6475); font-size:12px; }
.creation-dashboard-stat strong { font-size:24px; line-height:1; }
.creation-dashboard-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; }
.creation-dashboard-card .ant-card-head { min-height:auto; padding:0 20px; border-bottom:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); }
.creation-dashboard-card .ant-card-head-title { padding:16px 0; }
.creation-dashboard-card .ant-card-body { padding:16px 20px 18px; }
.creation-dashboard-card-title { display:flex; align-items:center; gap:10px; font-size:15px; }
.creation-dashboard-section-icon { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:10px; background:var(--color-fill-secondary, rgba(15, 23, 42, 0.06)); color:var(--color-text, #1f2430); }
.creation-dashboard-list { display:flex; flex-direction:column; gap:12px; }
.creation-dashboard-item { width:100%; padding:14px; border:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); border-radius:14px; background:var(--color-bg-container, rgba(255, 255, 255, 0.88)); text-align:left; transition:border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease; }
.creation-dashboard-item:hover { border-color:var(--color-primary, #1677ff); transform:translateY(-1px); box-shadow:0 8px 20px rgba(22, 119, 255, 0.08); }
.creation-dashboard-item-head, .creation-dashboard-item-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.creation-dashboard-item-head { margin-bottom:8px; }
.creation-dashboard-item-title { font-size:15px; font-weight:600; }
.creation-dashboard-item-meta, .creation-dashboard-item-summary, .creation-dashboard-empty-copy { color:var(--color-text-secondary, #5b6475); }
.creation-dashboard-item-meta, .creation-dashboard-item-foot { font-size:12px; }
.creation-dashboard-item-summary { margin:0 0 10px; line-height:1.6; font-size:13px; }
.creation-dashboard-inline-tags { display:flex; flex-wrap:wrap; gap:6px; }
.creation-dashboard-progress { min-width:88px; }
.creation-dashboard-empty { padding:8px 0 2px; }
.creation-dashboard-empty-copy { margin-top:8px; text-align:center; }
@media (max-width: 1080px) {
  .creation-dashboard-hero, .creation-dashboard-grid { grid-template-columns:1fr; }
}
@media (max-width: 720px) {
  .creation-dashboard { padding:16px; }
  .creation-dashboard-actions, .creation-dashboard-stats { grid-template-columns:1fr; }
}
`;

const formatDate = (value) => {
  if (!value) return '待安排';
  try {
    return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  } catch {
    return '待安排';
  }
};

const getSummary = (value, fallback) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
};

function SectionCard({ title, icon, sectionKey, items, emptyText, onViewSection, renderItem }) {
  return (
    <Card
      className="creation-dashboard-panel creation-dashboard-card"
      title={<span className="creation-dashboard-card-title"><span className="creation-dashboard-section-icon">{icon}</span>{title}</span>}
      extra={<Button type="text" onClick={() => onViewSection?.(sectionKey)}>查看全部</Button>}
    >
      {items.length ? (
        <div className="creation-dashboard-list">{items.map(renderItem)}</div>
      ) : (
        <div className="creation-dashboard-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
          <div className="creation-dashboard-empty-copy">这里先留空，等你把下一步创作动作接进来。</div>
        </div>
      )}
    </Card>
  );
}

/**
 * @param {{
 *   title?: string,
 *   subtitle?: string,
 *   recentDrafts?: Array<object>,
 *   topicQueue?: Array<object>,
 *   materialInbox?: Array<object>,
 *   readyToPublish?: Array<object>,
 *   quickActions?: Array<object>,
 *   onCreate?: function,
 *   onQuickAction?: function,
 *   onOpenItem?: function,
 *   onViewSection?: function
 * }} props
 */
function CreationDashboard({
  title = '内容创作首页',
  subtitle = '把最近稿件、待办选题、素材收件箱和发布排期放到同一个工作台里，先看全局，再进入具体写作。',
  recentDrafts = [],
  topicQueue = [],
  materialInbox = [],
  readyToPublish = [],
  quickActions = DEFAULT_QUICK_ACTIONS,
  onCreate,
  onQuickAction,
  onOpenItem,
  onViewSection,
}) {
  const stats = useMemo(() => ([
    { key: 'drafts', label: '最近稿件', value: recentDrafts.length },
    { key: 'topics', label: '待办选题', value: topicQueue.length },
    { key: 'materials', label: '待整理素材', value: materialInbox.length },
    { key: 'publishing', label: '待发布稿件', value: readyToPublish.length },
  ]), [materialInbox.length, readyToPublish.length, recentDrafts.length, topicQueue.length]);

  const handleQuickAction = (action) => {
    onQuickAction?.(action);
    onCreate?.(action.key, action);
  };

  return (
    <div className="creation-dashboard" data-testid="creation-dashboard">
      <style>{DASHBOARD_STYLES}</style>

      <section className="creation-dashboard-hero">
        <Card className="creation-dashboard-panel">
          <div className="creation-dashboard-hero-copy">
            <span className="creation-dashboard-eyebrow">Creation Workspace</span>
            <h1 className="creation-dashboard-title">{title}</h1>
            <p className="creation-dashboard-subtitle">{subtitle}</p>
            <div className="creation-dashboard-actions">
              {quickActions.slice(0, 2).map((action) => (
                <Button
                  key={action.key}
                  className="creation-dashboard-action"
                  icon={action.icon}
                  onClick={() => handleQuickAction(action)}
                >
                  <span className="creation-dashboard-action-copy">
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </Card>

        <div className="creation-dashboard-stats">
          {stats.map((item) => (
            <div key={item.key} className="creation-dashboard-panel creation-dashboard-stat">
              <span className="creation-dashboard-stat-label">{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="creation-dashboard-quick-actions">
        {quickActions.map((action) => (
          <Button
            key={action.key}
            className="creation-dashboard-action"
            icon={action.icon || <Sparkles size={16} strokeWidth={1.8} />}
            onClick={() => handleQuickAction(action)}
          >
            <span className="creation-dashboard-action-copy">
              <strong>{action.label}</strong>
              <span>{action.description}</span>
            </span>
          </Button>
        ))}
      </section>

      <section className="creation-dashboard-grid">
        <SectionCard
          title="最近稿件"
          icon={<FileText size={16} strokeWidth={1.8} />}
          sectionKey="drafts"
          items={recentDrafts}
          emptyText="还没有最近稿件"
          onViewSection={onViewSection}
          renderItem={(item) => (
            <button key={item.id || item.title} type="button" className="creation-dashboard-item" onClick={() => onOpenItem?.('drafts', item)}>
              <div className="creation-dashboard-item-head">
                <span className="creation-dashboard-item-title">{item.title || '未命名稿件'}</span>
                <Tag>{item.stage || '草稿'}</Tag>
              </div>
              <p className="creation-dashboard-item-summary">{getSummary(item.summary || item.excerpt, '继续补一句摘要，首页会更容易扫一眼知道这篇写到哪了。')}</p>
              <div className="creation-dashboard-item-foot">
                <span className="creation-dashboard-item-meta">{item.wordCount || 0} 字</span>
                <span className="creation-dashboard-item-meta">{formatDate(item.updatedAt)}</span>
              </div>
            </button>
          )}
        />

        <SectionCard
          title="待办选题"
          icon={<Lightbulb size={16} strokeWidth={1.8} />}
          sectionKey="topics"
          items={topicQueue}
          emptyText="当前没有待办选题"
          onViewSection={onViewSection}
          renderItem={(item) => (
            <button key={item.id || item.title} type="button" className="creation-dashboard-item" onClick={() => onOpenItem?.('topics', item)}>
              <div className="creation-dashboard-item-head">
                <span className="creation-dashboard-item-title">{item.title || '未命名选题'}</span>
                <Tag color={item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'gold' : 'default'}>{item.priorityLabel || item.priority || '待评估'}</Tag>
              </div>
              <p className="creation-dashboard-item-summary">{getSummary(item.angle || item.summary, '先补一句切入角度，后面写提纲会顺很多。')}</p>
              <div className="creation-dashboard-item-foot">
                <span className="creation-dashboard-item-meta">{item.status || '待拆解'}</span>
                <span className="creation-dashboard-item-meta">{formatDate(item.dueAt)}</span>
              </div>
            </button>
          )}
        />

        <SectionCard
          title="待整理素材"
          icon={<Inbox size={16} strokeWidth={1.8} />}
          sectionKey="materials"
          items={materialInbox}
          emptyText="素材收件箱是空的"
          onViewSection={onViewSection}
          renderItem={(item) => (
            <button key={item.id || item.title} type="button" className="creation-dashboard-item" onClick={() => onOpenItem?.('materials', item)}>
              <div className="creation-dashboard-item-head">
                <span className="creation-dashboard-item-title">{item.title || '未命名素材'}</span>
                <Tag>{item.source || '未标注来源'}</Tag>
              </div>
              <p className="creation-dashboard-item-summary">{getSummary(item.note || item.summary, '把这条素材的价值写一句，后面归档时会更快。')}</p>
              <div className="creation-dashboard-item-foot">
                <div className="creation-dashboard-inline-tags">
                  {(item.tags || []).slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                </div>
                <span className="creation-dashboard-item-meta">{formatDate(item.capturedAt)}</span>
              </div>
            </button>
          )}
        />

        <SectionCard
          title="待发布稿件"
          icon={<Rocket size={16} strokeWidth={1.8} />}
          sectionKey="publishing"
          items={readyToPublish}
          emptyText="还没有待发布稿件"
          onViewSection={onViewSection}
          renderItem={(item) => (
            <button key={item.id || item.title} type="button" className="creation-dashboard-item" onClick={() => onOpenItem?.('publishing', item)}>
              <div className="creation-dashboard-item-head">
                <span className="creation-dashboard-item-title">{item.title || '未命名发布稿'}</span>
                <Tag color="blue">{item.channel || '待选渠道'}</Tag>
              </div>
              <p className="creation-dashboard-item-summary">{getSummary(item.summary || item.checklistNote, '可以在这里放平台摘要、标题方向或发布提醒。')}</p>
              <div className="creation-dashboard-item-foot">
                <span className="creation-dashboard-item-meta"><CalendarClock size={12} strokeWidth={1.8} /> {formatDate(item.publishAt)}</span>
                <div className="creation-dashboard-progress">
                  <Progress percent={item.progress ?? 0} size="small" showInfo={false} />
                </div>
              </div>
            </button>
          )}
        />
      </section>

      <Button type="link" icon={<ArrowRight size={16} strokeWidth={1.8} />} onClick={() => onViewSection?.('planner')}>
        去看完整创作规划
      </Button>
    </div>
  );
}

export default memo(CreationDashboard);
