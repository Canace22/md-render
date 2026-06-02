/**
 * 统计 Markdown 正文字数（纯函数）。
 * 规则：先去掉常见 Markdown 语法符号，再按
 *  - 每个中日韩字符算 1 字
 *  - 连续的英文/数字算 1 词
 * 中文写作看「字」，英文看「词」，两者相加即可给出直观的字数。
 */
export function countWords(markdown) {
  const text = stripMarkdown(markdown ?? '');
  if (!text) return 0;

  const cjk = text.match(/[一-龥぀-ヿ가-힯]/g);
  const words = text.match(/[A-Za-z0-9]+/g);
  return (cjk?.length ?? 0) + (words?.length ?? 0);
}

/** 去掉不计入字数的 Markdown 语法符号与代码块围栏 */
function stripMarkdown(input) {
  return input
    .replace(/```[\s\S]*?```/g, ' ') // 代码块整体剔除
    .replace(/`[^`]*`/g, ' ') // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/^[#>\-*+\s]+/gm, ' ') // 行首标题/引用/列表符号
    .replace(/[*_~]/g, ' '); // 强调符号
}
