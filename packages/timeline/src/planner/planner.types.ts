import type { ClipId, Milliseconds, TrackId, TransitionId } from '@videodip/shared';
import type {
  AddClipInput,
  AddTransitionInput,
  CreateTrackInput,
  TrimEdge,
  UpdateClipPropertiesInput,
  UpdateTransitionInput,
  UpdateTrackStateInput,
} from '../document/document.service.js';
import type { ClipAudioSettings, ClipKeyframe } from '../document/document.types.js';
import type { TimelineIdProvider } from '../identity/identity.types.js';

/**
 * A user-level timeline edit independent of its input surface.
 *
 * Pointer gestures, keyboard commands, AI tools, plugins, and macros express
 * the same intent shape before any document operation or history mutation is
 * performed. The planner deliberately covers only operations the timeline
 * domain already supports; future item types extend this union when they gain
 * real domain behavior.
 */
export type TimelineEditIntent =
  | { readonly type: 'track.add'; readonly input: CreateTrackInput; readonly index?: number }
  | { readonly type: 'track.remove'; readonly trackId: TrackId }
  | { readonly type: 'track.reorder'; readonly trackId: TrackId; readonly index: number }
  | {
      readonly type: 'track.state.update';
      readonly trackId: TrackId;
      readonly patch: UpdateTrackStateInput;
    }
  | { readonly type: 'clip.add'; readonly input: AddClipInput }
  | { readonly type: 'clip.remove'; readonly clipIds: readonly ClipId[] }
  | {
      readonly type: 'clip.move';
      readonly clipId: ClipId;
      readonly start: Milliseconds;
      readonly trackId?: TrackId;
    }
  | {
      readonly type: 'clip.trim';
      readonly clipId: ClipId;
      readonly edge: TrimEdge;
      readonly time: Milliseconds;
    }
  | { readonly type: 'clip.split'; readonly clipId: ClipId; readonly time: Milliseconds }
  | {
      readonly type: 'clip.properties.update';
      readonly clipId: ClipId;
      readonly patch: UpdateClipPropertiesInput;
    }
  | {
      readonly type: 'clip.animation.set';
      readonly clipId: ClipId;
      readonly animation: readonly ClipKeyframe[];
    }
  | {
      readonly type: 'clip.audio.update';
      readonly clipId: ClipId;
      readonly patch: Partial<ClipAudioSettings>;
    }
  | { readonly type: 'transition.add'; readonly input: AddTransitionInput }
  | {
      readonly type: 'transition.update';
      readonly transitionId: TransitionId;
      readonly patch: UpdateTransitionInput;
    }
  | { readonly type: 'transition.remove'; readonly transitionId: TransitionId };

/** Dependencies that make identity-producing plans deterministic and testable. */
export interface TimelineEditPlannerOptions {
  readonly idProvider?: TimelineIdProvider;
}
