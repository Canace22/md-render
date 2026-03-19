/**
 * 主题切换工具
 */

import { Moon, Sun } from 'lucide-react';

export const THEME_OPTIONS = [
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'dark', label: '深色', icon: Moon },
];

/**
 * 将主题应用到 body 的 class
 * @param {'light' | 'dark'} nextTheme
 */
export const applyThemeToBody = (nextTheme) => {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark');
  if (nextTheme === 'light') {
    body.classList.add('theme-light');
  } else if (nextTheme === 'dark') {
    body.classList.add('theme-dark');
  }
};
