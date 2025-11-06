import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Infer base path for GitHub Pages project sites, e.g. /<repo>/
// If GITHUB_REPOSITORY exists (on Actions), extract repo name; locally stays '/'
const inferBaseFromRepo = () => {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return '/';
  const parts = repo.split('/');
  const repoName = parts[1] || '';
  return repoName ? `/${repoName}/` : '/';
};

export default defineConfig({
  base: inferBaseFromRepo(),
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
});

