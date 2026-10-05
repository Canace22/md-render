import { useCallback, useEffect, useState } from 'react';
import { BUILTIN_SKILL_ENTRIES } from '../core/agent/builtinSkills.js';
import { buildSkillRegistry } from '../core/agent/skillRegistry.js';
import { fetchVaultSkillEntries, onVaultSkillsChanged } from '../utils/skillFilesBridge.js';

const INITIAL_REGISTRY = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });

/**
 * 产品 skill 列表：内置 + 内容库，内容库目录有变化时自动重新加载（不用重启）。
 * @returns {{ skills: object[], warnings: string[], reload: () => Promise<void> }}
 */
export function useSkillRegistry() {
  const [registry, setRegistry] = useState(INITIAL_REGISTRY);

  const reload = useCallback(async () => {
    try {
      const vault = await fetchVaultSkillEntries();
      setRegistry(buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES, vault }));
    } catch (error) {
      setRegistry({ ...INITIAL_REGISTRY, warnings: [...INITIAL_REGISTRY.warnings, error.message] });
    }
  }, []);

  useEffect(() => {
    reload();
    return onVaultSkillsChanged(() => { reload(); });
  }, [reload]);

  return { ...registry, reload };
}
