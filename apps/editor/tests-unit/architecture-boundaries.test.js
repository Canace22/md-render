import { describe, expect, it } from 'vitest';
import { EDITOR_STATE_KEYS } from '../shared/stateKeys.js';
import {
  RENDERER_STATE_KEYS,
  useEditorStore,
} from '../renderer/src/store/useEditorStore.js';
import { DEFAULT_FILE_ID } from '../renderer/src/store/workspaceUtils.js';

describe('architecture boundaries', () => {
  it('keeps renderer persistence keys sourced from shared editor keys', () => {
    expect(RENDERER_STATE_KEYS).toBe(EDITOR_STATE_KEYS);
    expect(RENDERER_STATE_KEYS).toContain('workspace_json');
    expect(RENDERER_STATE_KEYS).toContain('cloud_last_synced_hash');
  });

  it('keeps the composed store default workspace and legacy actions available', () => {
    const state = useEditorStore.getState();
    expect(state.workspace?.id).toBe('root');
    expect(state.selectedId).toBe(DEFAULT_FILE_ID);
    expect(typeof state.updateSelectedFileContent).toBe('function');
    expect(typeof state.createAgentSession).toBe('function');
  });

  it('keeps agent write-back action routed through selected file content updates', async () => {
    const before = useEditorStore.getState();
    before.selectNode(DEFAULT_FILE_ID);
    const applyPromise = before.stageAgentWrite({ oldText: '', newText: '# Agent Update' });

    useEditorStore.getState().applyAgentWrite();

    await expect(applyPromise).resolves.toBe(true);
    expect(useEditorStore.getState().markdown).toBe('# Agent Update');
  });
});
