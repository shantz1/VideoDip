import { defineConfig } from 'tsup';

export default defineConfig({
  // remotion-entry is built to plain JS so the headless CLI's webpack bundle
  // starts from compiled output — the repo's TypeScript 7 native preview
  // lacks the `typescript.sys` JS API Remotion's esbuild-loader needs to
  // consume .tsx sources directly.
  entry: ['src/index.ts', 'src/render-cli.ts', 'src/remotion-entry.tsx'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  treeshake: true,

  // The composition is a plain presentational component — no hooks, no
  // 'use client' directive to preserve — so unlike packages/ui it needs no
  // special tsc-alone build (see ADR-0003's reasoning for why that package
  // is the exception, not the rule).
  dts: false,
});
