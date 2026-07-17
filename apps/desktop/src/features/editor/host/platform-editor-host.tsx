'use client';

import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { useMemo, type ReactNode } from 'react';
import { exportTimeline } from '../lib/export-video';
import { importMedia } from '../lib/import-media';
import {
  createBrowserProjectRepository,
  createTauriProjectRepository,
} from '../lib/project-repository';
import { toggleFullscreen } from '../lib/toggle-fullscreen';
import { EditorHostProvider, type EditorHost } from './editor-host';

function createPlatformHost(): EditorHost {
  const desktop = isTauri();
  return {
    importMedia,
    exportTimeline,
    toggleFullscreen,
    projects: desktop
      ? createTauriProjectRepository()
      : createBrowserProjectRepository(window.localStorage),
    resolveMediaSource: (locator) => {
      const source = String(locator);
      return desktop ? convertFileSrc(source) : source;
    },
  };
}

/** Selects a thin desktop/browser adapter once, at the application boundary. */
export function PlatformEditorHostProvider({ children }: { readonly children: ReactNode }) {
  const host = useMemo(createPlatformHost, []);
  return <EditorHostProvider host={host}>{children}</EditorHostProvider>;
}
