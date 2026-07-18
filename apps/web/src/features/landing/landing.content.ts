/**
 * All copy and links for the landing page, in one place.
 *
 * Kept out of the components so the honesty rules are auditable at a glance:
 * every claim here must correspond to something `TRACKER.md` marks done. No
 * fabricated downloads, pricing, or testimonials — the product is in active
 * development and the page says so.
 */

import {
  Captions,
  Clapperboard,
  Infinity as InfinityIcon,
  Languages,
  Package,
  Plane,
  Puzzle,
  Scale,
  Scissors,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';

/** Canonical GitHub repository URL. The single call to action that exists. */
export const GITHUB_URL = 'https://github.com/shantz1/VideoDip';

/** Deep link to the build-from-source instructions in the repo README. */
export const BUILD_FROM_SOURCE_URL = `${GITHUB_URL}#getting-started`;

/** Deep link to the license text. The footer's AGPL note points here. */
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;

/** A feature card in the grid. */
export interface LandingFeature {
  /** Short feature name, rendered as the card heading. */
  readonly title: string;
  /** One or two sentences. Grounded in shipped work only. */
  readonly description: string;
  /** Decorative icon; hidden from assistive tech by the card. */
  readonly icon: LucideIcon;
}

/**
 * The feature grid. Every entry maps to a ✅ line in `TRACKER.md` — if it
 * isn't verifiably built, it doesn't get a card.
 */
export const FEATURES: readonly LandingFeature[] = [
  {
    title: 'Local Whisper subtitles',
    description:
      'Transcription runs on your own machine with whisper.cpp — 99 languages, ' +
      'word-level timing, and verified model downloads. Your audio is never uploaded.',
    icon: Captions,
  },
  {
    title: 'Real timeline editing',
    description:
      'Trim, split, drag and snap clips across multi-kind tracks, with keyframes, ' +
      'clip transforms and full undo/redo.',
    icon: Scissors,
  },
  {
    title: 'Native FFmpeg export',
    description:
      'Export MP4 through FFmpeg with presets sized for TikTok, Reels and Shorts — ' +
      'and a real progress percentage, not a spinner.',
    icon: Clapperboard,
  },
  {
    title: 'Portable projects',
    description:
      'A .videodip archive packs your project, media references and subtitles into ' +
      'one file you can move between machines.',
    icon: Package,
  },
  {
    title: 'Caption styling and formats',
    description:
      'A word-level caption styling and timing editor, with validated import and ' +
      'export for SRT, WebVTT and ASS.',
    icon: Languages,
  },
  {
    title: 'Plugin SDK',
    description:
      'A semver-stable public contract for extending the editor. Plugins get only ' +
      'the capabilities they declare — nothing ambient.',
    icon: Puzzle,
  },
];

/** A point in the "local by design" contrast section. */
export interface LandingPrinciple {
  /** Short claim, rendered as the item heading. */
  readonly title: string;
  /** Why it matters, in one sentence. */
  readonly description: string;
  /** Decorative icon; hidden from assistive tech by the item. */
  readonly icon: LucideIcon;
}

/**
 * The competitive wedge, stated as user-facing guarantees. These are the
 * constitution's non-goals turned outward: cloud-first competitors cannot
 * make these promises.
 */
export const PRINCIPLES: readonly LandingPrinciple[] = [
  {
    title: 'Works on a plane',
    description:
      'Editing, transcription and export all run locally. No network means nothing breaks.',
    icon: Plane,
  },
  {
    title: 'No per-minute quota',
    description:
      'Your hardware does the work, so there is no meter running while you transcribe or render.',
    icon: InfinityIcon,
  },
  {
    title: 'No account required',
    description: 'The editor never asks you to sign up, log in, or phone home to keep working.',
    icon: UserRoundX,
  },
  {
    title: 'AGPL-3.0 open source',
    description: 'Read the code, build it yourself, extend it. Free software, not a free trial.',
    icon: Scale,
  },
];
