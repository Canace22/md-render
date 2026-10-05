import { useMemo, useState } from 'react';
import { message } from 'antd';
import { Pencil, Plus } from 'lucide-react';
import { findBuiltinSkillEntry } from '../core/agent/builtinSkills.js';
import { buildSkillTemplate, nextSkillId } from '../core/agent/skillRegistry.js';
import {
  isVaultSkillsSupported,
  openVaultSkillFile,
  writeVaultSkill,
} from '../utils/skillFilesBridge.js';

const groupByCategory = (items) => {
  const groups = new Map();
  items.forEach((item) => {
    const category = item.category ?? '其他';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });
  return [...groups.entries()].map(([category, groupItems]) => ({ category, items: groupItems }));
};

/** 内置 skill 先复制到内容库（已复制过就用已有的），再打开；内容库 skill 直接打开 */
const openSkillForEdit = async (item) => {
  if (item.source === 'vault') {
    await openVaultSkillFile(item.skillPath);
    return;
  }
  const entry = findBuiltinSkillEntry(item.skillId);
  if (!entry) throw new Error('找不到内置 skill 原文');
  const { skillPath, existed } = await writeVaultSkill(entry);
  if (!existed) message.info(`已复制「${item.label}」到内容库，改完保存即生效`);
  await openVaultSkillFile(skillPath);
};

const createSkill = async (skills) => {
  const { skillPath } = await writeVaultSkill(buildSkillTemplate({ id: nextSkillId(skills) }));
  message.success('已新建 skill，改完保存即出现在列表里');
  await openVaultSkillFile(skillPath);
};

/**
 * AI 面板「技能」页：列表来自 skill registry；可编辑（内置的会先复制到内容库）、可新建。
 */
export default function AgentSkillsTab({ items, skills, warnings = [], isDisabled, onRun }) {
  const [filter, setFilter] = useState('');
  const canEdit = isVaultSkillsSupported();

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return groupByCategory(q ? items.filter((item) => item.searchText.includes(q)) : items);
  }, [items, filter]);

  const runSafely = (task) => task().catch((error) => message.error(error.message));

  return (
    <div className="agent-panel__tab-panel agent-panel__tab-panel--skills" role="tabpanel" aria-label="技能">
      <div className="agent-panel__skill-tab-head">
        <input
          className="agent-panel__skill-tab-search"
          value={filter}
          placeholder="搜索 skill"
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {warnings.length > 0 && (
        <div className="agent-panel__skill-warnings" role="alert">
          {warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      )}
      {groups.length === 0 ? (
        <div className="agent-panel__empty">没有匹配的 skill。</div>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="agent-panel__skill-group">
            <div className="agent-panel__skill-group-title">{group.category}</div>
            <div className="agent-panel__skill-grid">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="agent-panel__skill-card-wrap">
                    <button
                      type="button"
                      className="agent-panel__skill-card"
                      disabled={isDisabled(item)}
                      onClick={() => onRun(item)}
                    >
                      <span className={`agent-panel__skill-option-icon agent-panel__tool-btn--${item.tone}`}>
                        <Icon />
                      </span>
                      <span className="agent-panel__skill-option-main">
                        <span className="agent-panel__skill-option-label">{item.label}</span>
                        <span className="agent-panel__skill-option-desc">{item.description}</span>
                      </span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        className="agent-panel__skill-edit"
                        title={item.source === 'vault' ? '编辑 SKILL.md' : '复制到内容库并编辑'}
                        aria-label={`编辑 ${item.label}`}
                        onClick={() => runSafely(() => openSkillForEdit(item))}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
      {canEdit && (
        <button
          type="button"
          className="agent-panel__skill-new"
          onClick={() => runSafely(() => createSkill(skills))}
        >
          <Plus size={14} /> 新建 skill
        </button>
      )}
    </div>
  );
}
