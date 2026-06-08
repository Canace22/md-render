import { describe, expect, it } from 'vitest';
import { extractCanvasBookmarkCandidate } from '../renderer/src/utils/canvasBookmark.js';

describe('extractCanvasBookmarkCandidate', () => {
  it('extracts primary url and title from canvas text selection', () => {
    const candidate = extractCanvasBookmarkCandidate({
      elements: [
        {
          id: 'text-1',
          type: 'text',
          text: '无限画布 research\nhttps://excalidraw.com/',
          originalText: '无限画布 research\nhttps://excalidraw.com/',
          isDeleted: false,
        },
      ],
    });

    expect(candidate).toMatchObject({
      title: '无限画布 research',
      url: 'https://excalidraw.com/',
    });
    expect(candidate.summary).toContain('无限画布 research');
  });

  it('falls back to element link when text has no inline url', () => {
    const candidate = extractCanvasBookmarkCandidate({
      elements: [
        {
          id: 'rect-1',
          type: 'rectangle',
          link: 'https://react.dev/',
          isDeleted: false,
        },
      ],
    });

    expect(candidate).toMatchObject({
      title: 'https://react.dev/',
      url: 'https://react.dev/',
    });
  });

  it('returns null when selection has no valid url', () => {
    const candidate = extractCanvasBookmarkCandidate({
      elements: [
        {
          id: 'text-1',
          type: 'text',
          text: '只有备注，没有链接',
          originalText: '只有备注，没有链接',
          isDeleted: false,
        },
      ],
    });

    expect(candidate).toBeNull();
  });
});
