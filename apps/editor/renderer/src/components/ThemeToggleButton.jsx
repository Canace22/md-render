import { Moon, Sun } from 'lucide-react';
import { getNextTheme } from '../utils/themeUtils';

export default function ThemeToggleButton({ theme, onThemeChange, className = '' }) {
  const isLight = theme === 'light';
  const nextTheme = getNextTheme(theme);
  const Icon = isLight ? Moon : Sun;
  const label = isLight ? '深色' : '浅色';

  return (
    <button
      type="button"
      className={`theme-toggle-btn${className ? ` ${className}` : ''}`}
      onClick={() => onThemeChange(nextTheme)}
      aria-label={`切换到${label}`}
      title={`切换到${label}`}
    >
      <Icon size={18} strokeWidth={1.6} />
    </button>
  );
}
