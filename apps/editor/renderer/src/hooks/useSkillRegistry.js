import { useCallback, useEffect, useState } from 'react';
import { BUILTIN_SKILL_ENTRIES } from '../core/agent/builtinSkills.js';
import { buildSkillRegistry } from '../core/agent/skillRegistry.js';
import { fetchVaultSkillEntries, onVaultSkillsChanged } from '../utils/skillFilesBridge.js';

const INITIAL_REGISTRY = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });

/**
 * 产品 skill 列表：内置 + 内容库，内容库目录有变化时自动重新加载（不用重启）。
 * @returns {{ skills: object[], warnings: string[], loaded: boolean, reload: () => Promise<void> }}
 */
export function useSkillRegistry() {
  const [registry, setRegistry] = useState(INITIAL_REGISTRY);
  // 内容库 skill 读完（成功或失败）后为 true；之前只有内置 skill
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const vault = await fetchVaultSkillEntries();
      setRegistry(buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES, vault }));
    } catch (error) {
      setRegistry({ ...INITIAL_REGISTRY, warnings: [...INITIAL_REGISTRY.warnings, error.message] });
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
    return onVaultSkillsChanged(() => { reload(); });
  }, [reload]);

  return { ...registry, loaded, reload };
}
