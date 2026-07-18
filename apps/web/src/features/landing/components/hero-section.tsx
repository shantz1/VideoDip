import { ArrowRight, Star } from 'lucide-react';
import { BUILD_FROM_SOURCE_URL, GITHUB_URL } from '../landing.content';
import { LinkButton } from './link-button';

/**
 * The hero: the product claim, the wedge, and honest calls to action.
 *
 * There is intentionally no download button — the product has no installer
 * release yet, and a dead or fake download is worse than none. The GitHub
 * repository is the release until then, and the copy says exactly that.
 */
export function HeroSection() {
  return (
    <section aria-labelledby="hero-heading" className="px-6 pt-24 pb-20 sm:pt-32">
      <div className="mx-auto max-w-3xl text-center">
        <p className="border-border-subtle bg-surface-raised text-text-secondary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <span aria-hidden="true" className="bg-success size-1.5 rounded-full" />
          Open source · Offline-first · In active development
        </p>
        <h1
          id="hero-heading"
          className="font-display text-text-primary mt-6 text-4xl leading-tight font-semibold tracking-tighter sm:text-5xl lg:text-6xl"
        >
          Your media never leaves your machine.
        </h1>
        <p className="text-text-secondary mt-6 text-lg leading-relaxed">
          VideoDip is an open-source, offline-first, AI-powered video editing toolkit for short-form
          creators. Subtitles, timeline editing and native export — all running locally on your
          desktop.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <LinkButton variant="primary" size="lg" href={GITHUB_URL}>
            <Star aria-hidden="true" className="size-4" />
            Star on GitHub
          </LinkButton>
          <LinkButton variant="outline" size="lg" href={BUILD_FROM_SOURCE_URL}>
            Build from source
            <ArrowRight aria-hidden="true" className="size-4" />
          </LinkButton>
        </div>
        <p className="text-text-tertiary mt-4 text-sm">
          Download coming soon — until then, the repository is the release.
        </p>
      </div>
    </section>
  );
}
