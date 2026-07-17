import { z } from 'zod';

/** Current major protocol understood by this SDK and compatible hosts. */
export const PLUGIN_API_VERSION = 1 as const;

/** Extension points a plugin can contribute to the editor. */
export const pluginSurfaceSchema = z.enum([
  'subtitle-template',
  'transition',
  'animation',
  'effect',
  'font',
  'ai-provider',
  'export-preset',
]);

/** A declared extension point; declaration does not itself grant host access. */
export type PluginSurface = z.infer<typeof pluginSurfaceSchema>;

/** Host operations that may be granted independently at installation time. */
export const pluginCapabilitySchema = z.enum([
  'timeline.read',
  'timeline.write',
  'project.read',
  'media.metadata.read',
  'media.content.read',
  'storage.plugin',
  'network.fetch',
  'ui.panel',
  'renderer.register',
  'ai.register',
  'export.register',
]);

/** One explicitly requested and host-granted authority. */
export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;
const relativeEntrypointSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.startsWith('\\') &&
      !/^[a-zA-Z]:/.test(path) &&
      !path.split(/[\\/]/).includes('..'),
    'Entrypoint must stay inside the plugin package.',
  );

/**
 * Registry/disk manifest schema. Strict parsing prevents misspelled security
 * fields from being silently ignored at the plugin boundary.
 */
export const pluginManifestSchema = z.strictObject({
  apiVersion: z.literal(PLUGIN_API_VERSION),
  id: z
    .string()
    .min(3)
    .max(128)
    .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/, 'Use a namespaced lowercase plugin id.'),
  name: z.string().trim().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Use a semantic version.'),
  description: z.string().trim().min(1).max(500).optional(),
  entrypoint: relativeEntrypointSchema,
  surfaces: z.array(pluginSurfaceSchema).min(1).max(16).refine(unique, 'Surfaces must be unique.'),
  capabilities: z
    .array(pluginCapabilitySchema)
    .max(32)
    .refine(unique, 'Capabilities must be unique.'),
});

/** Validated plugin metadata persisted by a host or registry. */
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
