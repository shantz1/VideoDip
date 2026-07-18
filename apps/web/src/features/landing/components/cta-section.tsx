import { ArrowRight, Star } from 'lucide-react';
import { BUILD_FROM_SOURCE_URL, GITHUB_URL } from '../landing.content';
import { LinkButton } from './link-button';

/**
 * Closing call to action.
 *
 * The "Download coming soon" state is a plain, non-interactive pill on
 * purpose: rendering it as a disabled button would advertise a control that
 * does not exist yet. When installers ship, this pill becomes the download
 * button.
 */
export function CtaSection() {
  return (
    <section aria-labelledby="cta-heading" className="px-6 py-20">
      <div className="border-border-subtle bg-surface-raised mx-auto max-w-3xl rounded-2xl border px-6 py-12 text-center sm:px-12">
        <h2
          id="cta-heading"
          className="font-display text-text-primary text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Watch it come together
        </h2>
        <p className="text-md text-text-secondary mt-4 leading-relaxed">
          VideoDip is built in the open under AGPL-3.0. Star the repository to follow releases, or
          clone it and build the editor from source today.
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
        <p className="mt-6">
          <span className="border-border-default text-text-tertiary inline-flex items-center rounded-full border border-dashed px-3 py-1 text-xs">
            Download coming soon
          </span>
        </p>
      </div>
    </section>
  );
}
