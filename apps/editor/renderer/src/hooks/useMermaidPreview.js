import { useEffect } from 'react';

let mermaidPromise = null;

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
};

export function useMermaidPreview(enabled, html) {
  useEffect(() => {
    if (!enabled || !html.includes('class="mermaid"')) return undefined;

    let disposed = false;
    const frameId = window.requestAnimationFrame(async () => {
      const container = document.getElementById('markdown-output');
      const nodes = [...(container?.querySelectorAll('.mermaid:not([data-processed])') ?? [])];
      if (disposed || nodes.length === 0) return;

      try {
        const mermaid = await loadMermaid();
        if (!disposed) await mermaid.run({ nodes });
      } catch (error) {
        console.error('Mermaid 图表渲染失败:', error);
      }
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [enabled, html]);
}
