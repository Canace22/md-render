import { useEffect, useMemo, useState } from 'react';
import NovelEntityMark from './NovelEntityMark.jsx';

const ENTITY_TYPE_LABELS = {
  character: '角色',
  location: '地点',
  faction: '势力',
  item: '物件',
  mission: '任务',
};

const STATUS_LABELS = {
  pending: '待确认',
  confirmed: '已确认',
  accepted: '已接受',
  dismissed: '已忽略',
};

const ENTITY_GROUP_ORDER = ['character', 'location', 'faction', 'item', 'mission'];

function EntityCard({ entity, isActive, onUpdate, onInsert, onClick }) {
  const [summary, setSummary] = useState(entity.summary ?? '');
  const [aliasesText, setAliasesText] = useState((entity.aliases ?? []).join('，'));

  useEffect(() => {
    setSummary(entity.summary ?? '');
    setAliasesText((entity.aliases ?? []).join('，'));
  }, [entity.id, entity.summary, entity.aliases]);

  const handleSummaryBlur = () => {
    if ((entity.summary ?? '') === summary.trim()) return;
    onUpdate(entity.id, { summary: summary.trim() });
  };

  const handleAliasesBlur = () => {
    const nextAliases = aliasesText
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const currentAliases = (entity.aliases ?? []).join('|');
    if (currentAliases === nextAliases.join('|')) return;
    onUpdate(entity.id, { aliases: nextAliases });
  };

  return (
    <article className={`novel-entity-card ${isActive ? 'active' : ''}`}>
      <div
        className="novel-entity-header novel-entity-header-clickable"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.();
          }
        }}
      >
        <div>
          <h4 className="novel-entity-title-row">
            <NovelEntityMark type={entity.type} />
            <span>{entity.name}</span>
          </h4>
          <p>
            <span>{ENTITY_TYPE_LABELS[entity.type] ?? '实体'}</span>
            <span> · </span>
            <span>{STATUS_LABELS[entity.status] ?? '待确认'}</span>
            <span> · </span>
            <span>{entity.mentionCount ?? 0} 次提及</span>
          </p>
        </div>
      </div>

      <div className="novel-entity-toolbar">
        <button
          type="button"
          className="novel-secondary-btn novel-insert-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(entity)}
        >
          插入到正文
        </button>
      </div>

      <label className="novel-field">
        <span>简介</span>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          onBlur={handleSummaryBlur}
          placeholder="补一句人物、地点或任务简介"
        />
      </label>

      <label className="novel-field">
        <span>别名</span>
        <input
          value={aliasesText}
          onChange={(event) => setAliasesText(event.target.value)}
          onBlur={handleAliasesBlur}
          placeholder="多个别名用逗号分隔"
        />
      </label>

      {entity.traits?.length > 0 && (
        <div className="novel-tags">
          {entity.traits.map((trait) => (
            <span key={trait} className="novel-tag">
              {trait}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function QuickInsertSection({ entities, onInsert }) {
  if (entities.length === 0) {
    return (
      <EmptyState
        title="还没有可插入实体"
        description="写出角色名、地点名或任务目标后，这里会生成快捷插入按钮。"
      />
    );
  }

  return (
    <div className="novel-quick-insert-list">
      {entities.map((entity) => (
        <button
          key={entity.id}
          type="button"
          className="novel-quick-insert-chip"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(entity)}
        >
          <NovelEntityMark type={entity.type} />
          <span className="novel-quick-insert-type">{ENTITY_TYPE_LABELS[entity.type] ?? '实体'}</span>
          <span className="novel-quick-insert-name">{entity.name}</span>
        </button>
      ))}
    </div>
  );
}

function EntityGroupSection({
  type,
  entities,
  currentFileId,
  onEntityUpdate,
  onInsertEntity,
  activeEntityId,
  onSelectEntity,
}) {
  return (
    <details className="novel-entity-group" open>
      <summary className="novel-entity-group-summary">
        <span className="novel-entity-group-label">
          <NovelEntityMark type={type} />
          <span>{ENTITY_TYPE_LABELS[type] ?? '实体'}</span>
        </span>
        <span>{entities.length} 个</span>
      </summary>
      <div className="novel-entity-list">
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            isActive={activeEntityId === entity.id || (entity.mentionsByFile?.[currentFileId] ?? 0) > 0}
            onUpdate={onEntityUpdate}
            onInsert={onInsertEntity}
            onClick={() => onSelectEntity(entity.id)}
          />
        ))}
      </div>
    </details>
  );
}

function EntityDetailSection({ entity, currentFileId, onInsert }) {
  if (!entity) {
    return (
      <EmptyState
        title="点正文里的高亮实体"
        description="点击正文中的角色名、地点名或任务名，这里会展开它的详细信息。"
      />
    );
  }

  return (
    <div className="novel-scene-card" data-testid="novel-active-entity">
      <div className="novel-scene-header">
        <div>
          <h4 className="novel-entity-title-row">
            <NovelEntityMark type={entity.type} />
            <span>{entity.name}</span>
          </h4>
          <p>
            {ENTITY_TYPE_LABELS[entity.type] ?? '实体'}
            <span> · </span>
            <span>{STATUS_LABELS[entity.status] ?? '待确认'}</span>
            <span> · </span>
            <span>{entity.mentionCount ?? 0} 次提及</span>
          </p>
        </div>
        <button
          type="button"
          className="novel-mini-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(entity)}
        >
          插入
        </button>
      </div>
      <dl className="novel-scene-grid">
        <div>
          <dt>简介</dt>
          <dd>{entity.summary || '暂无简介'}</dd>
        </div>
        <div>
          <dt>别名</dt>
          <dd>{entity.aliases?.join('、') || '暂无'}</dd>
        </div>
        <div>
          <dt>特征</dt>
          <dd>{entity.traits?.join('、') || '暂无'}</dd>
        </div>
        <div>
          <dt>当前文档提及</dt>
          <dd>{entity.mentionsByFile?.[currentFileId] ?? entity.mentionCount ?? 0}</dd>
        </div>
      </dl>
    </div>
  );
}

function FindingCard({ finding, onAccept, onDismiss }) {
  const actionLabel = useMemo(() => {
    if (finding.kind === 'alias-merge') return '合并别名';
    if (finding.kind === 'conflict') return '标记已知';
    return '确认';
  }, [finding.kind]);

  return (
    <article className="novel-suggestion-card">
      <div className="novel-suggestion-header-row">
        <div className="novel-suggestion-title">{finding.title}</div>
        <span className="novel-suggestion-source">本地发现</span>
      </div>
      <p>{finding.reason}</p>
      <div className="novel-suggestion-meta">
        <span>置信度 {Math.round((finding.confidence ?? 0) * 100)}%</span>
      </div>
      <div className="novel-suggestion-actions">
        <button type="button" className="novel-primary-btn" onClick={() => onAccept(finding.id)}>
          {actionLabel}
        </button>
        <button type="button" className="novel-secondary-btn" onClick={() => onDismiss(finding.id)}>
          忽略
        </button>
      </div>
    </article>
  );
}

function AgentSuggestionCard({ suggestion, onAcknowledge, onDismiss }) {
  return (
    <article className="novel-suggestion-card novel-agent-suggestion-card">
      <div className="novel-suggestion-header-row">
        <div className="novel-suggestion-title">{suggestion.title}</div>
        <span className="novel-suggestion-source is-agent">Agent 建议</span>
      </div>
      <p>{suggestion.reason}</p>
      <div className="novel-suggestion-meta">
        <span>当前状态 {STATUS_LABELS[suggestion.status] ?? '待确认'}</span>
      </div>
      <div className="novel-suggestion-actions">
        <button type="button" className="novel-primary-btn" onClick={() => onAcknowledge(suggestion.id)}>
          知道了
        </button>
        <button type="button" className="novel-secondary-btn" onClick={() => onDismiss(suggestion.id)}>
          忽略
        </button>
      </div>
    </article>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="novel-empty-state">
      <div>{title}</div>
      <p>{description}</p>
    </div>
  );
}

function SceneSection({ currentScene }) {
  if (!currentScene) {
    return (
      <EmptyState
        title="当前场景尚未成形"
        description="继续写下去，角色、地点、目标会在停顿后自动浮现。"
      />
    );
  }

  return (
    <div className="novel-scene-card" data-testid="novel-current-scene">
      <div className="novel-scene-header">
        <div>
          <h4>{currentScene.title || '当前场景'}</h4>
          <p>{currentScene.anchorText}</p>
        </div>
      </div>
      <dl className="novel-scene-grid">
        <div>
          <dt>地点</dt>
          <dd>{currentScene.location || '未识别'}</dd>
        </div>
        <div>
          <dt>角色</dt>
          <dd>{currentScene.participants?.join('、') || '未识别'}</dd>
        </div>
        <div>
          <dt>目标</dt>
          <dd>{currentScene.goal || '未识别'}</dd>
        </div>
        <div>
          <dt>冲突</dt>
          <dd>{currentScene.conflict || '未识别'}</dd>
        </div>
        <div>
          <dt>时间提示</dt>
          <dd>{currentScene.timeHint || '未识别'}</dd>
        </div>
        <div>
          <dt>未回收线索</dt>
          <dd>{currentScene.openThreads?.join('；') || '暂无'}</dd>
        </div>
      </dl>
    </div>
  );
}

function AgentSection({ currentScene, activeEntity, onRequestScene, onRequestEntity }) {
  return (
    <div className="novel-agent-action-list">
      <button
        type="button"
        className="novel-secondary-btn novel-agent-action-btn"
        onClick={() => onRequestScene(currentScene)}
        disabled={!currentScene}
      >
        补全当前场景
      </button>
      <button
        type="button"
        className="novel-secondary-btn novel-agent-action-btn"
        onClick={() => onRequestEntity(activeEntity)}
        disabled={!activeEntity}
      >
        补全当前实体
      </button>
      <p className="novel-agent-helper">
        {activeEntity
          ? `当前可交给 Agent 的实体：${activeEntity.name}`
          : '先在正文里点击一个实体，再把它交给 Agent 做补全。'}
      </p>
    </div>
  );
}

function OverviewCard({ label, value, hint }) {
  return (
    <article className="novel-overview-card">
      <div className="novel-overview-label">{label}</div>
      <div className="novel-overview-value">{value}</div>
      <p>{hint}</p>
    </article>
  );
}

function NovelAssistantPanel({
  open,
  currentScene,
  entities,
  currentFileId,
  findings,
  agentSuggestions,
  onClose,
  onEntityUpdate,
  onAcceptFinding,
  onDismissFinding,
  onAcknowledgeAgentSuggestion,
  onDismissAgentSuggestion,
  onRequestAgentScene,
  onRequestAgentEntity,
  onInsertEntity,
  activeEntityId,
  onSelectEntity,
}) {
  const sortedEntities = useMemo(() => {
    return [...entities].sort((left, right) => {
      const leftActive = left.mentionsByFile?.[currentFileId] ?? 0;
      const rightActive = right.mentionsByFile?.[currentFileId] ?? 0;
      if (leftActive === rightActive) return (right.mentionCount ?? 0) - (left.mentionCount ?? 0);
      return rightActive - leftActive;
    });
  }, [entities, currentFileId]);

  const pendingFindings = (findings ?? []).filter((suggestion) => suggestion.status === 'pending');
  const pendingAgentSuggestions = (agentSuggestions ?? []).filter(
    (suggestion) => suggestion.status === 'pending',
  );
  const groupedEntities = useMemo(() => {
    return ENTITY_GROUP_ORDER.map((type) => ({
      type,
      entities: sortedEntities.filter((entity) => entity.type === type),
    })).filter((group) => group.entities.length > 0);
  }, [sortedEntities]);
  const quickInsertEntities = useMemo(() => {
    return sortedEntities
      .filter((entity) => (entity.mentionsByFile?.[currentFileId] ?? 0) > 0)
      .slice(0, 8);
  }, [sortedEntities, currentFileId]);
  const activeEntity = useMemo(() => {
    return sortedEntities.find((entity) => entity.id === activeEntityId) ?? null;
  }, [sortedEntities, activeEntityId]);
  const totalPendingCount = pendingFindings.length + pendingAgentSuggestions.length;
  const [activeQueueTab, setActiveQueueTab] = useState(() => {
    if (pendingFindings.length > 0) return 'findings';
    if (pendingAgentSuggestions.length > 0) return 'agent-suggestions';
    return 'agent-actions';
  });

  useEffect(() => {
    if (activeQueueTab === 'findings' && pendingFindings.length > 0) return;
    if (activeQueueTab === 'agent-suggestions' && pendingAgentSuggestions.length > 0) return;
    if (pendingFindings.length > 0) {
      setActiveQueueTab('findings');
      return;
    }
    if (pendingAgentSuggestions.length > 0) {
      setActiveQueueTab('agent-suggestions');
      return;
    }
    setActiveQueueTab('agent-actions');
  }, [activeQueueTab, pendingFindings.length, pendingAgentSuggestions.length]);

  return (
    <aside
      className={`novel-assistant-panel ${open ? 'open' : 'closed'}`}
      data-testid="novel-assistant-panel"
    >
      <div className="novel-panel-header">
        <div>
          <p className="novel-panel-kicker">NOVEL MODE</p>
          <h3>边写边生长</h3>
        </div>
        <button type="button" className="novel-close-btn" onClick={onClose}>
          收起
        </button>
      </div>

      <section className="novel-panel-section">
        <div className="novel-overview-grid">
          <OverviewCard
            label="当前场景"
            value={currentScene?.location || currentScene?.title || '等待识别'}
            hint={currentScene ? '会随着写作自动刷新' : '继续写作后自动出现'}
          />
          <OverviewCard
            label="当前关注"
            value={activeEntity?.name || '未锁定实体'}
            hint={activeEntity ? `${ENTITY_TYPE_LABELS[activeEntity.type] ?? '实体'}已定位` : '点击正文高亮后聚焦'}
          />
          <OverviewCard
            label="待处理"
            value={`${totalPendingCount} 条`}
            hint={totalPendingCount > 0 ? '包含实时发现和 Agent 建议' : '目前没有需要处理的项'}
          />
        </div>
      </section>

      <section className="novel-panel-section">
        <div className="novel-section-header">
          <h4>当前关注</h4>
          <span>{activeEntity ? '场景与实体已聚焦' : '聚焦当前写作上下文'}</span>
        </div>
        <div className="novel-focus-grid">
          <SceneSection currentScene={currentScene} />
          <EntityDetailSection
            entity={activeEntity}
            currentFileId={currentFileId}
            onInsert={onInsertEntity}
          />
        </div>
        <div className="novel-section-header compact">
          <h4>常用引用</h4>
          <span>{quickInsertEntities.length} 个</span>
        </div>
        <QuickInsertSection entities={quickInsertEntities} onInsert={onInsertEntity} />
      </section>

      <section className="novel-panel-section">
        <div className="novel-section-header">
          <h4>设定管理</h4>
          <span>{sortedEntities.length} 张实体卡</span>
        </div>
        <div className="novel-entity-groups">
          {sortedEntities.length > 0 ? (
            groupedEntities.map((group) => (
              <EntityGroupSection
                key={group.type}
                type={group.type}
                entities={group.entities}
                currentFileId={currentFileId}
                onEntityUpdate={onEntityUpdate}
                onInsertEntity={onInsertEntity}
                activeEntityId={activeEntityId}
                onSelectEntity={onSelectEntity}
              />
            ))
          ) : (
            <EmptyState
              title="还没有实体卡"
              description="出现重复角色名、地点名或任务目标后，会自动长出待确认卡片。"
            />
          )}
        </div>
      </section>

      <section className="novel-panel-section">
        <div className="novel-section-header">
          <h4>处理队列</h4>
          <span>{totalPendingCount > 0 ? `${totalPendingCount} 条待处理` : '当前已清空'}</span>
        </div>
        <div className="novel-queue-shell">
          <div className="novel-queue-tabs">
            <button
              type="button"
              className={`novel-queue-tab ${activeQueueTab === 'findings' ? 'active' : ''}`}
              onClick={() => setActiveQueueTab('findings')}
            >
              <span>实时发现</span>
              <span className="novel-queue-tab-badge">{pendingFindings.length}</span>
            </button>
            <button
              type="button"
              className={`novel-queue-tab ${activeQueueTab === 'agent-actions' ? 'active' : ''}`}
              onClick={() => setActiveQueueTab('agent-actions')}
            >
              <span>小说 Agent</span>
            </button>
            <button
              type="button"
              className={`novel-queue-tab ${activeQueueTab === 'agent-suggestions' ? 'active' : ''}`}
              onClick={() => setActiveQueueTab('agent-suggestions')}
            >
              <span>Agent 建议</span>
              <span className="novel-queue-tab-badge">{pendingAgentSuggestions.length}</span>
            </button>
          </div>

          <div className="novel-queue-panel">
            {activeQueueTab === 'findings' ? (
              <div className="novel-suggestion-list">
                {pendingFindings.length > 0 ? (
                  pendingFindings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      onAccept={onAcceptFinding}
                      onDismiss={onDismissFinding}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="暂时没有新的实时发现"
                    description="如果识别到新角色、别名或设定冲突，这里会提醒你决定。"
                  />
                )}
              </div>
            ) : null}

            {activeQueueTab === 'agent-actions' ? (
              <AgentSection
                currentScene={currentScene}
                activeEntity={activeEntity}
                onRequestScene={onRequestAgentScene}
                onRequestEntity={onRequestAgentEntity}
              />
            ) : null}

            {activeQueueTab === 'agent-suggestions' ? (
              <div className="novel-suggestion-list">
                {pendingAgentSuggestions.length > 0 ? (
                  pendingAgentSuggestions.map((suggestion) => (
                    <AgentSuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onAcknowledge={onAcknowledgeAgentSuggestion}
                      onDismiss={onDismissAgentSuggestion}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="Agent 还没有新的建议"
                    description="你可以按需把当前场景或当前实体交给 Agent，再回来决定是否采纳。"
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </aside>
  );
}

export default NovelAssistantPanel;
