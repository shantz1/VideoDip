import { ms } from '@videodip/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editor.store';

const initial = useEditorStore.getState();
const state = () => useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState(initial, true);
});

describe('playhead', () => {
  it('seeks to a time', () => {
    state().seek(ms(1500));
    expect(state().playhead).toBe(1500);
  });

  it('clamps a seek past the end to the duration', () => {
    state().seek(ms(999_999));
    expect(state().playhead).toBe(state().duration);
  });

  it('clamps a negative seek to zero', () => {
    state().seek(ms(-500));
    expect(state().playhead).toBe(0);
  });

  it('nudges relative to the current position', () => {
    state().seek(ms(1000));
    state().nudge(ms(250));
    expect(state().playhead).toBe(1250);
  });

  it('clamps a backwards nudge at zero rather than going negative', () => {
    state().seek(ms(100));
    state().nudge(ms(-500));
    expect(state().playhead).toBe(0);
  });
});

describe('zoom', () => {
  it('steps multiplicatively', () => {
    const before = state().zoom;
    state().zoomIn();
    // Multiplicative because zoom is perceptually logarithmic; an additive
    // step feels wrong at both extremes.
    expect(state().zoom).toBeGreaterThan(before);
    expect(state().zoom / before).toBeCloseTo(1.3);
  });

  it('clamps at the maximum however far it is pushed', () => {
    for (let i = 0; i < 50; i++) state().zoomIn();
    expect(state().zoom).toBe(400);
  });

  it('clamps at the minimum however far it is pushed', () => {
    for (let i = 0; i < 50; i++) state().zoomOut();
    expect(state().zoom).toBe(5);
  });

  it('clamps a directly set zoom', () => {
    state().setZoom(10_000);
    expect(state().zoom).toBe(400);
  });
});

describe('playback', () => {
  it('toggles', () => {
    expect(state().isPlaying).toBe(false);
    state().togglePlayback();
    expect(state().isPlaying).toBe(true);
    state().togglePlayback();
    expect(state().isPlaying).toBe(false);
  });
});

describe('layout', () => {
  it('reveals a collapsed sidebar when a different panel is selected', () => {
    // Otherwise the click appears to do nothing.
    useEditorStore.setState({ sidebarCollapsed: true, activePanel: 'media' });
    state().setActivePanel('templates');

    expect(state().sidebarCollapsed).toBe(false);
    expect(state().activePanel).toBe('templates');
  });

  it('leaves a collapsed sidebar collapsed when the active panel is re-selected', () => {
    useEditorStore.setState({ sidebarCollapsed: true, activePanel: 'media' });
    state().setActivePanel('media');
    expect(state().sidebarCollapsed).toBe(true);
  });

  it('reveals the inspector when a tab is chosen', () => {
    useEditorStore.setState({ inspectorCollapsed: true });
    state().setInspectorTab('audio');

    expect(state().inspectorCollapsed).toBe(false);
    expect(state().inspectorTab).toBe('audio');
  });
});
