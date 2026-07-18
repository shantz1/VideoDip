/**
 * Nominal typing for identifiers and units.
 *
 * Structural typing means `ProjectId`, `AssetId` and `string` are mutually
 * assignable, so passing an asset id where a project id belongs compiles
 * cleanly. Likewise `Milliseconds` and `Frames` are both `number`. In a video
 * editor those two confusions are the entire bug class — a frame/ms mixup
 * produces subtitles that drift, and a drift of a few frames is exactly the
 * kind of thing that ships. Branding makes the compiler catch it.
 */

declare const brand: unique symbol;

/** Attaches a compile-time-only nominal tag to a primitive. Erased at runtime. */
export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

/** Milliseconds. The canonical time unit across VideoDip. */
export type Milliseconds = Brand<number, 'Milliseconds'>;

/**
 * A frame index. Frame counts are meaningless without a frame rate — never
 * convert between {@link Frames} and {@link Milliseconds} without one.
 */
export type Frames = Brand<number, 'Frames'>;

/** Frames per second. */
export type Fps = Brand<number, 'Fps'>;

/** Normalized level in `[0, 1]`. Used for volume, opacity, and progress. */
export type Normalized = Brand<number, 'Normalized'>;

export type ProjectId = Brand<string, 'ProjectId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type TrackId = Brand<string, 'TrackId'>;
export type ClipId = Brand<string, 'ClipId'>;
export type TransitionId = Brand<string, 'TransitionId'>;
export type SegmentId = Brand<string, 'SegmentId'>;
export type TemplateId = Brand<string, 'TemplateId'>;
export type PluginId = Brand<string, 'PluginId'>;
export type JobId = Brand<string, 'JobId'>;
/** Opaque host-owned media reference: a desktop path or browser storage key. */
export type MediaLocator = Brand<string, 'MediaLocator'>;

/** Asserts a number is milliseconds. Does not validate; use at trust boundaries. */
export const ms = (value: number): Milliseconds => value as Milliseconds;

/** Asserts a number is a frame index. */
export const frames = (value: number): Frames => value as Frames;

/** Asserts a number is a frame rate. */
export const fps = (value: number): Fps => value as Fps;

/**
 * Clamps a number into `[0, 1]` and brands it.
 *
 * Unlike the other constructors this one actually enforces its invariant,
 * because out-of-range opacity and volume are silent visual/audio bugs rather
 * than crashes.
 */
export const normalized = (value: number): Normalized =>
  Math.min(1, Math.max(0, value)) as Normalized;

/**
 * Converts a time to a frame index at a given rate, rounding to the nearest
 * frame.
 *
 * Requiring {@link Fps} at the call site is the point: it makes the conversion
 * impossible to perform accidentally.
 */
export const msToFrames = (time: Milliseconds, rate: Fps): Frames =>
  Math.round((time / 1000) * rate) as Frames;

/** Converts a frame index to a time at a given rate. */
export const framesToMs = (frame: Frames, rate: Fps): Milliseconds =>
  ((frame / rate) * 1000) as Milliseconds;
