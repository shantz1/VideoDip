export type { Clip, Track, TimelineDocument, TrackKind } from './document.types.js';
export {
  addClip,
  createEmptyTimeline,
  findFreeStart,
  getDuration,
  moveClip,
  removeClip,
  splitClip,
  trimClip,
  type AddClipInput,
  type TrimEdge,
} from './document.service.js';
