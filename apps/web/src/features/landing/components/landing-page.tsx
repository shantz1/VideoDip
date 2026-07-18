import { CtaSection } from './cta-section';
import { FeatureGrid } from './feature-grid';
import { HeroSection } from './hero-section';
import { LocalByDesignSection } from './local-by-design-section';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * The complete landing page: skip link, header, content sections, footer.
 *
 * Entirely server-rendered — no client component anywhere on the page. Motion
 * is limited to CSS transitions driven by the design system's duration tokens,
 * which `prefers-reduced-motion` zeroes globally in `@videodip/ui`.
 */
export function LandingPage() {
  return (
    <>
      {/* Keyboard users land here first. Parked off-screen until focused —
          the transition uses token durations, so reduced-motion zeroes it. */}
      <a
        href="#main-content"
        className="fixed top-4 left-4 z-[var(--z-toast)] -translate-y-20 rounded-md border border-border-default bg-surface-overlay px-4 py-2 text-sm text-text-primary transition-transform duration-[--duration-fast] ease-[--ease-out-quad] focus-visible:translate-y-0"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">
        <HeroSection />
        <FeatureGrid />
        <LocalByDesignSection />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  );
}
