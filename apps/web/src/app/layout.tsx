import { themeInitScript } from '@videodip/ui';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'VideoDip — Offline-first AI video editing for short-form creators',
  description:
    'An open-source, offline-first, AI-powered desktop video editing toolkit. ' +
    'Local Whisper subtitles, real timeline editing, native FFmpeg export. ' +
    'Your media never leaves your machine.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * Root layout for the marketing site.
 *
 * No `ThemeProvider` here, deliberately: the marketing page has no theme
 * toggle, so all it needs is the blocking init script, which resolves the
 * stored/OS preference and stamps the `dark`/`light` class before first paint.
 * The semantic token layer does the rest, so both themes are fully supported
 * with zero client-side React state — which keeps the page statically
 * exportable and working with JavaScript disabled (it falls back to dark,
 * the `:root` default).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: themeInitScript mutates the class on <html>
    // before React hydrates, so the server and client markup legitimately
    // differ here. Scoped to this element only.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run before first paint, or a dark-first page flashes white.
            Fixed string, no user input — see themeInitScript's docs. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
