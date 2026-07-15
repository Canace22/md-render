import { describe, expect, it } from 'vitest';
import {
  buildPlatformVariantInstruction,
  listPlatformVariants,
  isSupportedPlatformVariant,
  PLATFORM_VARIANT_KEYS,
} from '../renderer/src/utils/platformVariant.js';

describe('buildPlatformVariantInstruction 平台版本指令', () => {
  it('微信：指令体现公众号特征（小标题 / 引导关注）', () => {
    const text = buildPlatformVariantInstruction('wechat');
    expect(text).toContain('微信公众号');
    expect(text).toContain('小标题');
    expect(text).toContain('关注');
  });

  it('小红书：指令体现口语化 / emoji / 话题标签', () => {
    const text = buildPlatformVariantInstruction('xiaohongshu');
    expect(text).toContain('小红书');
    expect(text).toContain('emoji');
    expect(text).toContain('话题标签');
  });

  it('知乎：指令体现逻辑论证 / 长文', () => {
    const text = buildPlatformVariantInstruction('zhihu');
    expect(text).toContain('知乎');
    expect(text).toContain('论证');
  });

  it('所有平台指令都带读取与派生产出物引导', () => {
    [PLATFORM_VARIANT_KEYS.WECHAT, PLATFORM_VARIANT_KEYS.XIAOHONGSHU, PLATFORM_VARIANT_KEYS.ZHIHU]
      .forEach((value) => {
        const text = buildPlatformVariantInstruction(value);
        expect(text).toContain('read_active_doc');
        expect(text).toContain('create_agent_artifact');
        expect(text).toContain('platform_draft');
      });
  });

  it('指令不内嵌正文，交给 agent 读取', () => {
    const text = buildPlatformVariantInstruction('zhihu');
    expect(text).toContain('请先读取当前文档');
  });

  it('平台 value 大小写 / 空格不敏感', () => {
    expect(buildPlatformVariantInstruction('  WeChat ')).toContain('微信公众号');
  });

  it('未知平台默认兜底到微信版本（不抛错）', () => {
    const text = buildPlatformVariantInstruction('douyin');
    expect(text).toContain('微信公众号');
    expect(text).toContain('create_agent_artifact');
  });

  it('未知平台 + strict 抛清晰错误', () => {
    expect(() => buildPlatformVariantInstruction('douyin', { strict: true }))
      .toThrow('不支持的平台：douyin');
  });
});

describe('listPlatformVariants 平台列表', () => {
  it('返回 wechat / xiaohongshu / zhihu 三个平台', () => {
    const list = listPlatformVariants();
    const values = list.map((item) => item.value);
    expect(values).toEqual(
      expect.arrayContaining(['wechat', 'xiaohongshu', 'zhihu']),
    );
    list.forEach((item) => {
      expect(item.label).toBeTruthy();
    });
  });

  it('知乎在列表中带中文 label', () => {
    const zhihu = listPlatformVariants().find((item) => item.value === 'zhihu');
    expect(zhihu.label).toBe('知乎');
  });
});

describe('isSupportedPlatformVariant 判断', () => {
  it('已知平台返回 true，未知返回 false', () => {
    expect(isSupportedPlatformVariant('wechat')).toBe(true);
    expect(isSupportedPlatformVariant('XIAOHONGSHU')).toBe(true);
    expect(isSupportedPlatformVariant('weibo')).toBe(false);
  });
});
