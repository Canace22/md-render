import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getActiveSource,
  getActiveSourceId,
  listAiSources,
  setActiveSource,
} from '../core/agent/aiClient.js';
import {
  SOURCE_KINDS,
  consumeDefaultSourceNotice,
  getDetectedLocalAgents,
  isLocalAgentSafeMode,
  loadLocalAgentModelOptions,
  loadLocalAgents,
  saveSourceModel,
  setLocalAgentSafeMode,
} from '../core/agent/aiSources.js';

/**
 * AI 来源状态（面板切换器 + 设置页共用）：检测本机 agent、当前来源、各来源模型选项、安全模式。
 * @param {{ providersReady?: boolean }} options  内置服务商列表加载完后重算默认来源
 */
export function useAiSource({ providersReady = false } = {}) {
  const [detected, setDetected] = useState(getDetectedLocalAgents);
  const [detecting, setDetecting] = useState(false);
  const [sourceId, setSourceId] = useState(getActiveSourceId);
  const [modelOptions, setModelOptions] = useState({});
  const [modelVersion, setModelVersion] = useState(0);
  const [safeMode, setSafeModeState] = useState(isLocalAgentSafeMode);
  const [defaultNotice, setDefaultNotice] = useState('');

  const loadModels = useCallback(async (list) => {
    const runnable = list.filter((item) => item.supported && item.installed);
    const entries = await Promise.all(runnable.map(async (item) => [`local:${item.id}`, await loadLocalAgentModelOptions(item.id)]));
    setModelOptions((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  }, []);

  const detect = useCallback(async ({ refresh = false } = {}) => {
    setDetecting(true);
    try {
      const list = await loadLocalAgents({ refresh });
      setDetected(list);
      const next = getActiveSourceId();
      setSourceId(next);
      if (consumeDefaultSourceNotice(next)) setDefaultNotice(`已使用本机 ${getActiveSource(next).label}，可在这里切换`);
      loadModels(list);
    } finally {
      setDetecting(false);
    }
  }, [loadModels]);

  useEffect(() => { detect(); }, [detect]);
  useEffect(() => { if (providersReady) setSourceId(getActiveSourceId()); }, [providersReady]);

  const selectSource = useCallback((nextId) => {
    setActiveSource(nextId);
    setSourceId(nextId);
    setDefaultNotice('');
  }, []);

  const selectModel = useCallback((targetSourceId, model) => {
    saveSourceModel(targetSourceId, model);
    setModelVersion((value) => value + 1);
  }, []);

  const setSafeMode = useCallback((enabled) => {
    setLocalAgentSafeMode(enabled);
    setSafeModeState(Boolean(enabled));
  }, []);

  // detected / providersReady 变化时列表要重算
  const sources = useMemo(() => listAiSources(), [detected, providersReady]);
  const activeSource = useMemo(
    () => getActiveSource(sourceId),
    [sourceId, detected, modelVersion, safeMode],
  );

  return {
    detected,
    detecting,
    sources,
    activeSource,
    isLocal: activeSource.kind === SOURCE_KINDS.LOCAL,
    modelOptions,
    safeMode,
    defaultNotice,
    dismissDefaultNotice: () => setDefaultNotice(''),
    redetect: () => detect({ refresh: true }),
    selectSource,
    selectModel,
    setSafeMode,
  };
}
