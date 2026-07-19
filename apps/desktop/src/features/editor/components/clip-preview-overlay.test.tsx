import { createMediaItem } from '@videodip/media-engine';
import { mediaLocatorSchema, ms } from '@videodip/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { ClipPreviewOverlay } from './clip-preview-overlay';

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();
const initialSession = useSessionStore.getState();

function setupSelectedVideo() {
  const item = createMediaItem({
    locator: mediaLocatorSchema.parse('C:\\media\\video.mp4'),
    name: 'video.mp4',
    kind: 'video',
    metadata: {
      duration: ms(2000),
      format: 'mp4',
      sizeBytes: 1000,
      bitrate: 1000,
      streams: [
        {
          index: 0,
          kind: 'video',
          codec: 'h264',
          duration: ms(2000),
          width: 1080,
          height: 1920,
        },
      ],
    },
  });
  useEditorStore.getState().addMediaItems([item]);
  const result = useProjectStore.getState().addClip({
    trackId: 'video' as never,
    assetId: item.id,
    start: ms(0),
    duration: ms(2000),
  });
  if (!result.ok) throw new Error(result.error.message);
  const clip = result.value.tracks.flatMap((track) => track.clips)[0];
  if (!clip) throw new Error('Expected a video clip.');
  useSessionStore.getState().select({ type: 'clip', id: clip.id });
  useEditorStore.getState().seek(ms(500));
  return clip;
}

function renderOverlay() {
  const view = render(<ClipPreviewOverlay />);
  const root = view.container.querySelector('[data-clip-preview-root]');
  if (!(root instanceof HTMLElement)) throw new Error('Expected preview overlay root.');
  root.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 480, bottom: 960, width: 480, height: 960 }) as DOMRect;
  return view;
}

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
  useSessionStore.setState(initialSession, true);
  Element.prototype.setPointerCapture = vi.fn();
});

describe('ClipPreviewOverlay', () => {
  it('previews pointer movement and commits exactly once on release', () => {
    const clip = setupSelectedVideo();
    const historyBefore = useProjectStore.getState().past.length;
    renderOverlay();
    const mover = screen.getByRole('button', { name: 'Move video: video.mp4' });

    fireEvent.pointerDown(mover, { pointerId: 1, clientX: 240, clientY: 480 });
    fireEvent.pointerMove(mover, { pointerId: 1, clientX: 288, clientY: 576 });

    expect(useSessionStore.getState().session.clipTransformPreview?.transform).toMatchObject({
      positionX: 0.1,
      positionY: 0.1,
    });
    expect(useProjectStore.getState().past).toHaveLength(historyBefore);

    fireEvent.pointerUp(mover, { pointerId: 1, clientX: 288, clientY: 576 });
    const committed = useProjectStore
      .getState()
      .document.tracks.flatMap((track) => track.clips)
      .find((candidate) => candidate.id === clip.id);
    expect(committed?.transform).toMatchObject({ positionX: 0.1, positionY: 0.1 });
    expect(useProjectStore.getState().past).toHaveLength(historyBefore + 1);
    expect(useSessionStore.getState().session.clipTransformPreview).toBeNull();
  });

  it('resizes uniformly from a corner handle and supports cancellation', () => {
    setupSelectedVideo();
    renderOverlay();
    const handle = screen.getByRole('button', { name: 'Resize video from bottom right' });

    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 340, clientY: 580 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 440, clientY: 680 });
    expect(useSessionStore.getState().session.clipTransformPreview?.transform.scaleX).toBeCloseTo(
      2,
    );

    fireEvent.pointerCancel(handle, { pointerId: 2 });
    expect(useSessionStore.getState().session.clipTransformPreview).toBeNull();
    expect(
      useProjectStore.getState().document.tracks.flatMap((track) => track.clips)[0]?.transform
        .scaleX,
    ).toBe(1);
  });
});
