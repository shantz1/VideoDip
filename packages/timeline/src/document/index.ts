export type { Clip, Track, TimelineDocument, TrackKind } from './document.types.js';
export {
  addClip,
  addTrack,
  createTimeline,
  createTrack,
  findFreeStart,
  getDuration,
  moveClip,
  removeClip,
  removeTrack,
  reorderTrack,
  splitClip,
  trimClip,
  type AddClipInput,
  type CreateTrackInput,
  type TrimEdge,
} from './document.service.js';
