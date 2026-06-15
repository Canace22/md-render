import { describe, expect, it } from 'vitest';
import { extractRecallKeywords, rankRelatedDocs } from '../renderer/src/core/agent/contextRecall.js';

describe('extractRecallKeywords 关键词提取', () => {
  it('从标题和正文里提取关键词，去停用词', () => {
    const kws = extractRecallKeywords({
      title: '微信公众号排版技巧',
      content: '本文讲微信排版的常见技巧和样式',
    });
    expect(kws).toContain('微信');
    expect(kws).toContain('排版');
    // 停用词不应出现
    expect(kws).not.toContain('的');
    expect(kws).not.toContain('和');
  });

  it('标题词权重更高，排在前面', () => {
    const kws = extractRecallKeywords({
      title: '咖啡',
      content: '茶 茶 茶 茶 咖啡',
    });
    // 标题词权重 3，正文「咖啡」1 次 → 咖啡共 4 分，茶 4 分；标题命中保证咖啡入选
    expect(kws).toContain('咖啡');
  });

  it('空文档返回空数组', () => {
    expect(extractRecallKeywords({ title: '', content: '' })).toEqual([]);
    expect(extractRecallKeywords({})).toEqual([]);
  });

  it('受 max 限制关键词数量', () => {
    const kws = extractRecallKeywords(
      { title: '一二 三四 五六 七八', content: '甲乙 丙丁 戊己 庚辛' },
      { max: 3 },
    );
    expect(kws.length).toBeLessThanOrEqual(3);
  });

  it('过滤单字和数字噪声', () => {
    const kws = extractRecallKeywords({ title: '我 a 2024 排版', content: '' });
    expect(kws).toContain('排版');
    expect(kws).not.toContain('2024');
  });
});

describe('rankRelatedDocs 相关旧文排序', () => {
  const currentDoc = {
    id: 'cur',
    title: '微信排版技巧',
    content: '微信公众号排版样式',
  };

  it('按关键词重合度降序排序', () => {
    const candidates = [
      { id: '1', title: '无关美食', snippet: '红烧肉做法' },
      { id: '2', title: '微信排版进阶', snippet: '排版样式优化' },
      { id: '3', title: '微信入门', snippet: '微信基础' },
    ];
    const ranked = rankRelatedDocs(currentDoc, candidates, { limit: 5 });
    expect(ranked[0].id).toBe('2'); // 命中「微信」「排版」「样式」最多
    expect(ranked.map((r) => r.id)).not.toContain('1'); // 0 分被过滤
  });

  it('排除当前文档自身（按 id）', () => {
    const candidates = [
      { id: 'cur', title: '微信排版技巧', snippet: '微信排版' },
      { id: '2', title: '微信排版', snippet: '排版' },
    ];
    const ranked = rankRelatedDocs(currentDoc, candidates);
    expect(ranked.map((r) => r.id)).not.toContain('cur');
  });

  it('排除当前文档自身（无 id 时按标题）', () => {
    const noIdCurrent = { title: '微信排版技巧', content: '微信排版' };
    const candidates = [
      { title: '微信排版技巧', snippet: '微信排版' },
      { title: '其它微信文', snippet: '微信' },
    ];
    const ranked = rankRelatedDocs(noIdCurrent, candidates);
    expect(ranked.map((r) => r.title)).not.toContain('微信排版技巧');
  });

  it('limit 限制返回条数', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: '微信排版',
      snippet: '微信排版样式',
    }));
    const ranked = rankRelatedDocs(currentDoc, candidates, { limit: 3 });
    expect(ranked.length).toBe(3);
  });

  it('全部不相关时返回空数组', () => {
    const candidates = [
      { id: '1', title: '红烧肉', snippet: '做法' },
      { id: '2', title: '旅行', snippet: '风景' },
    ];
    expect(rankRelatedDocs(currentDoc, candidates)).toEqual([]);
  });

  it('当前文档无关键词时返回空数组', () => {
    expect(rankRelatedDocs({ title: '', content: '' }, [{ id: '1', title: 'x', snippet: 'y' }])).toEqual([]);
  });

  it('支持外部传入 keywords，跳过内部抽取', () => {
    const candidates = [
      { id: '1', title: '咖啡指南', snippet: '咖啡豆' },
      { id: '2', title: '茶道', snippet: '绿茶' },
    ];
    const ranked = rankRelatedDocs(currentDoc, candidates, { keywords: ['咖啡'] });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('1');
  });
});
