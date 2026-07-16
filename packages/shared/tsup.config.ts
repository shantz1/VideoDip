import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  treeshake: true,

  /**
   * Declarations are emitted by `tsc --emitDeclarationOnly` in the `build`
   * script, not here.
   *
   * tsup's `dts` option delegates to rollup-plugin-dts, which calls TypeScript
   * compiler internals (`useCaseSensitiveFileNames`) that TypeScript 7's native
   * compiler does not expose — it throws at load time. tsc is the source of
   * truth for our types anyway, so this is the more correct split regardless.
   * Revisit if tsup gains native TS7 support.
   */
  dts: false,
});
