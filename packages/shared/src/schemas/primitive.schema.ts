import { z } from 'zod';
import {
  fps,
  frames,
  ms,
  normalized,
  type AssetId,
  type ClipId,
  type JobId,
  type MediaLocator,
  type PluginId,
  type ProjectId,
  type SegmentId,
  type TemplateId,
  type TrackId,
} from '../branded/branded.js';

const identifier = z.string().trim().min(1).max(512);

/** Validates finite, non-negative milliseconds and applies the nominal brand. */
export const millisecondsSchema = z.number().finite().nonnegative().transform(ms);

/** Validates a finite, non-negative integer frame index. */
export const framesSchema = z.number().finite().int().nonnegative().transform(frames);

/** Validates a finite, positive frame rate. */
export const fpsSchema = z.number().finite().positive().transform(fps);

/** Validates a normalized value without silently clamping boundary input. */
export const normalizedSchema = z.number().finite().min(0).max(1).transform(normalized);

/** Validates a project identifier and applies its nominal brand. */
export const projectIdSchema = identifier.transform((value) => value as ProjectId);
/** Validates an asset identifier and applies its nominal brand. */
export const assetIdSchema = identifier.transform((value) => value as AssetId);
/** Validates a track identifier and applies its nominal brand. */
export const trackIdSchema = identifier.transform((value) => value as TrackId);
/** Validates a clip identifier and applies its nominal brand. */
export const clipIdSchema = identifier.transform((value) => value as ClipId);
/** Validates a subtitle segment identifier and applies its nominal brand. */
export const segmentIdSchema = identifier.transform((value) => value as SegmentId);
/** Validates a template identifier and applies its nominal brand. */
export const templateIdSchema = identifier.transform((value) => value as TemplateId);
/** Validates a plugin identifier and applies its nominal brand. */
export const pluginIdSchema = identifier.transform((value) => value as PluginId);
/** Validates a background-job identifier and applies its nominal brand. */
export const jobIdSchema = identifier.transform((value) => value as JobId);
/** Validates an opaque desktop/browser media locator. */
export const mediaLocatorSchema = identifier.transform((value) => value as MediaLocator);
