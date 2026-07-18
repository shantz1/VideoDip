import { ms, type SegmentId } from '@videodip/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor.store';
import { useSubtitleStore } from './subtitle.store';

const initial = useSubtitleStore.getState();
const initialEditor = useEditorStore.getState();

beforeEach(() => {
  useSubtitleStore.setState(initial, true);
  useEditorStore.setState(initialEditor, true);
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

  it('selects subtitles exclusively through the editor selection state', () => {
    useEditorStore.getState().selectClip('clip-a' as never);
    useSubtitleStore.getState().select('cue-a' as SegmentId);

    expect(useEditorStore.getState()).toMatchObject({
      selectedClipId: null,
      selectedTransitionId: null,
      selectedSubtitleId: 'cue-a',
    });
  });
});
