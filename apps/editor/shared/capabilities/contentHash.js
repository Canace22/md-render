/**
 * 正文内容的短 hash，用于乐观锁（baseHash）：agent 读到的版本和提交时的版本对不上，就拒绝写入。
 * 不需要密码学强度，只要同一段文本稳定、改一个字就变。纯函数，renderer / main 都能用。
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_RADIX = 16;
const LENGTH_RADIX = 36;
const HASH_WIDTH = 8;

const fnv1a32 = (text) => {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX_RADIX).padStart(HASH_WIDTH, '0');
};

/** 统一换行后计算；形如 `1a2b3c4d-k9`（hash + 长度） */
export const hashContent = (content = '') => {
  const text = String(content ?? '').replace(/\r\n/g, '\n');
  return `${fnv1a32(text)}-${text.length.toString(LENGTH_RADIX)}`;
};

export const isSameContentHash = (content, baseHash) =>
  !baseHash || hashContent(content) === String(baseHash).trim();
