import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  treeshake: true,

  // Declarations are emitted by `tsc --emitDeclarationOnly` in the `build`
  // script — see packages/shared/tsup.config.ts for why (TS7 incompatibility).
  dts: false,
});
