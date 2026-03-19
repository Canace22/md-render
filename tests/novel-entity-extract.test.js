import test from 'node:test';
import assert from 'node:assert/strict';

import { extractEntities } from '../src/core/novel/extractEntities.js';

function getEntityNames(markdown) {
  return extractEntities(markdown, { fileId: 'test-file' }).map((entity) => entity.name);
}

test('extracts core novel entities from simple prose', () => {
  const names = getEntityNames(`# 第一章

次日，沈临川来到青石城。

沈临川必须调查黑水盟潜入城中的线人。

当夜，沈临川回到黑水营，却发现青石城的地图已经被人偷走。`);

  assert.ok(names.includes('沈临川'));
  assert.ok(names.includes('青石城'));
  assert.ok(names.includes('黑水盟'));
  assert.ok(names.includes('黑水营'));
  assert.ok(names.includes('地图'));
});

test('filters common false positives in character and faction extraction', () => {
  const names = getEntityNames(`林七看着手里的地图，决定明日离开这里。
随后，他发现院子里的木门半掩，房中摆着一把长剑。
她问道这件事情是否已经开始。`);

  assert.ok(names.includes('林七'));
  assert.ok(names.includes('地图'));
  assert.ok(names.includes('长剑'));
  assert.ok(!names.includes('的木门'));
  assert.ok(!names.includes('木门'));
  assert.ok(!names.includes('决定明日'));
  assert.ok(!names.includes('把长剑'));
});

test('keeps names after title prefixes while dropping greedy fragments', () => {
  const names = getEntityNames(`玄风门弟子季长安进入白鹿城，奉命寻找天机图。
季长安望向城楼，随后说道今晚必须救出沈姑娘。`);

  assert.ok(names.includes('玄风门'));
  assert.ok(names.includes('季长安'));
  assert.ok(names.includes('白鹿城'));
  assert.ok(names.includes('天机图'));
  assert.ok(!names.includes('子季长安'));
  assert.ok(!names.includes('说道今晚'));
});
