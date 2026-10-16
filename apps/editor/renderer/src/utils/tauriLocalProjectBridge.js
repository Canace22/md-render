import { getDesktopRuntimeKind } from '../services/desktopBridge.js';
import {
  frontmatterToMetadata,
  metadataToFrontmatterPatch,
} from '@shared/properties.js';
import {
  parseFrontmatterDocument,
  updateFrontmatterInMarkdown,
} from '@shared/frontmatterDocument.js';
import { extractKnowledgeMetadataFromFrontmatter } from '@shared/frontmatter.js';
import {
  assertNoLocalMediaCapabilityUrlsInMarkdown,
  toDiskImageSrc,
} from './localMediaMarkdown.js';
import { assertDesktopMutationsAllowed } from '../services/desktopMutationBarrier.js';

const TAURI_READ_ONLY_MOUNT_PREFIX = 'tauri-ro:v1:';
const TAURI_READ_WRITE_MOUNT_PREFIX = 'tauri-rw:v1:';
const LEGACY_METADATA_FIELDS = Object.freeze([
  'title',
  'sourceAuthor',
  'sourcePublishedAt',
  'createdAt',
  'nodeType',
  'summary',
  'cover',
  'url',
  'aliases',
  'relatedIds',
  'draftStatus',
  'targetPlatforms',
  'scheduledPublishAt',
  'sourceMaterialIds',
  'tags',
  'customProperties',
  'preserveEmptyFrontmatterKeys',
]);
const mountMutationQueues = new Map();
const pendingMountMutations = new Set();
const mountMutationErrors = new Map();
const fileRevisions = new Map();

const fileRevisionKey = (mountId, relativePath) => `${mountId}\n${relativePath}`;

const rememberFileRevision = (mountId, relativePath, updatedAt) => {
  if (!mountId || !relativePath || !Number.isFinite(updatedAt)) return;
  fileRevisions.set(fileRevisionKey(mountId, relativePath), updatedAt);
};

const forgetFileRevisions = (mountId, relativePath = '') => {
  const exactKey = fileRevisionKey(mountId, relativePath);
  const childPrefix = `${exactKey}/`;
  for (const key of fileRevisions.keys()) {
    if (key === exactKey || key.startsWith(childPrefix) || (!relativePath && key.startsWith(`${mountId}\n`))) {
      fileRevisions.delete(key);
    }
  }
};

const rememberWorkspaceRevisions = (mountId, node) => {
  if (!node) return;
  if (node.type === 'file') {
    rememberFileRevision(mountId, node.relativePath, node.updatedAt);
  }
  node.children?.forEach?.((child) => rememberWorkspaceRevisions(mountId, child));
};

const invokeTauri = async (command, payload) => {
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke(command, payload);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(String(error || 'Tauri 本地项目操作失败'));
  }
};

export const isTauriRuntime = () => getDesktopRuntimeKind() === 'tauri';

export const isTauriReadOnlyMountId = (value) => (
  typeof value === 'string' && value.startsWith(TAURI_READ_ONLY_MOUNT_PREFIX)
);

export const isTauriReadWriteMountId = (value) => (
  typeof value === 'string' && value.startsWith(TAURI_READ_WRITE_MOUNT_PREFIX)
);

export const isTauriLocalProjectMountId = (value) => (
  isTauriReadOnlyMountId(value) || isTauriReadWriteMountId(value)
);

const assertTauriMountId = (mountId) => {
  if (!isTauriLocalProjectMountId(mountId)) {
    throw new Error('无效的 Tauri 项目标识');
  }
};

const assertTauriReadWriteMountId = (mountId) => {
  if (!isTauriReadWriteMountId(mountId)) {
    throw new Error('当前项目未授予写入权限');
  }
};

export const trackTauriLocalProjectMutation = (mountId, mutation) => {
  if (!isTauriReadWriteMountId(mountId)) return mutation;

  const trackedMutation = Promise.resolve(mutation);
  pendingMountMutations.add(trackedMutation);
  trackedMutation.then(
    () => pendingMountMutations.delete(trackedMutation),
    () => pendingMountMutations.delete(trackedMutation),
  );
  return trackedMutation;
};

export const flushTauriLocalProjectMutations = async () => {
  while (pendingMountMutations.size > 0) {
    const results = await Promise.allSettled([...pendingMountMutations]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  const previousFailure = mountMutationErrors.values().next().value;
  if (previousFailure) throw previousFailure;
};

const queueMountMutation = (mountId, task, errorKey = '') => {
  assertDesktopMutationsAllowed();
  const previous = mountMutationQueues.get(mountId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  mountMutationQueues.set(mountId, current);
  if (errorKey) {
    current.then(
      () => mountMutationErrors.delete(errorKey),
      (error) => mountMutationErrors.set(errorKey, error),
    );
  }
  const trackedMutation = trackTauriLocalProjectMutation(mountId, current);
  return trackedMutation.finally(() => {
    if (mountMutationQueues.get(mountId) === current) {
      mountMutationQueues.delete(mountId);
    }
  });
};

const createLocalProjectRelation = (mountId) => ({
  idToPath: (id) => {
    const text = String(id ?? '').trim();
    const index = text.lastIndexOf(':file:');
    if (index >= 0) return text.slice(index + ':file:'.length);
    return text.startsWith('file:') ? text.slice('file:'.length) : text;
  },
  pathToId: (relativePath) => {
    const text = String(relativePath ?? '').trim();
    if (!text) return '';
    const withExt = /\.[a-z0-9]+$/i.test(text) ? text : `${text}.md`;
    return `project:${mountId}:file:${withExt}`;
  },
});

const pickLegacyMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    LEGACY_METADATA_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(metadata, field))
      .map((field) => [field, metadata[field]]),
  );
};

const normalizeWorkspaceNode = (node, relation) => {
  if (!node) return node;
  const { legacyMetadata, ...nodeWithoutLegacyMetadata } = node;
  const frontmatter = node.type === 'file' && node.frontmatterSource
    ? parseFrontmatterDocument(`${node.frontmatterSource}\n`).frontmatter
    : {};
  const legacyFrontmatterMetadata = node.type === 'file'
    ? extractKnowledgeMetadataFromFrontmatter(frontmatter)
    : {};
  const metadata = node.type === 'file' ? frontmatterToMetadata(frontmatter, relation) : {};
  return {
    ...nodeWithoutLegacyMetadata,
    ...legacyFrontmatterMetadata,
    ...pickLegacyMetadata(legacyMetadata),
    ...(node.type === 'file'
      ? {
          frontmatter,
          ...(typeof frontmatter.id === 'string' && frontmatter.id.trim()
            ? { docId: frontmatter.id.trim() }
            : {}),
        }
      : {}),
    ...metadata,
    ...(Array.isArray(node.children)
      ? { children: node.children.map((child) => normalizeWorkspaceNode(child, relation)) }
      : {}),
  };
};

const normalizeProject = (project) => {
  if (!project) return project;
  const mountId = project.mountId ?? project.projectRootPath;
  const workspace = normalizeWorkspaceNode(
    project.workspace,
    createLocalProjectRelation(mountId),
  );
  rememberWorkspaceRevisions(mountId, workspace);
  return {
    ...project,
    workspace,
  };
};

export async function openLocalProject({
  access = 'read-only',
  allowLegacyProjectPath = false,
} = {}) {
  const result = await invokeTauri(
    access === 'read-write' ? 'select_read_write_projects' : 'select_read_only_projects',
    { allowLegacyProjectPath },
  );
  return {
    ...result,
    projects: (result?.projects ?? []).map(normalizeProject),
  };
}

export async function scanLocalProject(mountId) {
  assertTauriMountId(mountId);
  return normalizeProject(await invokeTauri('scan_local_project', { mountId }));
}

export async function readLocalProjectRevision(mountId) {
  assertTauriMountId(mountId);
  return invokeTauri('get_local_project_revision', { mountId });
}

export async function readLocalProjectFileContent({ mountId, relativePath }) {
  assertTauriMountId(mountId);

  const command = isTauriReadWriteMountId(mountId)
    ? 'read_local_project_file'
    : 'read_read_only_project_file';
  const result = await invokeTauri(command, {
    mountId,
    relativePath,
  });
  if (result?.ok === false) {
    throw new Error(result.error || '读取本地文件失败');
  }
  if (isTauriReadWriteMountId(mountId)) {
    rememberFileRevision(mountId, relativePath, result?.updatedAt);
  }
  return result;
}

export async function saveLocalProjectFile({ mountId, relativePath, content, expectedUpdatedAt }) {
  assertTauriReadWriteMountId(mountId);
  return queueMountMutation(mountId, async () => {
    assertNoLocalMediaCapabilityUrlsInMarkdown(content);
    let expected = fileRevisions.get(fileRevisionKey(mountId, relativePath));
    if (!Number.isFinite(expected)) expected = expectedUpdatedAt;
    if (!Number.isFinite(expected)) {
      const current = await readLocalProjectFileContent({ mountId, relativePath });
      expected = current.updatedAt;
    }
    const result = await invokeTauri('save_local_project_file', {
      mountId,
      relativePath,
      content,
      expectedUpdatedAt: expected,
    });
    rememberFileRevision(mountId, relativePath, result?.updatedAt);
    return result;
  }, `file:${mountId}:${relativePath}`);
}

export async function saveLocalProjectMetadata({ mountId, relativePath, metadata }) {
  assertTauriReadWriteMountId(mountId);
  return queueMountMutation(mountId, async () => {
    const current = await readLocalProjectFileContent({ mountId, relativePath });
    if (current?.encoding !== 'utf8') {
      throw new Error('只有 Markdown 和 TXT 文件可以保存元数据');
    }
    const relation = createLocalProjectRelation(mountId);
    const patch = metadataToFrontmatterPatch(metadata, relation);
    if (typeof patch.cover === 'string') {
      patch.cover = toDiskImageSrc(patch.cover, mountId, relativePath);
    }
    const rawContent = updateFrontmatterInMarkdown(current.data, patch, {
      preserveEmptyKeys: metadata?.preserveEmptyFrontmatterKeys ?? [],
    });
    assertNoLocalMediaCapabilityUrlsInMarkdown(rawContent);
    const result = await invokeTauri('save_local_project_metadata', {
      mountId,
      relativePath,
      rawContent,
      expectedUpdatedAt: current.updatedAt,
    });
    rememberFileRevision(mountId, relativePath, result?.updatedAt);
    return result;
  }, `metadata:${mountId}:${relativePath}`);
}

export async function saveBinaryAsset({ mountId, base64, mimeSubtype }) {
  assertTauriReadWriteMountId(mountId);
  return queueMountMutation(mountId, () => (
    invokeTauri('save_binary_asset', { mountId, base64, mimeSubtype })
  ));
}

export async function createLocalProjectFile({ mountId, relativePath, content }) {
  assertTauriReadWriteMountId(mountId);
  return queueMountMutation(mountId, async () => {
    const result = await invokeTauri('create_local_project_file', {
      mountId,
      relativePath,
      content,
    });
    rememberFileRevision(mountId, relativePath, result?.updatedAt);
    return result;
  });
}

export async function createLocalProjectFolder({ mountId, relativePath }) {
  assertTauriReadWriteMountId(mountId);
  return queueMountMutation(mountId, () => (
    invokeTauri('create_local_project_folder', { mountId, relativePath })
  ));
}

export async function renameLocalProjectEntry({ mountId, relativePath, newRelativePath }) {
  assertTauriReadWriteMountId(mountId);
  return queueMountMutation(mountId, async () => {
    const result = await invokeTauri('rename_local_project_entry', {
      mountId,
      relativePath,
      newRelativePath,
    });
    forgetFileRevisions(mountId, relativePath);
    rememberFileRevision(mountId, newRelativePath, result?.updatedAt);
    return result;
  });
}

export async function deleteLocalProjectEntry({ mountId, relativePath }) {
  assertTauriReadWriteMountId(mountId);
  return queueMountMutation(mountId, async () => {
    const result = await invokeTauri('delete_local_project_entry', { mountId, relativePath });
    forgetFileRevisions(mountId, relativePath);
    return result;
  });
}

export async function revealLocalProjectEntry({ mountId, relativePath = '' }) {
  assertTauriMountId(mountId);
  return invokeTauri('reveal_local_project_entry', { mountId, relativePath });
}

export async function revokeLocalProject(mountId) {
  if (!isTauriLocalProjectMountId(mountId)) return;
  await mountMutationQueues.get(mountId)?.catch(() => {});
  const command = isTauriReadWriteMountId(mountId)
    ? 'revoke_local_project'
    : 'revoke_read_only_project';
  const revocation = invokeTauri(command, { mountId });
  await trackTauriLocalProjectMutation(mountId, revocation);
  forgetFileRevisions(mountId);
  for (const key of mountMutationErrors.keys()) {
    if (key.includes(`:${mountId}:`)) mountMutationErrors.delete(key);
  }
}
