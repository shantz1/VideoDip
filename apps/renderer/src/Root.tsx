import { Composition } from 'remotion';
import { VideoDipComposition, type VideoDipCompositionProps } from './composition.js';

/**
 * CLI/studio-only defaults.
 *
 * `remotion studio`/`remotion render` need concrete numbers to browse or
 * render a composition outside any real project. The live preview in
 * `apps/desktop` never uses this file — it renders `VideoDipComposition`
 * directly inside `@remotion/player`'s `<Player>` with the real project's
 * dimensions, fps and duration. These defaults exist only so `pnpm studio`
 * shows something rather than erroring on missing props.
 */
const DEFAULT_PROPS: VideoDipCompositionProps = { clips: [] };
const DEFAULT_FPS = 30;
const DEFAULT_DURATION_IN_FRAMES = DEFAULT_FPS * 60;
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;

export function RemotionRoot() {
  return (
    <Composition
      id="VideoDip"
      component={VideoDipComposition}
      durationInFrames={DEFAULT_DURATION_IN_FRAMES}
      fps={DEFAULT_FPS}
      width={DEFAULT_WIDTH}
      height={DEFAULT_HEIGHT}
      defaultProps={DEFAULT_PROPS}
    />
  );
}
