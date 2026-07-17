'use client';

import type {
  ExportPresetId,
  MediaArtifact,
  MediaArtifactRequest,
  MediaArtifactRunOptions,
  MediaItem,
} from '@videodip/media-engine';
import type {
  AppError,
  AssetId,
  MediaLocator,
  ProjectArchivePort,
  ProjectRepository,
  ProjectSnapshot,
  ProjectSummary,
  Result,
  TranscriptionProvider,
  TranscriptionModelManager,
} from '@videodip/shared';
import type { TimelineDocument } from '@videodip/timeline';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { AspectRatio } from '../editor.store';

export interface MediaHostCapability {
  readonly importMedia: () => Promise<Result<readonly MediaItem[]>>;
  readonly resolveMediaSource: (locator: MediaLocator) => string;
  readonly getMediaArtifact: (
    request: MediaArtifactRequest,
    options?: MediaArtifactRunOptions,
  ) => Promise<Result<MediaArtifact, AppError>>;
}

export interface ExportHostCapability {
  readonly exportTimeline: (
    document: TimelineDocument,
    resolveLocator: (assetId: AssetId) => string | undefined,
    aspectRatio: AspectRatio,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
    presetId?: ExportPresetId,
  ) => Promise<Result<string | null>>;
}

export interface WindowHostCapability {
  readonly toggleFullscreen: () => Promise<Result<boolean>>;
}

export interface ProjectHostCapability {
  readonly projects: ProjectRepository<ProjectSnapshot, ProjectSummary>;
  readonly projectArchives: ProjectArchivePort<ProjectSnapshot>;
}

export interface AiHostCapability {
  readonly transcription: TranscriptionProvider;
  readonly transcriptionModels: TranscriptionModelManager;
}

/** Host capabilities consumed by the reusable editor UI. */
export interface EditorHost
  extends
    MediaHostCapability,
    ExportHostCapability,
    WindowHostCapability,
    ProjectHostCapability,
    AiHostCapability {}

const EditorHostContext = createContext<EditorHost | null>(null);

export function EditorHostProvider({
  host,
  children,
}: {
  readonly host: EditorHost;
  readonly children: ReactNode;
}) {
  return createElement(EditorHostContext.Provider, { value: host }, children);
}

export function useEditorHost(): EditorHost {
  const host = useContext(EditorHostContext);
  if (host === null) throw new Error('EditorHostProvider is missing above the editor UI.');
  return host;
}
