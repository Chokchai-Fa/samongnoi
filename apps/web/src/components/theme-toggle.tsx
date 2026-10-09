import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme, type Theme } from './theme-provider';

const next: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const label: Record<Theme, string> = {
  light: 'Theme: light (switch to dark)',
  dark: 'Theme: dark (switch to system)',
  system: 'Theme: system (switch to light)',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11"
      aria-label={label[theme]}
      title={label[theme]}
      onClick={() => setTheme(next[theme])}
    >
      <Icon />
    </Button>
  );
}
