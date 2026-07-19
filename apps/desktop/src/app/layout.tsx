import { ThemeProvider, themeInitScript } from '@videodip/ui';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
// Same @font-face declarations the Remotion composition imports for preview
// and export — imported here too so the subtitle font picker's own DOM
// (outside the Remotion tree) previews cues in the actual chosen font.
import '@videodip/renderer/caption-fonts.css';

export const metadata: Metadata = {
  title: 'VideoDip',
  description: 'Professional AI video editing. Built for modern creators.',
};

export const viewport: Viewport = {
  // The editor is a fixed-viewport application, not a scrolling document.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: themeInitScript mutates the class on <html>
    // before React hydrates, so the server and client markup legitimately
    // differ here. Scoped to this element only.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Must run before first paint, or a dark-first app flashes white.
            Fixed string, no user input — see themeInitScript's docs. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider defaultMode="dark">{children}</ThemeProvider>
      </body>
    </html>
  );
}
