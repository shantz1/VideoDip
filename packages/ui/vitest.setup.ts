import '@testing-library/jest-dom/vitest';

/**
 * jsdom does not implement matchMedia, which ThemeProvider and
 * useReducedMotion both call. Without this stub they throw on mount and the
 * failure looks like a component bug rather than a missing browser API.
 *
 * Defaults to "does not match", i.e. light OS theme and no reduced-motion
 * preference. Tests needing the opposite should override this per-test.
 */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
