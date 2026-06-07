import { memo, useMemo } from 'react';
import { Button, Card, Empty, Progress, Tag } from 'antd';
import { CalendarClock, CheckSquare, Rocket, Search } from 'lucide-react';
import { getPublishingPlatformLabel } from '../utils/publishingPlatforms.js';

const PANEL_STYLES = `
.publishing-queue-panel { display:flex; flex-direction:column; gap:16px; padding:20px; background:var(--app-bg, var(--color-bg-page, #f6f7fb)); color:var(--color-text, #1f2430); }
.publishing-queue-shell { display:grid; grid-template-columns:minmax(0, 1.8fr) minmax(280px, 1fr); gap:16px; }
.publishing-queue-card { border-radius:16px; border:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); background:var(--color-bg-elevated, rgba(255, 255, 255, 0.92)); box-shadow:0 12px 32px rgba(15, 23, 42, 0.06); }
.publishing-queue-card .ant-card-head { min-height:auto; padding:0 20px; border-bottom:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); }
.publishing-queue-card .ant-card-head-title { padding:16px 0; }
.publishing-queue-card .ant-card-body { padding:16px 20px 18px; }
.publishing-queue-hero { display:flex; flex-direction:column; gap:14px; }
.publishing-queue-kicker { display:inline-flex; width:max-content; padding:4px 10px; border-radius:999px; background:var(--color-fill-secondary, rgba(15, 23, 42, 0.06)); color:var(--color-text-secondary, #5b6475); font-size:12px; letter-spacing:0.04em; }
.publishing-queue-title { margin:0; font-size:28px; line-height:1.15; }
.publishing-queue-subtitle { margin:0; color:var(--color-text-secondary, #5b6475); line-height:1.7; }
.publishing-queue-toolbar, .publishing-queue-stats { display:grid; gap:12px; }
.publishing-queue-toolbar { grid-template-columns:repeat(2, minmax(0, 1fr)); }
.publishing-queue-toolbar .ant-btn { height:auto; padding:12px 14px; border-radius:14px; text-align:left; }
.publishing-queue-toolbar-copy { display:flex; flex-direction:column; gap:4px; }
.publishing-queue-toolbar-copy strong { font-size:14px; }
.publishing-queue-toolbar-copy span, .publishing-queue-meta, .publishing-queue-summary, .publishing-queue-check-item, .publishing-queue-empty-copy { color:var(--color-text-secondary, #5b6475); }
.publishing-queue-toolbar-copy span { font-size:12px; line-height:1.5; }
.publishing-queue-stats { grid-template-columns:repeat(3, minmax(0, 1fr)); }
.publishing-queue-stat { padding:16px; border-radius:14px; background:var(--color-fill-tertiary, rgba(15, 23, 42, 0.04)); }
.publishing-queue-stat span { display:block; margin-bottom:8px; color:var(--color-text-secondary, #5b6475); font-size:12px; }
.publishing-queue-stat strong { font-size:24px; line-height:1; }
.publishing-queue-list { display:flex; flex-direction:column; gap:12px; }
.publishing-queue-item { border:1px solid var(--color-border, rgba(15, 23, 42, 0.08)); border-radius:14px; background:var(--color-bg-container, rgba(255, 255, 255, 0.88)); padding:14px; transition:border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease; }
.publishing-queue-item:hover { border-color:var(--color-primary, #1677ff); transform:translateY(-1px); box-shadow:0 8px 20px rgba(22, 119, 255, 0.08); }
.publishing-queue-item-head, .publishing-queue-item-foot { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.publishing-queue-item-head { margin-bottom:10px; }
.publishing-queue-item-title { margin:0; font-size:16px; line-height:1.35; }
.publishing-queue-meta { display:flex; flex-wrap:wrap; gap:8px 12px; margin-top:6px; font-size:12px; }
.publishing-queue-summary { margin:0 0 12px; line-height:1.6; font-size:13px; }
.publishing-queue-platforms, .publishing-queue-checklist { display:flex; flex-wrap:wrap; gap:6px; }
.publishing-queue-progress { min-width:120px; }
.publishing-queue-item-actions { display:flex; gap:8px; }
.publishing-queue-checklist { margin-top:10px; }
.publishing-queue-check-item { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; background:var(--color-fill-secondary, rgba(15, 23, 42, 0.06)); font-size:12px; }
.publishing-queue-check-item.is-done { color:var(--color-success-text, #2f7d32); background:rgba(82, 196, 26, 0.12); }
.publishing-queue-check-item.is-todo { color:var(--color-text-secondary, #5b6475); }
.publishing-queue-sidebar { display:flex; flex-direction:column; gap:16px; }
.publishing-queue-check-template { display:flex; flex-direction:column; gap:10px; }
.publishing-queue-empty { padding:8px 0 2px; }
.publishing-queue-empty-copy { margin-top:8px; text-align:center; }
@media (max-width: 1080px) {
  .publishing-queue-shell { grid-template-columns:1fr; }
}
@media (max-width: 720px) {
  .publishing-queue-panel { padding:16px; }
  .publishing-queue-toolbar, .publishing-queue-stats { grid-template-columns:1fr; }
  .publishing-queue-item-head, .publishing-queue-item-foot { flex-direction:column; }
  .publishing-queue-progress { width:100%; min-width:0; }
}
`;

const DEFAULT_CHECKLIST = [
  '标题和封面文案已过一遍',
  '平台格式和口吻已调整',
  '引用链接与素材来源已核对',
  '发布时间和渠道负责人已确认',
];

const formatDate = (value) => {
  if (!value) return '待安排';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getSummary = (item) => {
  const text = String(item.summary ?? item.excerpt ?? item.note ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '这里可以放平台摘要、发文角度或上线前最后一条提醒。';
  return text.length > 88 ? `${text.slice(0, 88)}...` : text;
};

const getPlatforms = (item) => {
  const value = item.targetPlatforms ?? item.platforms ?? item.channels ?? item.channel ?? [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

const getChecklist = (item) => {
  const value = item.checklist ?? item.publishChecklist ?? [];
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_CHECKLIST.map((label) => ({ label, done: false }));
  }
  return value.map((entry) => {
    if (typeof entry === 'string') {
      return { label: entry, done: false };
    }
    return { label: entry.label ?? entry.title ?? '待确认项', done: Boolean(entry.done ?? entry.checked) };
  });
};

function PublishingQueuePanel({
  title = '待发布清单',
  subtitle = '把待发布稿件、渠道、排期和上线前检查项放在一起，先过清单，再决定今天推哪篇。',
  items = [],
  platformOptions = [],
  onOpenItem,
  onSchedule,
  onOpenSearch,
  onCreate,
}) {
  const stats = useMemo(() => {
    const scheduled = items.filter((item) => Boolean(item.publishAt ?? item.scheduledPublishAt)).length;
    const totalProgress = items.reduce((sum, item) => sum + Number(item.progress ?? 0), 0);
    return [
      { key: 'pending', label: '待发布稿件', value: items.length },
      { key: 'scheduled', label: '已排期', value: scheduled },
      { key: 'progress', label: '平均进度', value: items.length ? `${Math.round(totalProgress / items.length)}%` : '0%' },
    ];
  }, [items]);

  const upcomingItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftTime = new Date(left.publishAt ?? left.scheduledPublishAt ?? 0).getTime();
      const rightTime = new Date(right.publishAt ?? right.scheduledPublishAt ?? 0).getTime();
      return leftTime - rightTime;
    });
  }, [items]);

  return (
    <div className="publishing-queue-panel" data-testid="publishing-queue-panel">
      <style>{PANEL_STYLES}</style>

      <Card className="publishing-queue-card">
        <div className="publishing-queue-hero">
          <span className="publishing-queue-kicker">Publishing Queue</span>
          <h1 className="publishing-queue-title">{title}</h1>
          <p className="publishing-queue-subtitle">{subtitle}</p>
          <div className="publishing-queue-toolbar">
            <Button icon={<Search size={16} strokeWidth={1.8} />} onClick={() => onOpenSearch?.()}>
              <span className="publishing-queue-toolbar-copy">
                <strong>搜待发布稿</strong>
                <span>从知识库和草稿里找出今天能发的内容</span>
              </span>
            </Button>
            <Button type="primary" icon={<Rocket size={16} strokeWidth={1.8} />} onClick={() => onCreate?.('publishing')}>
              <span className="publishing-queue-toolbar-copy">
                <strong>新建待发布稿</strong>
                <span>先占一个发布位，后面再补摘要、渠道和检查项</span>
              </span>
            </Button>
          </div>
        </div>
      </Card>

      <section className="publishing-queue-stats">
        {stats.map((item) => (
          <div key={item.key} className="publishing-queue-card publishing-queue-stat">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="publishing-queue-shell">
        <Card
          className="publishing-queue-card"
          title="待发布稿件列表"
          extra={<Button type="text" onClick={() => onOpenSearch?.()}>打开搜索</Button>}
        >
          {upcomingItems.length ? (
            <div className="publishing-queue-list">
              {upcomingItems.map((item) => {
                const platforms = getPlatforms(item);
                const checklist = getChecklist(item);
                const doneCount = checklist.filter((entry) => entry.done).length;

                return (
                  <div key={item.id ?? item.title} className="publishing-queue-item">
                    <div className="publishing-queue-item-head">
                      <div>
                        <h3 className="publishing-queue-item-title">{item.title || '未命名待发布稿'}</h3>
                        <div className="publishing-queue-meta">
                          <span><CalendarClock size={12} strokeWidth={1.8} /> {formatDate(item.publishAt ?? item.scheduledPublishAt)}</span>
                          <span>{item.statusLabel ?? item.draftStatusLabel ?? item.draftStatus ?? '待发布'}</span>
                          <span>{item.wordCount ? `${item.wordCount} 字` : '字数待补'}</span>
                        </div>
                      </div>
                      <div className="publishing-queue-item-actions">
                        <Button type="text" onClick={() => onOpenItem?.(item)}>查看稿件</Button>
                        <Button onClick={() => onSchedule?.(item)}>安排时间</Button>
                      </div>
                    </div>

                    <p className="publishing-queue-summary">{getSummary(item)}</p>

                    <div className="publishing-queue-item-foot">
                      <div>
                        <div className="publishing-queue-platforms">
                          {platforms.length ? platforms.map((platform) => (
                            <Tag color="blue" key={platform}>{getPublishingPlatformLabel(platform, platformOptions) || platform}</Tag>
                          )) : <Tag>待选渠道</Tag>}
                        </div>
                        <div className="publishing-queue-checklist">
                          {checklist.slice(0, 3).map((entry) => (
                            <span key={entry.label} className={`publishing-queue-check-item ${entry.done ? 'is-done' : 'is-todo'}`}>
                              <CheckSquare size={12} strokeWidth={1.8} />
                              <span>{entry.label}</span>
                            </span>
                          ))}
                          {checklist.length > 3 ? (
                            <span className="publishing-queue-check-item is-todo">还有 {checklist.length - 3} 项待看</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="publishing-queue-progress">
                        <Progress percent={item.progress ?? (checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0)} size="small" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="publishing-queue-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有待发布稿件" />
              <div className="publishing-queue-empty-copy">先从搜索里挑一篇草稿，或者直接新建一个待发布条目。</div>
              <div className="publishing-queue-item-actions">
                <Button onClick={() => onOpenSearch?.()}>去搜索稿件</Button>
                <Button type="primary" onClick={() => onCreate?.('publishing')}>新建待发布稿</Button>
              </div>
            </div>
          )}
        </Card>

        <div className="publishing-queue-sidebar">
          <Card className="publishing-queue-card" title="发布前检查项占位">
            <div className="publishing-queue-check-template">
              {DEFAULT_CHECKLIST.map((item) => (
                <span key={item} className="publishing-queue-check-item is-todo">
                  <CheckSquare size={12} strokeWidth={1.8} />
                  <span>{item}</span>
                </span>
              ))}
            </div>
          </Card>

          <Card className="publishing-queue-card" title="最近动作建议">
            <div className="publishing-queue-check-template">
              <Button onClick={() => onOpenSearch?.()}>从知识库里找可发稿件</Button>
              <Button onClick={() => onCreate?.('publishing')}>先建一个发布位再慢慢补</Button>
              <Button onClick={() => onSchedule?.(upcomingItems[0] ?? null)} disabled={!upcomingItems.length}>给最靠前的一篇安排时间</Button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

export default memo(PublishingQueuePanel);
