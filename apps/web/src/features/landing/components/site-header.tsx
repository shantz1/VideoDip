import { Star } from 'lucide-react';
import { GITHUB_URL } from '../landing.content';
import { LinkButton } from './link-button';

/**
 * Sticky site header with the wordmark and the single call to action.
 *
 * The nav is deliberately empty of section links: a one-page site with a
 * five-item menu is navigation theater. Links appear here when there are real
 * pages to link to.
 */
export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-[var(--z-sticky)]">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6"
      >
        <a href="/" className="font-display text-md text-text-primary font-semibold tracking-tight">
          VideoDip
        </a>
        <LinkButton variant="outline" size="sm" href={GITHUB_URL}>
          <Star aria-hidden="true" className="size-3.5" />
          Star on GitHub
        </LinkButton>
      </nav>
    </header>
  );
}
