import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(__dirname, 'renderer');

// 仅跑单元测试：Playwright E2E 使用 tests/*.spec.js，此处用 *.test.js 避免冲突
export default defineConfig({
  root: rendererRoot,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,jsx}', '../tests/**/*.test.{js,jsx}'],
    exclude: ['node_modules', 'dist', '../tests/**/*.spec.{js,jsx}'],
  },
});
