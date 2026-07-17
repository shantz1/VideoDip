import type { Result } from '@videodip/shared';
import { z } from 'zod';
import {
  PLUGIN_API_VERSION,
  pluginCapabilitySchema,
  pluginManifestSchema,
  type PluginCapability,
  type PluginManifest,
} from './manifest.js';

/** JSON-only data accepted across the sandbox message boundary. */
export type PluginJson = z.infer<ReturnType<typeof z.json>>;

/** A capability-scoped operation requested by sandboxed plugin code. */
export const pluginRequestSchema = z.strictObject({
  type: z.literal('request'),
  requestId: z.string().min(1).max(128),
  capability: pluginCapabilitySchema,
  operation: z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/),
  payload: z.json(),
});

/** Validated plugin-to-host operation request. */
export type PluginRequest = z.infer<typeof pluginRequestSchema>;

/** Host-to-plugin messages. All payloads are structured-clone-safe JSON. */
export const hostPluginMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('initialize'),
    manifest: pluginManifestSchema,
    grantedCapabilities: z.array(pluginCapabilitySchema),
  }),
  z.strictObject({ type: z.literal('activate') }),
  z.strictObject({ type: z.literal('deactivate') }),
  z.strictObject({
    type: z.literal('response'),
    requestId: z.string().min(1),
    ok: z.boolean(),
    value: z.json().optional(),
    error: z
      .strictObject({ code: z.string().min(1), message: z.string().min(1), recovery: z.string() })
      .optional(),
  }),
]);

/** A validated message sent from the host to the sandbox. */
export type HostPluginMessage = z.infer<typeof hostPluginMessageSchema>;

/** Plugin-to-host messages accepted by the capability broker. */
export const pluginHostMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), apiVersion: z.literal(PLUGIN_API_VERSION) }),
  pluginRequestSchema,
  z.strictObject({ type: z.literal('fault'), message: z.string().min(1).max(1000) }),
]);

/** A validated message sent from the sandbox to the host. */
export type PluginHostMessage = z.infer<typeof pluginHostMessageSchema>;

/** Only authority exposed to plugin lifecycle code; there are no ambient host APIs. */
export interface PluginContext {
  readonly manifest: PluginManifest;
  readonly grantedCapabilities: ReadonlySet<PluginCapability>;
  readonly signal: AbortSignal;
  readonly request: <T extends PluginJson>(
    capability: PluginCapability,
    operation: string,
    payload: PluginJson,
  ) => Promise<Result<T>>;
}

/** Lifecycle implemented by a plugin and invoked by the isolated runtime. */
export interface VideoDipPlugin {
  readonly activate: (context: PluginContext) => Promise<Result<void>>;
  readonly deactivate: () => Promise<Result<void>>;
}
