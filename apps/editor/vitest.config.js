import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(__dirname, 'renderer');

// blocknote-core 仅消费 dist 构建产物（与 vite.config 保持一致）
const blocknoteCoreDist = path.join(
  __dirname,
  '..',
  '..',
  'packages',
  'blocknote-core',
  'dist',
  'index.js',
);

// 单元测试统一放在 apps/editor/tests-unit/（Playwright E2E 仍用 tests/*.spec.js）
export default defineConfig({
  root: rendererRoot,
  plugins: [react()],
  resolve: {
    alias: {
      '@narrative/blocknote-core': blocknoteCoreDist,
    },
  },
  test: {
    environment: 'node',
    include: ['../tests-unit/**/*.test.{js,jsx}'],
    exclude: ['node_modules', 'dist'],
  },
});
