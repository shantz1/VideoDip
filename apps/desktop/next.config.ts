import type { NextConfig } from 'next';

const config: NextConfig = {
  /**
   * Static export.
   *
   * Tauri serves the built frontend as static files from the app bundle —
   * there is no Node server in a desktop install. This is not a preference we
   * could revisit later without pain: it means no Server Components doing I/O,
   * no Route Handlers, no `next/image` optimization at request time. The editor
   * talks to the OS through Tauri's IPC instead, which is the correct seam for
   * an offline-first app anyway (ADR-0002).
   */
  output: 'export',

  // Static export has no image optimization server.
  images: { unoptimized: true },

  // Transpile workspace packages: they ship untranspiled ESM with `use client`
  // directives intact (ADR-0003). `@videodip/renderer` is here specifically
  // so Next's webpack (not just tsup/esbuild) processes its CSS export —
  // the bundled caption font pack (`caption-fonts.css`).
  transpilePackages: ['@videodip/ui', '@videodip/shared', '@videodip/renderer'],

  reactStrictMode: true,

  typescript: {
    // Next's own build-time TS check is disabled — it cannot run under
    // TypeScript 7. Next resolves `typescript/lib/typescript.js` as proof the
    // package is usable; TS 7's restructured package (ADR-0003) doesn't ship
    // that file, so Next's dependency check finds no resolution for it and
    // crashes with `require(undefined)`. This is an upstream incompatibility,
    // not something fixable from repo config (see ADR-0005).
    //
    // This does not weaken the guarantee: `turbo run typecheck` runs the real
    // `tsc --noEmit` across the whole graph and gates `pnpm verify`. This flag
    // only turns off Next's redundant internal duplicate of that same check.
    ignoreBuildErrors: true,
  },

  // Note: Next 16 dropped the `eslint` config key along with `next lint`.
  // Linting is its own turbo task; see eslint.config.mjs.
};

export default config;
