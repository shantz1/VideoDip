import { FEATURES } from '../landing.content';

/**
 * The feature grid. Every card corresponds to work `TRACKER.md` marks done —
 * this section is a progress report styled as marketing, not a promise.
 */
export function FeatureGrid() {
  return (
    <section aria-labelledby="features-heading" className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="features-heading"
            className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl"
          >
            Already in the editor
          </h2>
          <p className="mt-4 text-md leading-relaxed text-text-secondary">
            Not a roadmap — everything below is implemented and tested in the repository today.
          </p>
        </div>
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-xl border border-border-subtle bg-surface-raised p-6"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent"
              >
                <feature.icon className="size-4.5" />
              </span>
              <h3 className="mt-4 text-md font-medium text-text-primary">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
