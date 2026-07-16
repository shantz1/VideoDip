/**
 * `@videodip/shared` — the base of the dependency graph.
 *
 * Everything imports this package; this package imports nothing but `zod`.
 * Adding a runtime dependency here pushes it onto every workspace in the repo,
 * including the Tauri bundle, so treat additions as an architectural change.
 *
 * Only what is re-exported here is public API.
 */

export * from './branded/index.js';
export * from './ports/index.js';
export * from './result/index.js';
