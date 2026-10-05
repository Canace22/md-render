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
    expect(RENDERER_STATE_KEYS).toContain('daily_workspace_json');
    expect(RENDERER_STATE_KEYS).toContain('sidebar_expanded_folders');
  });

  it('keeps the composed store default workspace and legacy actions available', () => {
    const state = useEditorStore.getState();
    expect(state.workspace?.id).toBe('root');
    expect(state.selectedId).toBe(DEFAULT_FILE_ID);
    expect(typeof state.updateSelectedFileContent).toBe('function');
    expect(typeof state.createAgentSession).toBe('function');
  });

  it('keeps agent write-back routed through proposals into file content updates', async () => {
    const before = useEditorStore.getState();
    before.selectNode(DEFAULT_FILE_ID);
    const { proposal } = before.submitEditProposal({ targetId: DEFAULT_FILE_ID, newText: '# Agent Update' });
    const waiting = useEditorStore.getState().waitForAgentProposal(proposal.id);

    useEditorStore.getState().resolveAgentProposal(proposal.id, 'apply');

    await expect(waiting).resolves.toMatchObject({ status: 'applied' });
    expect(useEditorStore.getState().markdown).toBe('# Agent Update');
  });
});
