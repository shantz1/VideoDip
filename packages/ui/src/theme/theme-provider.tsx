'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * The user's theme choice. `system` defers to the OS.
 *
 * Distinct from the *resolved* theme: `system` is a strategy, not an
 * appearance. Collapsing the two is why theme switchers commonly forget the
 * user's real choice on reload.
 */
export type ThemeMode = 'dark' | 'light' | 'system';

/** The appearance actually applied. `system` is resolved away. */
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeContextValue {
  /** The user's choice, including `system`. */
  readonly mode: ThemeMode;
  /** What is actually rendered right now. */
  readonly resolved: ResolvedTheme;
  readonly setMode: (mode: ThemeMode) => void;
  /** Toggles dark/light, resolving `system` to its opposite first. */
  readonly toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'videodip:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system';
  } catch {
    // Storage can throw in a locked-down webview or private mode. A theme
    // preference is never worth crashing the editor over.
    return 'system';
  }
}

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Mode when nothing is stored yet. VideoDip is dark-first. */
  readonly defaultMode?: ThemeMode;
}

/**
 * Supplies theme state and keeps the `dark`/`light` class on `<html>` in sync.
 *
 * The class drives the semantic token layer in `tokens.css`; every color in the
 * app follows from it. Mount once, at the app root.
 *
 * Persisted to `localStorage`, and follows the OS live while in `system` mode.
 *
 * **Flash of wrong theme:** this resolves on mount, which is one paint too
 * late. Apps must also run {@link themeInitScript} before first paint.
 */
export function ThemeProvider({ children, defaultMode = 'dark' }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>('dark');

  // Read storage after mount, never during render: the server has no
  // localStorage, and reading it during render would desync hydration.
  useEffect(() => {
    setModeState(readStoredMode());
    setSystemResolved(systemTheme());
  }, []);

  // Track the OS while in `system` mode.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemResolved(mql.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = mode === 'system' ? systemResolved : mode;

  // Apply to <html>. Both classes are managed explicitly rather than toggling
  // one, because tokens.css defines `.light` as an override of `:root`.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal; the theme still applies for this session.
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Reads the current theme.
 *
 * @throws If used outside a {@link ThemeProvider}. This is programmer error —
 * an invariant violation, not a runtime condition — so it throws rather than
 * returning a `Result`, per `CLAUDE.md`.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme must be used within a <ThemeProvider>.');
  }
  return context;
}

/**
 * Blocking script that applies the stored theme before first paint.
 *
 * React cannot prevent the flash of wrong theme on its own: the server does not
 * know the user's choice, so the first paint would be `defaultMode` and correct
 * itself on hydration — a white flash on a dark-first app, which looks broken.
 *
 * Inject into `<head>` via `dangerouslySetInnerHTML`. It is a fixed string
 * containing no user input.
 *
 * @example
 * ```tsx
 * <head>
 *   <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
 * </head>
 * ```
 */
export const themeInitScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}')||'system';var d=m==='system'?window.matchMedia('${DARK_QUERY}').matches:m==='dark';var c=d?'dark':'light';document.documentElement.classList.add(c);document.documentElement.style.colorScheme=c;}catch(e){document.documentElement.classList.add('dark');}})();`;
