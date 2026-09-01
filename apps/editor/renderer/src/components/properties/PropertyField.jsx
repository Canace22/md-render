import {
  CalendarClock, CalendarDays, FileText, Image as ImageIcon, Link, Link2, PackageSearch, Tag,
} from 'lucide-react';
import {
  CheckboxControl, DateControl, ImageControl, MultiSelectControl,
  NumberControl, RelationControl, SelectControl, TagsControl, TextControl,
} from './propertyControls.jsx';

const ICONS = {
  cover: ImageIcon,
  tags: Tag,
  publish: CalendarClock,
  source: Link,
  related: Link2,
  sources: PackageSearch,
  title: FileText,
  published: CalendarDays,
  created: CalendarDays,
  description: FileText,
};

/** 一行属性：左边名字，右边按类型渲染的控件 */
export default function PropertyField({
  property,
  value,
  onChange,
  options = [],
  tagOptions = [],
  disabled = false,
  relationContext = null,
  extraAction = null,
}) {
  const Icon = ICONS[property.key];

  const renderControl = () => {
    switch (property.widget) {
      case 'select':
        return <SelectControl value={value ?? ''} options={options} onChange={onChange} disabled={disabled} />;
      case 'multi-select':
        return <MultiSelectControl value={value ?? []} options={options} onChange={onChange} disabled={disabled} label={property.label} />;
      case 'tags':
      case 'list':
        return <TagsControl value={value ?? []} options={tagOptions} onChange={onChange} disabled={disabled} placeholder="选择已有标签或直接输入" />;
      case 'checkbox':
        return <CheckboxControl value={value} onChange={onChange} disabled={disabled} />;
      case 'number':
        return <NumberControl value={value} onCommit={onChange} disabled={disabled} />;
      case 'date':
        return <DateControl value={value ?? ''} onCommit={onChange} disabled={disabled} placeholder="yyyy-mm-dd" dateOnly />;
      case 'datetime':
        return <DateControl value={value ?? ''} onCommit={onChange} disabled={disabled} />;
      case 'image':
        return <ImageControl value={value ?? ''} onCommit={onChange} disabled={disabled} />;
      case 'textarea':
        return <TextControl value={value ?? ''} onCommit={onChange} disabled={disabled} multiline placeholder="一句话说清核心观点或知识点。" />;
      case 'relation':
        return relationContext
          ? <RelationControl value={value ?? []} onChange={onChange} disabled={disabled} {...relationContext} />
          : null;
      case 'url':
      default:
        return <TextControl value={value ?? ''} onCommit={onChange} disabled={disabled} placeholder={property.custom ? '' : undefined} />;
    }
  };

  return (
    <div className="doc-meta-field" data-property={property.key}>
      <div className="doc-meta-section-head">
        <span className="doc-meta-label">
          {Icon && <Icon size={12} strokeWidth={1.8} className="doc-meta-label-icon" />}
          {property.label}
        </span>
        {extraAction}
      </div>
      {renderControl()}
    </div>
  );
}
