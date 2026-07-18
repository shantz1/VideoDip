import { act, render } from '@testing-library/react';
import { framesToMs, ms } from '@videodip/shared';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import { useSubtitleStore } from '../subtitle.store';
import { PROJECT_FPS } from '../lib/composition-adapter';
import { PreviewPlayer } from './preview-player';

const player = vi.hoisted(() => ({
  currentFrame: 0,
  renderCount: 0,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn((frame: number) => {
    player.currentFrame = frame;
  }),
  listeners: new Map<string, Set<(event: { detail: { frame: number } }) => void>>(),
}));

vi.mock('@remotion/player', () => ({
  Player: forwardRef(function MockPlayer(_props, ref) {
    player.renderCount += 1;
    useImperativeHandle(ref, () => ({
      play: player.play,
      pause: player.pause,
      seekTo: player.seekTo,
      getCurrentFrame: () => player.currentFrame,
      addEventListener: (
        name: string,
        listener: (event: { detail: { frame: number } }) => void,
      ) => {
        const listeners = player.listeners.get(name) ?? new Set();
        listeners.add(listener);
        player.listeners.set(name, listeners);
      },
      removeEventListener: (
        name: string,
        listener: (event: { detail: { frame: number } }) => void,
      ) => {
        player.listeners.get(name)?.delete(listener);
      },
    }));
    return <div data-testid="remotion-player" />;
  }),
}));

vi.mock('../host/editor-host', () => ({
  useEditorHost: () => ({ resolveMediaSource: (source: string) => source }),
}));

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();
const initialSubtitles = useSubtitleStore.getState();

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
  useSubtitleStore.setState(initialSubtitles, true);
  player.currentFrame = 0;
  player.renderCount = 0;
  player.play.mockClear();
  player.pause.mockClear();
  player.seekTo.mockClear();
  player.listeners.clear();
});

describe('PreviewPlayer transport feedback', () => {
  it('updates the playhead from a frame event without rerendering the Player', () => {
    useEditorStore.getState().setProjectDuration(ms(2000));
    render(<PreviewPlayer />);
    expect(player.renderCount).toBe(1);

    act(() => {
      player.currentFrame = 1;
      for (const listener of player.listeners.get('frameupdate') ?? []) {
        listener({ detail: { frame: 1 } });
      }
    });

    expect(useEditorStore.getState().playhead).toBe(framesToMs(1 as never, PROJECT_FPS));
    expect(player.renderCount).toBe(1);
    expect(player.seekTo).not.toHaveBeenCalled();
  });
});
