import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, FileText, Link, Plus } from 'lucide-react';
import {
  DRAFT_STATUS_OPTIONS,
  NODE_TYPE_OPTIONS,
  PROPERTY_TEMPLATES,
  groupProperties,
  listAddableProperties,
  resolveVisibleProperties,
} from '@shared/properties.js';
import { PUBLISHING_PLATFORM_OPTIONS } from '../utils/publishingPlatforms.js';
import {
  dbGetBacklinks,
  dbGetVersions,
  hasDbBridge,
} from '../services/electronBridge.js';
import PropertyField from './properties/PropertyField.jsx';

/* ── pure helpers ──────────────────────────────────────────── */

const toList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};

/** 属性当前的值：内置属性读节点字段，用户自加的读 frontmatter */
const resolvePropertyValue = (file, property) => {
  if (property.custom) return file?.frontmatter?.[property.key] ?? '';

  switch (property.field) {
    case 'title': return file?.title ?? file?.frontmatter?.title ?? '';
    case 'createdAt': return Object.prototype.hasOwnProperty.call(file?.frontmatter ?? {}, 'created')
      ? file.frontmatter.created
      : (file?.createdAt ?? '');
    case 'draftStatus': return file?.draftStatus ?? file?.status ?? 'drafting';
    case 'nodeType': return file?.nodeType ?? 'document';
    case 'targetPlatforms': return toList(file?.targetPlatforms ?? file?.platforms);
    case 'scheduledPublishAt': return file?.scheduledPublishAt ?? file?.publishAt ?? '';
    case 'relatedIds': return toList(file?.relatedIds);
    case 'sourceMaterialIds': return toList(file?.sourceMaterialIds ?? file?.sourceMaterials);
    case 'tags': return toList(file?.tags);
    case 'aliases': return toList(file?.aliases);
    default: return file?.[property.field] ?? '';
  }
};

/** 已选但不在选项表里的值也要显示出来，否则用户会以为丢了 */
const withUnknownOptions = (options, currentValues) => {
  const known = new Set(options.map((option) => option.value));
  return [
    ...options,
    ...currentValues.filter((value) => !known.has(value)).map((value) => ({ value, label: value })),
  ];
};

const collectReusableTags = (allFiles) => {
  const counts = new Map();
  (allFiles ?? []).forEach((file) => {
    (file?.tags ?? []).forEach((tag) => {
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => ({ label: tag, value: tag }));
};

const isPlatformArticle = (file) => {
  return Boolean(String(file?.frontmatter?.platform ?? '').trim());
};

const resolveTemplateKeys = (file) => {
  if (isPlatformArticle(file)) return PROPERTY_TEMPLATES.platformArticle;
  return file?.nodeType === 'bookmark' ? PROPERTY_TEMPLATES.bookmark : PROPERTY_TEMPLATES.draft;
};

/* ── main component ────────────────────────────────────────── */

export default function DocMetaPanel({
  selectedFile,
  allFiles = [],
  onMetaChange,
  onTagsChange,
  onFrontmatterPropertyChange,
  onOpenFile,
  onManageSourceMaterials,
  onManageRelatedDocs,
  onOpenVersionHistory,
  statusOptions = DRAFT_STATUS_OPTIONS,
  platformOptions = PUBLISHING_PLATFORM_OPTIONS,
  disabled = false,
}) {
  const [backlinks, setBacklinks] = useState([]);
  const [versions, setVersions] = useState([]);
  const [addingProperty, setAddingProperty] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState('');
  // 刚添加或刚改过的属性：在面板上占位，避免清空值时整行突然消失（切换文档后重置）
  const [pendingKeys, setPendingKeys] = useState([]);

  useEffect(() => {
    if (!selectedFile?.id || !hasDbBridge()) { setBacklinks([]); return; }
    dbGetBacklinks(selectedFile.id)
      .then((res) => setBacklinks(res?.backlinks ?? []))
      .catch(() => setBacklinks([]));
  }, [selectedFile?.id]);

  useEffect(() => {
    if (!selectedFile?.id || !hasDbBridge()) { setVersions([]); return; }
    dbGetVersions(selectedFile.id)
      .then((res) => setVersions(res?.versions ?? []))
      .catch(() => setVersions([]));
  }, [selectedFile?.id]);

  useEffect(() => {
    setAddingProperty(false);
    setNewPropertyName('');
    setPendingKeys([]);
  }, [selectedFile?.id]);

  const filesById = useMemo(() => new Map((allFiles ?? []).map((f) => [f.id, f])), [allFiles]);
  const tagOptions = useMemo(() => collectReusableTags(allFiles), [allFiles]);
  const properties = useMemo(() => {
    const frontmatter = { ...(selectedFile?.frontmatter ?? {}) };
    pendingKeys.forEach((key) => {
      if (!(key in frontmatter)) frontmatter[key] = '';
    });
    return resolveVisibleProperties(frontmatter, resolveTemplateKeys(selectedFile));
  }, [selectedFile, pendingKeys, platformOptions]);

  if (!selectedFile) return null;

  const keepVisible = (key) => {
    setPendingKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
  };

  const handleChange = (property, nextValue) => {
    keepVisible(property.key);
    if (property.custom) {
      onFrontmatterPropertyChange?.(selectedFile.id, property.key, nextValue);
      return;
    }
    if (property.field === 'tags') {
      onTagsChange?.(selectedFile.id, nextValue);
      return;
    }
    onMetaChange?.(selectedFile.id, { [property.field]: nextValue });
  };

  const resolveOptions = (property, value) => {
    if (property.key === 'status') return statusOptions;
    if (property.key === 'type') return NODE_TYPE_OPTIONS;
    if (property.key === 'platforms') return withUnknownOptions(platformOptions, value ?? []);
    return property.options ?? [];
  };

  const templateKeys = resolveTemplateKeys(selectedFile);

  /** 移除属性 = 清空值（空值落盘即删除该 key），并取消占位 */
  const removeProperty = (property, value) => {
    setPendingKeys((keys) => keys.filter((key) => key !== property.key));
    if (property.custom) {
      onFrontmatterPropertyChange?.(selectedFile.id, property.key, '');
      return;
    }
    onMetaChange?.(selectedFile.id, { [property.field]: Array.isArray(value) ? [] : '' });
  };

  const resolveExtraAction = (property, value) => {
    if (property.key === 'sources' && onManageSourceMaterials) {
      return <button type="button" className="doc-meta-action" onClick={() => onManageSourceMaterials(selectedFile.id)} disabled={disabled}>管理</button>;
    }
    if (property.key === 'related' && onManageRelatedDocs) {
      return <button type="button" className="doc-meta-action" onClick={() => onManageRelatedDocs(selectedFile.id)} disabled={disabled}>管理</button>;
    }
    if (!templateKeys.includes(property.key)) {
      return <button type="button" className="doc-meta-action" onClick={() => removeProperty(property, value)} disabled={disabled}>移除</button>;
    }
    return null;
  };

  const closeAddMenu = () => {
    setAddingProperty(false);
    setNewPropertyName('');
  };

  const addProperty = (key) => {
    closeAddMenu();
    if (!key || properties.some((property) => property.key === key)) return;
    keepVisible(key);
  };

  const commitNewProperty = () => addProperty(newPropertyName.trim());
  const addableGroups = listAddableProperties(properties.map((property) => property.key));
  const showBacklinks = hasDbBridge() && backlinks.length > 0;
  // 反向链接不是属性，但归在「关联」组；只有反链时也要把这组亮出来
  const groups = groupProperties(properties, showBacklinks ? ['relation'] : []);

  const relationContext = {
    filesById,
    selectedFile,
    allFiles,
    onOpenFile,
  };

  return (
    <div className="doc-meta-panel" data-testid="doc-meta-panel">
      {groups.map((group) => (
        <section key={group.key} className="doc-meta-group" data-group={group.key}>
          <div className="doc-meta-group-title">{group.label}</div>
          {group.properties.map((property) => {
            const value = resolvePropertyValue(selectedFile, property);
            return (
              <PropertyField
                key={property.key}
                property={property}
                value={value}
                options={resolveOptions(property, value)}
                tagOptions={property.key === 'tags' ? tagOptions : []}
                onChange={(next) => handleChange(property, next)}
                disabled={disabled || (property.field === 'tags' && !onTagsChange)}
                relationContext={relationContext}
                extraAction={resolveExtraAction(property, value)}
              />
            );
          })}
          {group.key === 'relation' && showBacklinks && (
            <div className="doc-meta-field">
              <span className="doc-meta-label">
                <Link size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
                反向链接
              </span>
              <div className="doc-meta-chip-list">
                {backlinks.map((backlink) => (
                  <button key={backlink.id} type="button" className="doc-meta-chip doc-meta-chip--backlink" onClick={() => onOpenFile?.(backlink.id)} title={`打开 ${backlink.name}`}>
                    <FileText size={11} strokeWidth={1.8} />
                    <span>{backlink.name.replace(/\.md$/i, '')}</span>
                    <ArrowLeft size={10} strokeWidth={2} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      {/* ── 添加属性：没显示的内置属性按组列出，也可以自定义 ── */}
      <div className="doc-meta-field doc-meta-add-property">
        {addingProperty ? (
          <div className="doc-meta-add-menu">
            {addableGroups.map((group) => (
              <div key={group.key} className="doc-meta-add-group">
                <span className="doc-meta-group-title">{group.label}</span>
                <div className="doc-meta-chip-list">
                  {group.properties.map((def) => (
                    <button key={def.key} type="button" className="doc-meta-chip" onClick={() => addProperty(def.key)} disabled={disabled}>
                      {def.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <input
              className="doc-meta-input"
              autoFocus
              value={newPropertyName}
              placeholder="自定义属性名，回车添加（英文更利于 Obsidian 识别）"
              onChange={(event) => setNewPropertyName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); commitNewProperty(); }
                if (event.key === 'Escape') { event.preventDefault(); closeAddMenu(); }
              }}
              disabled={disabled}
            />
            <button type="button" className="doc-meta-action" onClick={closeAddMenu}>取消</button>
          </div>
        ) : (
          <button type="button" className="doc-meta-action" onClick={() => setAddingProperty(true)} disabled={disabled}>
            <Plus size={12} strokeWidth={2} /> 添加属性
          </button>
        )}
      </div>

      {/* ── 版本历史：入口，详情在 VersionHistoryModal ── */}
      {hasDbBridge() && versions.length > 0 && onOpenVersionHistory && (
        <>
          <div className="doc-meta-divider" />
          <button type="button" className="doc-meta-history-toggle" onClick={onOpenVersionHistory}>
            <Clock size={12} strokeWidth={1.8} className="doc-meta-label-icon" />
            版本历史
            <span className="doc-meta-history-count">{versions.length}</span>
          </button>
        </>
      )}
    </div>
  );
}
