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
            className="font-display text-text-primary text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Already in the editor
          </h2>
          <p className="text-md text-text-secondary mt-4 leading-relaxed">
            Not a roadmap — everything below is implemented and tested in the repository today.
          </p>
        </div>
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="border-border-subtle bg-surface-raised rounded-xl border p-6"
            >
              <span
                aria-hidden="true"
                className="bg-accent-subtle text-accent inline-flex size-9 items-center justify-center rounded-lg"
              >
                <feature.icon className="size-4.5" />
              </span>
              <h3 className="text-md text-text-primary mt-4 font-medium">{feature.title}</h3>
              <p className="text-text-secondary mt-2 text-sm leading-relaxed">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
