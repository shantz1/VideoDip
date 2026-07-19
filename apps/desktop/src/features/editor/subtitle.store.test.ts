import { ms, type SegmentId } from '@videodip/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor.store';
import { useSessionStore } from './session.store';
import { useSubtitleStore } from './subtitle.store';

const initial = useSubtitleStore.getState();
const initialEditor = useEditorStore.getState();
const initialSession = useSessionStore.getState();

beforeEach(() => {
  useSubtitleStore.setState(initial, true);
  useEditorStore.setState(initialEditor, true);
  useSessionStore.setState(initialSession, true);
});

describe('subtitle store', () => {
  it('keeps cue edits undoable and extends project duration', () => {
    const added = useSubtitleStore.getState().add({
      id: 'cue-a' as SegmentId,
      start: ms(1000),
      end: ms(4000),
      text: 'Caption',
    });
    expect(added.ok).toBe(true);
    expect(useEditorStore.getState().duration).toBe(4000);
    expect(useEditorStore.getState().isDirty).toBe(true);

    useSubtitleStore.getState().undo();
    expect(useSubtitleStore.getState().document.segments).toHaveLength(0);
    useSubtitleStore.getState().redo();
    expect(useSubtitleStore.getState().document.segments[0]?.text).toBe('Caption');
  });

  it('loads persisted documents without retaining history', () => {
    const result = useSubtitleStore.getState().add({
      start: ms(0),
      end: ms(1000),
      text: 'Saved',
    });
    if (!result.ok) throw new Error(result.error.message);
    useSubtitleStore.getState().load(result.value);
    expect(useSubtitleStore.getState().past).toEqual([]);
    expect(useSubtitleStore.getState().future).toEqual([]);
  });

  it('previews many style updates and commits them as one undo entry', () => {
    const added = useSubtitleStore.getState().add({
      id: 'styled' as SegmentId,
      start: ms(0),
      end: ms(1000),
      text: 'Styled',
    });
    if (!added.ok) throw new Error(added.error.message);
    const historyBefore = useSubtitleStore.getState().past.length;

    useSubtitleStore.getState().previewStyle('styled' as SegmentId, { foreground: '#112233' });
    useSubtitleStore.getState().previewStyle('styled' as SegmentId, { foreground: '#445566' });
    useSubtitleStore.getState().previewStyle('styled' as SegmentId, { foreground: '#778899' });

    expect(useSubtitleStore.getState().past).toHaveLength(historyBefore);
    expect(useSubtitleStore.getState().document.segments[0]?.style.foreground).toBeUndefined();

    const committed = useSubtitleStore.getState().commitStylePreview('styled' as SegmentId);
    expect(committed.ok).toBe(true);
    expect(useSubtitleStore.getState().past).toHaveLength(historyBefore + 1);
    expect(useSubtitleStore.getState().document.segments[0]?.style.foreground).toBe('#778899');

    useSubtitleStore.getState().undo();
    expect(useSubtitleStore.getState().document.segments[0]?.style.foreground).toBeUndefined();
  });

  it('does not publish duplicate style preview values', () => {
    let notifications = 0;
    const unsubscribe = useSubtitleStore.subscribe(() => {
      notifications += 1;
    });

    useSubtitleStore.getState().previewStyle('styled' as SegmentId, { foreground: '#112233' });
    useSubtitleStore.getState().previewStyle('styled' as SegmentId, { foreground: '#112233' });
    unsubscribe();

    expect(notifications).toBe(1);
  });

  it('selects subtitles exclusively through the shared editing session', () => {
    useSessionStore.getState().select({ type: 'clip', id: 'clip-a' as never });
    useSubtitleStore.getState().select('cue-a' as SegmentId);

    expect(useSessionStore.getState().session.selection.primary).toEqual({
      type: 'subtitle-segment',
      id: 'cue-a',
    });
  });

  it('applies a style to several selected cues as one undoable edit', () => {
    for (const [index, id] of ['cue-a', 'cue-b', 'cue-c'].entries()) {
      const added = useSubtitleStore.getState().add({
        id: id as SegmentId,
        start: ms(index * 2000),
        end: ms(index * 2000 + 1000),
        text: id,
      });
      if (!added.ok) throw new Error(added.error.message);
    }
    useSessionStore.getState().select({ type: 'subtitle-segment', id: 'cue-a' as SegmentId });
    useSessionStore.getState().toggleSelect({ type: 'subtitle-segment', id: 'cue-b' as SegmentId });
    const historyBefore = useSubtitleStore.getState().past.length;

    const result = useSubtitleStore
      .getState()
      .applyStyleToSegments(['cue-a' as SegmentId, 'cue-b' as SegmentId], {
        fontFamily: 'Anton',
        foreground: '#ffde59',
      });

    expect(result.ok).toBe(true);
    expect(useSubtitleStore.getState().past).toHaveLength(historyBefore + 1);
    expect(useSubtitleStore.getState().document.segments.map((segment) => segment.style)).toEqual([
      expect.objectContaining({ fontFamily: 'Anton', foreground: '#ffde59' }),
      expect.objectContaining({ fontFamily: 'Anton', foreground: '#ffde59' }),
      {},
    ]);

    useSubtitleStore.getState().undo();
    expect(useSubtitleStore.getState().document.segments[0]?.style.fontFamily).toBeUndefined();
    expect(useSessionStore.getState().session.selection.refs).toHaveLength(2);
  });

  it('removes several subtitle cues in one undoable edit', () => {
    for (const [index, id] of ['cue-a', 'cue-b', 'cue-c'].entries()) {
      const added = useSubtitleStore.getState().add({
        id: id as SegmentId,
        start: ms(index * 2000),
        end: ms(index * 2000 + 1000),
        text: id,
      });
      if (!added.ok) throw new Error(added.error.message);
    }
    const historyBefore = useSubtitleStore.getState().past.length;

    useSubtitleStore.getState().removeMany(['cue-a' as SegmentId, 'cue-b' as SegmentId]);

    expect(useSubtitleStore.getState().document.segments.map((segment) => segment.id)).toEqual([
      'cue-c',
    ]);
    expect(useSubtitleStore.getState().past).toHaveLength(historyBefore + 1);
  });
});
