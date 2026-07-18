import { LandingPage } from '@/features/landing';

/**
 * The marketing site is a single landing page. Docs, changelog and the
 * template gallery become routes of their own when they have real content —
 * a navigation full of placeholder pages would oversell where the product is.
 */
export default function HomePage() {
  return <LandingPage />;
}
