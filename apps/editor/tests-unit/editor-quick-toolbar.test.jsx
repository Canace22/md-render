import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EditorQuickToolbar, { buildMenuItems } from '../renderer/src/components/EditorQuickToolbar.jsx';

const render = (props = {}) => renderToStaticMarkup(<EditorQuickToolbar {...props} />);

describe('编辑区文档动作栏（收进「分享」下拉）', () => {
  it('顶栏只渲染一个「分享」触发按钮', () => {
    const html = render();
    expect(html.match(/<button[^>]*editor-share-trigger/g)).toHaveLength(1);
    expect(html).toContain('分享');
  });

  it('顶栏不再平铺公众号专属按钮', () => {
    const html = render({ copyStyleName: '默认' });
    expect(html).not.toContain('复制公众号');
    expect(html).not.toContain('准备发布');
  });

  it('未选中文档时整条标记为 disabled', () => {
    expect(render({ disabled: true })).toContain('data-disabled="true"');
    expect(render({ disabled: false })).not.toContain('data-disabled');
  });

  it('普通文档：发布、复制、导出、公众号组都在', () => {
    const keys = buildMenuItems().map((item) => item.key ?? item.type);
    expect(keys).toEqual(['prepare-publish', 'copy-rich', 'copy-markdown', 'export', 'divider', 'group']);
  });

  it('大纲页：复制富文本、复制为 Markdown、导出，没有发布和公众号', () => {
    const keys = buildMenuItems({ isOutline: true }).map((item) => item.key ?? item.type);
    expect(keys).toEqual(['copy-rich', 'copy-markdown', 'export']);
  });
});
