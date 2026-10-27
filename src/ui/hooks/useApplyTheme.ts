import { useEffect } from 'react';
import { useSettings } from '../../settings/settings';
import { useMediaQuery } from './useMediaQuery';

export type ResolvedTheme = 'dark' | 'light';

/** Which theme is actually shown ("system" follows the phone/computer setting). */
export function useResolvedTheme(): ResolvedTheme {
  const { theme } = useSettings();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

/** Writes the theme onto <html data-theme="…">, which switches all colour tokens in tokens.css. */
export function useApplyTheme(): void {
  const resolved = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  }, [resolved]);
}
