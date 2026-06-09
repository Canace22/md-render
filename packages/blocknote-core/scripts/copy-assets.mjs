/**
 * tsc 不复制非 TS 文件（如 .css），构建后需手动将 src 中的静态资源同步到 dist。
 */
import { readdirSync, statSync, copyFileSync, mkdirSync } from 'fs';
import { join, relative } from 'path';

const EXTENSIONS = ['.css'];
const SRC = 'src';
const DIST = 'dist';

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (EXTENSIONS.some((ext) => full.endsWith(ext))) {
      const dest = join(DIST, relative(SRC, full));
      mkdirSync(join(dest, '..'), { recursive: true });
      copyFileSync(full, dest);
    }
  }
}

walk(SRC);
