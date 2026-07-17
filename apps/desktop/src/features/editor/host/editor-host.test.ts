import { ok } from '@videodip/shared';
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
