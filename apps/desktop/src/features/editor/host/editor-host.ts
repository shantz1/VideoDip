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
  AppUpdatePort,
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
import type { SubtitleDocument } from '@videodip/subtitle-engine';
import type { TimelineDocument } from '@videodip/timeline';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { AspectRatio } from '../editor.store';
import type { RenderEngineStatus, RenderableAsset } from '../lib/render-video';

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
  /**
   * ADR-0011 composited export through the Node render sidecar — the same
   * composition the preview shows, burned in frame by frame. Selected
   * explicitly in the export UI; `exportTimeline` (fast FFmpeg cuts) always
   * remains available alongside it.
   */
  readonly renderTimelineComposited: (
    document: TimelineDocument,
    subtitles: SubtitleDocument,
    resolveAsset: (assetId: AssetId) => RenderableAsset | undefined,
    aspectRatio: AspectRatio,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
    presetId?: ExportPresetId,
  ) => Promise<Result<string | null>>;
  /** Availability probe for the composited engine; never rejects. */
  readonly getRenderEngineStatus: () => Promise<RenderEngineStatus>;
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

export interface UpdateHostCapability {
  readonly appUpdates: AppUpdatePort;
}

/** Host capabilities consumed by the reusable editor UI. */
export interface EditorHost
  extends
    MediaHostCapability,
    ExportHostCapability,
    WindowHostCapability,
    ProjectHostCapability,
    AiHostCapability,
    UpdateHostCapability {}

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
