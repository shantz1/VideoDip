import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
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
