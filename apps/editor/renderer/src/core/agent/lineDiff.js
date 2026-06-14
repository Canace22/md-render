/**
 * 行级文本 diff（纯函数，无依赖）。
 *
 * 用途：AI 改写文档前，先把"旧正文 → 新正文"算成一组带标记的行，
 * 供面板渲染新旧对比卡片，用户确认后再落地。
 *
 * 算法：标准 LCS（最长公共子序列）按行对比，回溯得到
 *   keep（两边都有）/ add（仅新版有）/ del（仅旧版有）三类行。
 * 行数即字符串里 \n 的段数，足够内容创作场景使用。
 */

const splitLines = (text) => String(text ?? '').split('\n');

/**
 * 计算两段文本的行级差异。
 * @param {string} oldText 旧正文
 * @param {string} newText 新正文
 * @returns {Array<{ type: 'keep'|'add'|'del', text: string }>} 按显示顺序排列的行
 */
export const diffLines = (oldText, newText) => {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const m = a.length;
  const n = b.length;

  // dp[i][j] = a[i..] 与 b[j..] 的 LCS 长度
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // 回溯：相等则 keep，否则按 dp 走删/增
  const rows = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      rows.push({ type: 'keep', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      rows.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < m) { rows.push({ type: 'del', text: a[i] }); i += 1; }
  while (j < n) { rows.push({ type: 'add', text: b[j] }); j += 1; }

  return rows;
};

/**
 * 统计 diff 的增删行数，给卡片标题显示用。
 * @param {Array<{type:string}>} rows diffLines 的结果
 * @returns {{ added: number, removed: number }}
 */
export const countDiff = (rows) => {
  let added = 0;
  let removed = 0;
  for (const r of rows ?? []) {
    if (r.type === 'add') added += 1;
    else if (r.type === 'del') removed += 1;
  }
  return { added, removed };
};
