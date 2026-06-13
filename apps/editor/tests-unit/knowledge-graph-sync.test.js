import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

var mockUserDataPath = '';

vi.mock('electron', () => ({
  app: {
    getPath: () => mockUserDataPath,
  },
}));

import {
  closeDatabase,
  getGraphData,
  initDatabase,
  syncAllLinks,
  syncDocuments,
} from '../main/database.js';

const createWorkspace = (children = []) => ({
  id: 'root',
  type: 'folder',
  name: 'root',
  children,
});

const createFile = (id, name, overrides = {}) => ({
  id,
  type: 'file',
  name,
  content: '',
  nodeType: 'document',
  relatedIds: [],
  ...overrides,
});

describe('knowledge graph sync', () => {
  beforeEach(() => {
    mockUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'md-render-db-'));
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    mockUserDataPath = '';
  });

  it('includes explicit relatedIds edges in graph data', () => {
    const workspace = createWorkspace([
      createFile('doc-a', 'A.md', { relatedIds: ['doc-b'] }),
      createFile('doc-b', 'B.md'),
    ]);

    syncDocuments(workspace);

    expect(getGraphData()).toEqual({
      nodes: [
        { id: 'doc-a', name: 'A.md', type: 'file', node_type: 'document' },
        { id: 'doc-b', name: 'B.md', type: 'file', node_type: 'document' },
      ],
      edges: [{ source_id: 'doc-a', target_id: 'doc-b' }],
    });
  });

  it('removes stale nodes and edges after documents are deleted from workspace', () => {
    syncDocuments(createWorkspace([
      createFile('doc-a', 'A.md', { content: '[[B]]' }),
      createFile('doc-b', 'B.md'),
    ]));
    syncAllLinks(createWorkspace([
      createFile('doc-a', 'A.md', { content: '[[B]]' }),
      createFile('doc-b', 'B.md'),
    ]));

    syncDocuments(createWorkspace([createFile('doc-b', 'B.md')]));
    syncAllLinks(createWorkspace([createFile('doc-b', 'B.md')]));

    expect(getGraphData()).toEqual({
      nodes: [{ id: 'doc-b', name: 'B.md', type: 'file', node_type: 'document' }],
      edges: [],
    });
  });

  it('clears graph data when workspace becomes empty', () => {
    syncDocuments(createWorkspace([createFile('doc-a', 'A.md')]));
    syncDocuments(createWorkspace([]));

    expect(getGraphData()).toEqual({
      nodes: [],
      edges: [],
    });
  });
});
