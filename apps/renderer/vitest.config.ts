import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    /**
     * No test files yet, deliberately: the composition is a presentational
     * map over pre-resolved clips, and Remotion components throw when
     * rendered outside a player/renderer context, so a unit test here would
     * have to mock the exact thing it claims to test. The clip-mapping
     * logic that feeds this composition IS tested — in
     * `apps/desktop/src/features/editor/lib/composition-adapter.test.ts`.
     * Remove this flag the moment this package grows real logic.
     */
    passWithNoTests: true,
  },
});
