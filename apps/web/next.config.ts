import type { NextConfig } from 'next';

const config: NextConfig = {
  /**
   * Static export.
   *
   * The marketing site is a dumb static bundle served by the VPS — no Node
   * server, no Route Handlers, no request-time anything. That is a product
   * decision, not a convenience: the VPS stays thin (CLAUDE.md non-goals,
   * ADR-0002) and the site keeps working when the backend doesn't.
   */
  output: 'export',

  // Static export has no image optimization server.
  images: { unoptimized: true },

  // Transpile workspace packages: they ship untranspiled ESM with `use client`
  // directives intact (ADR-0003).
  transpilePackages: ['@videodip/ui', '@videodip/shared'],

  reactStrictMode: true,

  typescript: {
    // Next's own build-time TS check is disabled — it cannot run under
    // TypeScript 7 (see ADR-0005 and the identical note in
    // apps/desktop/next.config.ts). `tsc --noEmit` via the `typecheck` script
    // remains the real gate; this only turns off Next's redundant duplicate.
    ignoreBuildErrors: true,
  },
};

export default config;
