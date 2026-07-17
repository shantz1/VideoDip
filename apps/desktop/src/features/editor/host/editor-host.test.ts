import { ms, ok } from '@videodip/shared';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EditorHostProvider, useEditorHost, type EditorHost } from './editor-host';

function createHost(): EditorHost {
  return {
    importMedia: vi.fn(async () => ok([])),
    exportTimeline: vi.fn(async () => ok(null)),
    toggleFullscreen: vi.fn(async () => ok(true)),
    projects: {
      list: vi.fn(async () => ok([])),
      load: vi.fn(),
      save: vi.fn(async () => ok(undefined)),
      delete: vi.fn(async () => ok(undefined)),
    },
    projectArchives: {
      exportArchive: vi.fn(async () => ok(null)),
      importArchive: vi.fn(async () => ok(null)),
    },
    transcription: {
      id: 'fake',
      name: 'Fake transcription',
      capabilities: vi.fn(async () =>
        ok({
          wordTimestamps: true,
          diarization: false,
          offline: true,
          gpuAccelerated: false,
          languages: 'auto' as const,
        }),
      ),
      availability: vi.fn(async () => ok({ state: 'ready' as const })),
      transcribe: vi.fn(async () => ok({ language: 'en', durationMs: ms(0), segments: [] })),
    },
    transcriptionModels: {
      status: vi.fn(async () => ok({ runtimeAvailable: true, models: [] })),
      download: vi.fn(async () => ok(undefined)),
      delete: vi.fn(async () => ok(undefined)),
      select: vi.fn(),
      selected: vi.fn(() => 'small-q5_1'),
    },
    getMediaArtifact: vi.fn(),
    resolveMediaSource: (locator) => `resolved:${locator}`,
  };
}

describe('EditorHostProvider', () => {
  it('injects one host-neutral capability boundary into editor components', () => {
    const host = createHost();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(EditorHostProvider, { host, children });

    const { result } = renderHook(useEditorHost, { wrapper });
    expect(result.current).toBe(host);
  });

  it('fails immediately when reusable editor UI is mounted without a host', () => {
    expect(() => renderHook(useEditorHost)).toThrow(/EditorHostProvider is missing/);
  });
});
