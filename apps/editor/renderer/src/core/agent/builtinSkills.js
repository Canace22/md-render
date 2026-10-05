/**
 * 内置产品 skill：构建期用 Vite `import.meta.glob` 把 `apps/editor/resources/skills/` 内联进包。
 * 桌面版和 Web 版都能用，打包时不用额外拷贝资源目录。
 *
 * 只负责把文件整理成 skillRegistry 认识的原始记录，解析交给 skillRegistry。
 */

const SKILL_FILES = import.meta.glob('../../../../resources/skills/*/SKILL.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const MANIFEST_FILES = import.meta.glob('../../../../resources/skills/*/agents/md-render.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const SKILL_DIR_RE = /resources\/skills\/([^/]+)\//;

const dirNameOf = (filePath) => filePath.match(SKILL_DIR_RE)?.[1] || '';

/** 把 glob 结果整理成原始记录（纯函数，方便单测） */
export const toBuiltinSkillEntries = (skillFiles = {}, manifestFiles = {}) => {
  const manifests = new Map(
    Object.entries(manifestFiles).map(([filePath, text]) => [dirNameOf(filePath), text]),
  );
  return Object.entries(skillFiles)
    .map(([filePath, text]) => {
      const dirName = dirNameOf(filePath);
      return {
        dirName,
        skillPath: `resources/skills/${dirName}/SKILL.md`,
        skillMarkdown: text,
        manifestYaml: manifests.get(dirName) ?? null,
      };
    })
    .filter((entry) => entry.dirName)
    .sort((a, b) => a.dirName.localeCompare(b.dirName));
};

export const BUILTIN_SKILL_ENTRIES = toBuiltinSkillEntries(SKILL_FILES, MANIFEST_FILES);
