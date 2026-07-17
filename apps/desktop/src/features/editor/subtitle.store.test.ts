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
});
