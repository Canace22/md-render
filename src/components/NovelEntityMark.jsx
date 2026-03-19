import { getEntityTypeGlyph, getEntityTypeLabel } from '../core/novel/shared';

export default function NovelEntityMark({ type, showLabel = false, className = '' }) {
  const classes = ['novel-entity-mark', type ? `is-${type}` : '', showLabel ? 'with-label' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      <span className="novel-entity-mark-glyph">{getEntityTypeGlyph(type)}</span>
      {showLabel ? <span className="novel-entity-mark-label">{getEntityTypeLabel(type)}</span> : null}
    </span>
  );
}
