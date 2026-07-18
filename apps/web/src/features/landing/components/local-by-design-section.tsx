import { PRINCIPLES } from '../landing.content';

/**
 * The contrast section: the constitution's non-goals stated as user-facing
 * guarantees. This is the wedge against cloud-first, subscription-gated
 * competitors, so it gets its own visually distinct band.
 */
export function LocalByDesignSection() {
  return (
    <section
      aria-labelledby="principles-heading"
      className="border-border-subtle bg-surface-sunken border-y px-6 py-20"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="principles-heading"
            className="font-display text-text-primary text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Local by design
          </h2>
          <p className="text-md text-text-secondary mt-4 leading-relaxed">
            Cloud editors meter your minutes and hold your footage. VideoDip inverts that deal.
          </p>
        </div>
        <ul className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
          {PRINCIPLES.map((principle) => (
            <li key={principle.title} className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="bg-accent-subtle text-accent inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
              >
                <principle.icon className="size-4.5" />
              </span>
              <div>
                <h3 className="text-md text-text-primary font-medium">{principle.title}</h3>
                <p className="text-text-secondary mt-1 text-sm leading-relaxed">
                  {principle.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
