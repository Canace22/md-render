/**
 * skill → AI 面板里的条目（slash 列表、欢迎页、「+」菜单、技能页共用）。
 * 图标和配色只是界面装饰：内置 skill 按 id 配，其余按分组兜底，内容库 skill 统一用默认样式。
 */

import {
  ApartmentOutlined,
  ArrowsAltOutlined,
  CameraOutlined,
  CompressOutlined,
  FileTextOutlined,
  HighlightOutlined,
  PlusOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import { Activity, Bot, Check, FileText, MessageSquareQuote, PackageCheck, Plus, ShieldCheck, Sparkles } from 'lucide-react';

const SKILL_STYLES = Object.freeze({
  'wechat-version': [WechatOutlined, 'green'],
  'xiaohongshu-version': [CameraOutlined, 'magenta'],
  'zhihu-version': [FileTextOutlined, 'slate'],
  outline: [ApartmentOutlined, 'teal'],
  expand: [ArrowsAltOutlined, 'blue'],
  'continue-writing': [ArrowsAltOutlined, 'blue'],
  polish: [HighlightOutlined, 'rose'],
  compress: [CompressOutlined, 'amber'],
  'title-suggestions': [FileTextOutlined, 'cyan'],
  'editorial-review': [ShieldCheck, 'violet'],
  'editorial-headline': [HighlightOutlined, 'cyan'],
  'editorial-retro': [Activity, 'amber'],
  'topic-entry': [ApartmentOutlined, 'teal'],
  'draft-entry': [FileTextOutlined, 'blue'],
  'material-entry': [FileTextOutlined, 'amber'],
  'ready-entry': [FileTextOutlined, 'green'],
  'daily-task': [Check, 'cyan'],
  'daily-note': [MessageSquareQuote, 'slate'],
  'todo-pool': [Check, 'violet'],
  'canvas-flow': [ArrowsAltOutlined, 'rose'],
  'canvas-cards': [PlusOutlined, 'teal'],
  'related-docs': [FileText, 'slate'],
  'workspace-brief': [Bot, 'gray'],
  'new-folder': [Plus, 'purple'],
  'create-deliverable': [PackageCheck, 'teal'],
  'app-diagnostics': [Activity, 'rose'],
});

const DEFAULT_STYLE = [Sparkles, 'violet'];
const VAULT_CATEGORY = '我的 skill';
const SENTENCE_END_RE = /[。！？.!?]/;

/** 取 description 第一句做界面短说明 */
export const toShortDescription = (description = '') => {
  const text = String(description).trim();
  const index = text.search(SENTENCE_END_RE);
  return index > 0 ? text.slice(0, index) : text;
};

export const toSkillItem = (skill) => {
  const [icon, tone] = (skill.source === 'builtin' && SKILL_STYLES[skill.id]) || DEFAULT_STYLE;
  const description = toShortDescription(skill.description);
  return {
    id: skill.id,
    type: 'skill',
    skillId: skill.id,
    label: skill.label,
    description,
    category: skill.group || (skill.source === 'vault' ? VAULT_CATEGORY : '其他'),
    icon,
    tone,
    entry: skill.entry,
    source: skill.source,
    skillPath: skill.skillPath,
    searchText: [skill.id, skill.label, description, ...skill.aliases].join(' ').toLowerCase(),
  };
};

export const pickSkillItems = (items, entry) => items.filter((item) => item.entry.includes(entry));
