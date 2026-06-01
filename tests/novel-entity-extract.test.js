import { describe, expect, it } from 'vitest';

import { extractEntities } from '../src/core/novel/extractEntities.js';

function getEntityNames(markdown) {
  return extractEntities(markdown, { fileId: 'test-file' }).map((entity) => entity.name);
}

describe('extractEntities', () => {
  it('extracts core novel entities from simple prose', () => {
    const names = getEntityNames(`# 第一章

次日，沈临川来到青石城。

沈临川必须调查黑水盟潜入城中的线人。

当夜，沈临川回到黑水营，却发现青石城的地图已经被人偷走。`);

    expect(names).toContain('沈临川');
    expect(names).toContain('青石城');
    expect(names).toContain('黑水盟');
    expect(names).toContain('黑水营');
    expect(names).toContain('地图');
  });

  it('filters common false positives in character and faction extraction', () => {
    const names = getEntityNames(`林七看着手里的地图，决定明日离开这里。
随后，他发现院子里的木门半掩，房中摆着一把长剑。
她问道这件事情是否已经开始。`);

    expect(names).toContain('林七');
    expect(names).toContain('地图');
    expect(names).toContain('长剑');
    expect(names).not.toContain('的木门');
    expect(names).not.toContain('木门');
    expect(names).not.toContain('决定明日');
    expect(names).not.toContain('把长剑');
  });

  it('keeps names after title prefixes while dropping greedy fragments', () => {
    const names = getEntityNames(`玄风门弟子季长安进入白鹿城，奉命寻找天机图。
季长安望向城楼，随后说道今晚必须救出沈姑娘。`);

    expect(names).toContain('玄风门');
    expect(names).toContain('季长安');
    expect(names).toContain('白鹿城');
    expect(names).toContain('天机图');
    expect(names).not.toContain('子季长安');
    expect(names).not.toContain('说道今晚');
  });
});
