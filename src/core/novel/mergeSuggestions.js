import {
  createNovelId,
  detectTypeBySuffix,
  getEntityTypeLabel,
  hasManualField,
  mergeAliases,
  normalizeName,
  sumMentionMap,
  uniqueList,
} from './shared.js';

function cloneEntity(entity) {
  return {
    ...entity,
    aliases: [...(entity.aliases ?? [])],
    traits: [...(entity.traits ?? [])],
    relations: [...(entity.relations ?? [])],
    mentionsByFile: { ...(entity.mentionsByFile ?? {}) },
    manualFields: { ...(entity.manualFields ?? {}) },
  };
}

function ensureSuggestion(existingMap, suggestion) {
  const existing = existingMap.get(suggestion.id);
  return existing
    ? { ...existing, ...suggestion, status: existing.status ?? suggestion.status }
    : suggestion;
}

function applyEntityMerge(existing, candidate, fileId) {
  const next = cloneEntity(existing);
  next.aliases = mergeAliases(next.aliases, candidate.aliases ?? []);
  next.traits = uniqueList([...(next.traits ?? []), ...(candidate.traits ?? [])]);

  if (!hasManualField(next, 'summary') && candidate.summary) {
    next.summary = candidate.summary.length > (next.summary?.length ?? 0) ? candidate.summary : next.summary;
  }

  next.mentionsByFile[fileId] = candidate.mentionCount;
  next.mentionCount = sumMentionMap(next.mentionsByFile);
  return next;
}

function buildPendingEntity(candidate, fileId) {
  return {
    ...candidate,
    sourceFileId: candidate.sourceFileId || fileId,
    status: candidate.status || 'pending',
    mentionsByFile: {
      [fileId]: candidate.mentionCount,
    },
    manualFields: {},
  };
}

function findExactEntity(entities, candidate) {
  const normalized = normalizeName(candidate.name);
  return entities.find((entity) => {
    const names = [entity.name, ...(entity.aliases ?? [])].map(normalizeName);
    return names.includes(normalized);
  });
}

function findAliasMergeTarget(entities, candidate) {
  const normalized = normalizeName(candidate.name);
  return entities.find((entity) => {
    if (entity.type !== candidate.type) return false;
    const current = normalizeName(entity.name);
    if (!current || current === normalized) return false;
    if (current.includes(normalized) || normalized.includes(current)) {
      return Math.abs(current.length - normalized.length) <= 2;
    }
    return false;
  });
}

function findConflictTarget(entities, candidate) {
  const normalized = normalizeName(candidate.name);
  const candidateType = candidate.type || detectTypeBySuffix(candidate.name);
  const candidateSuffix = normalized.slice(-1);

  return entities.find((entity) => {
    const entityType = entity.type || detectTypeBySuffix(entity.name);
    if (entityType !== candidateType) return false;
    const current = normalizeName(entity.name);
    if (!current || current === normalized) return false;
    if (current.slice(-1) !== candidateSuffix) return false;
    if (current[0] !== normalized[0]) return false;
    if (current.includes(normalized) || normalized.includes(current)) return false;
    return (entity.status === 'confirmed' || entity.mentionCount >= 2);
  });
}

function createSuggestion(kind, payload) {
  const id = createNovelId('suggestion', `${kind}:${payload.targetId}:${payload.payloadKey ?? ''}`);
  return {
    id,
    kind,
    targetId: payload.targetId,
    title: payload.title,
    reason: payload.reason,
    confidence: payload.confidence,
    payload: payload.payload,
    status: 'pending',
  };
}

export function mergeSuggestions(options = {}) {
  const {
    existingEntities = [],
    extractedEntities = [],
    existingSuggestions = [],
    fileId = '',
  } = options;

  const nextEntities = existingEntities.map(cloneEntity);
  nextEntities.forEach((entity) => {
    if (entity.mentionsByFile?.[fileId]) {
      entity.mentionsByFile[fileId] = 0;
      entity.mentionCount = sumMentionMap(entity.mentionsByFile);
    }
  });

  const suggestionMap = new Map();
  existingSuggestions.forEach((suggestion) => suggestionMap.set(suggestion.id, suggestion));

  extractedEntities.forEach((candidate) => {
    const exact = findExactEntity(nextEntities, candidate);
    if (exact) {
      const index = nextEntities.findIndex((entity) => entity.id === exact.id);
      nextEntities[index] = applyEntityMerge(exact, candidate, fileId);
      return;
    }

    const pendingEntity = buildPendingEntity(candidate, fileId);
    const aliasTarget = findAliasMergeTarget(nextEntities, candidate);
    if (aliasTarget) {
      if (!nextEntities.some((entity) => entity.id === pendingEntity.id)) {
        nextEntities.push(pendingEntity);
      }
      const suggestion = createSuggestion('alias-merge', {
        targetId: aliasTarget.id,
        payloadKey: pendingEntity.id,
        title: `合并别名：${candidate.name} / ${aliasTarget.name}`,
        reason: `检测到相近的${getEntityTypeLabel(candidate.type)}名称，建议先作为别名合并确认。`,
        confidence: 0.78,
        payload: {
          sourceEntityId: pendingEntity.id,
          alias: candidate.name,
        },
      });
      suggestionMap.set(suggestion.id, ensureSuggestion(suggestionMap, suggestion));
      return;
    }

    const conflictTarget = findConflictTarget(nextEntities, candidate);
    if (conflictTarget) {
      if (!nextEntities.some((entity) => entity.id === pendingEntity.id)) {
        nextEntities.push(pendingEntity);
      }
      const suggestion = createSuggestion('conflict', {
        targetId: conflictTarget.id,
        payloadKey: pendingEntity.id,
        title: `设定冲突：${candidate.name} / ${conflictTarget.name}`,
        reason: `与现有${getEntityTypeLabel(candidate.type)}「${conflictTarget.name}」高度相似，可能是新设定，也可能是命名冲突。`,
        confidence: 0.74,
        payload: {
          sourceEntityId: pendingEntity.id,
          candidateName: candidate.name,
        },
      });
      suggestionMap.set(suggestion.id, ensureSuggestion(suggestionMap, suggestion));
      return;
    }

    if (!nextEntities.some((entity) => entity.id === pendingEntity.id)) {
      nextEntities.push(pendingEntity);
    } else {
      const index = nextEntities.findIndex((entity) => entity.id === pendingEntity.id);
      nextEntities[index] = applyEntityMerge(nextEntities[index], pendingEntity, fileId);
    }

    const suggestion = createSuggestion('new-entity', {
      targetId: pendingEntity.id,
      payloadKey: pendingEntity.id,
      title: `确认建卡：${candidate.name}`,
      reason: `识别到新的${getEntityTypeLabel(candidate.type)}，已先生成待确认设定卡。`,
      confidence: 0.92,
      payload: {
        entityId: pendingEntity.id,
      },
    });
    suggestionMap.set(suggestion.id, ensureSuggestion(suggestionMap, suggestion));
  });

  const stableEntities = nextEntities
    .map((entity) => ({
      ...entity,
      aliases: uniqueList(entity.aliases ?? []),
      mentionCount: sumMentionMap(entity.mentionsByFile ?? {}),
    }))
    .sort((left, right) => (right.mentionCount || 0) - (left.mentionCount || 0));

  const nextSuggestions = Array.from(suggestionMap.values()).sort((left, right) => {
    if (left.status === right.status) return (right.confidence ?? 0) - (left.confidence ?? 0);
    return left.status === 'pending' ? -1 : 1;
  });

  return {
    entities: stableEntities,
    suggestions: nextSuggestions,
  };
}
