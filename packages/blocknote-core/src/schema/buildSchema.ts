/**
 * Schema 组装机制（通用，无业务语义）。
 *
 * 职责：把「排除默认块 + 合并默认规格 + 调用 BlockNoteSchema.create」这套
 * 重复机制收口到包内。不认识任何具体块类型（scriptHeading 等由业务侧定义后传入）。
 *
 * 类型策略：泛型透传 —— 调用方传入的精确 specs 类型经 BlockNoteSchema.create
 * 的泛型推导原样流出，返回的 schema 类型与「手写 create({...})」完全一致，不退化。
 */

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from '@blocknote/core';
import type {
  BlockSpecs,
  InlineContentSpec,
  InlineContentConfig,
} from '@blocknote/core';

/** 默认排除的块：避免 "#" / ">" 触发 BlockNote 内置 input rule */
const DEFAULT_EXCLUDED_BLOCKS = ['heading', 'quote'] as const;

/**
 * 业务自定义内联规格（只含自定义项，不必带 text/link）。
 * text/link 由 buildSchema 内部合并默认规格补齐。
 */
export type CustomInlineContentSpecs = Record<
  string,
  InlineContentSpec<InlineContentConfig>
>;

export interface BuildSchemaInput<
  B extends BlockSpecs,
  I extends CustomInlineContentSpecs,
> {
  /**
   * 业务自定义块规格（已实例化），如 { scriptHeading: ..., npcDialogue: ... }。
   * 内部会与「排除后的默认块」合并；调用方无需自己 spread 默认块。
   */
  blockSpecs: B;
  /**
   * 业务自定义内联规格，如 { entity: ... }；会与默认内联规格（text/link）合并。
   * 仅需提供自定义项。
   */
  inlineContentSpecs?: I;
  /** 覆盖默认排除的块 key（默认排除 heading / quote） */
  excludeDefaultBlocks?: readonly string[];
}

/**
 * 组装 BlockNoteSchema。
 *
 * 返回类型精确反映「默认块 + 自定义块」与「默认内联 + 自定义内联」的合并结果，
 * 由 BlockNoteSchema.create 的泛型从传入对象推导得出。
 *
 * 注：排除默认块用浅拷贝 + delete 实现，避免破坏 specs 的精确字面量类型
 * （解构 rest 会丢失部分推导）。
 */
export function buildSchema<
  const B extends BlockSpecs,
  const I extends CustomInlineContentSpecs = Record<never, never>,
>(input: BuildSchemaInput<B, I>) {
  const {
    blockSpecs,
    inlineContentSpecs,
    excludeDefaultBlocks = DEFAULT_EXCLUDED_BLOCKS,
  } = input;

  const mergedBlockSpecs = { ...defaultBlockSpecs, ...blockSpecs };
  excludeDefaultBlocks.forEach((key) => {
    if (key in mergedBlockSpecs && !(key in blockSpecs)) {
      delete (mergedBlockSpecs as Record<string, unknown>)[key];
    }
  });

  const mergedInlineContentSpecs = {
    ...defaultInlineContentSpecs,
    ...(inlineContentSpecs ?? {}),
  };

  return BlockNoteSchema.create({
    blockSpecs: mergedBlockSpecs,
    inlineContentSpecs: mergedInlineContentSpecs,
  });
}
