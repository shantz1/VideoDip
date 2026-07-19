import { fireEvent, render, screen } from '@testing-library/react';
import { ms, type SegmentId } from '@videodip/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../editor.store';
import { useProjectStore } from '../project.store';
import { useSessionStore } from '../session.store';
import { useSubtitleStore } from '../subtitle.store';
import { SubtitlePreviewOverlay } from './subtitle-preview-overlay';

const initialEditor = useEditorStore.getState();
const initialProject = useProjectStore.getState();
const initialSession = useSessionStore.getState();
const initialSubtitles = useSubtitleStore.getState();

beforeEach(() => {
  useEditorStore.setState(initialEditor, true);
  useProjectStore.setState(initialProject, true);
  useSessionStore.setState(initialSession, true);
  useSubtitleStore.setState(initialSubtitles, true);
  Element.prototype.setPointerCapture = vi.fn();
  useSubtitleStore.getState().add({
    id: 'cue-a' as SegmentId,
    start: ms(0),
    end: ms(1000),
    text: 'Hello',
  });
  useEditorStore.getState().seek(ms(500));
});

function subtitleTrack() {
  const track = useProjectStore
    .getState()
    .document.tracks.find((candidate) => candidate.kind === 'subtitle');
  if (!track) throw new Error('Expected subtitle track.');
  return track;
}

describe('SubtitlePreviewOverlay track state', () => {
  it('does not expose an interaction overlay for a hidden subtitle track', () => {
    useProjectStore.getState().updateTrackState(subtitleTrack().id, { isVisible: false });
    render(<SubtitlePreviewOverlay />);
    expect(screen.queryByRole('button', { name: 'Move subtitle: Hello' })).toBeNull();
  });

  it('allows selection but prevents dragging while the subtitle track is locked', () => {
    useProjectStore.getState().updateTrackState(subtitleTrack().id, { isLocked: true });
    render(<SubtitlePreviewOverlay />);
    const overlay = screen.getByRole('button', { name: 'Move subtitle: Hello' });
    expect(overlay).toHaveAttribute('aria-disabled', 'true');

    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 150, clientY: 150 });
    expect(useSubtitleStore.getState().stylePreviews).toEqual({});
  });
});
