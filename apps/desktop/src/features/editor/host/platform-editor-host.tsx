'use client';

import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { MediaArtifactService } from '@videodip/media-engine';
import { useMemo, type ReactNode } from 'react';
import { exportTimeline } from '../lib/export-video';
import { importMedia } from '../lib/import-media';
import {
  createBrowserMediaArtifactCache,
  createBrowserMediaArtifactWorker,
  createTauriMediaArtifactCache,
  createTauriMediaArtifactWorker,
} from '../lib/media-artifacts';
import {
  createBrowserProjectArchivePort,
  createTauriProjectArchivePort,
} from '../lib/project-archive';
import {
  createBrowserProjectRepository,
  createTauriProjectRepository,
} from '../lib/project-repository';
import { toggleFullscreen } from '../lib/toggle-fullscreen';
import {
  createBrowserWhisperIntegration,
  createWhisperIntegration,
} from '../lib/whisper-transcription';
import { EditorHostProvider, type EditorHost } from './editor-host';

function createPlatformHost(): EditorHost {
  const desktop = isTauri();
  const mediaArtifacts = new MediaArtifactService(
    desktop ? createTauriMediaArtifactWorker() : createBrowserMediaArtifactWorker(),
    desktop ? createTauriMediaArtifactCache() : createBrowserMediaArtifactCache(),
  );
  const whisper = desktop ? createWhisperIntegration() : createBrowserWhisperIntegration();
  return {
    importMedia,
    exportTimeline,
    toggleFullscreen,
    projects: desktop
      ? createTauriProjectRepository()
      : createBrowserProjectRepository(() => window.localStorage),
    projectArchives: desktop ? createTauriProjectArchivePort() : createBrowserProjectArchivePort(),
    getMediaArtifact: (request, options) => mediaArtifacts.getOrCreate(request, options),
    resolveMediaSource: (locator) => {
      const source = String(locator);
      return desktop ? convertFileSrc(source) : source;
    },
    transcription: whisper.provider,
    transcriptionModels: whisper.models,
  };
}

/** Selects a thin desktop/browser adapter once, at the application boundary. */
export function PlatformEditorHostProvider({ children }: { readonly children: ReactNode }) {
  const host = useMemo(createPlatformHost, []);
  return <EditorHostProvider host={host}>{children}</EditorHostProvider>;
}
