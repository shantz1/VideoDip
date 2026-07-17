import { appError, err, ok, type Result } from '@videodip/shared';
import type { PluginCapability, PluginManifest } from './manifest.js';
import type { PluginRequest } from './protocol.js';

/** Capabilities the user/host granted from a plugin's declared request set. */
export interface PluginGrant {
  readonly pluginId: string;
  readonly capabilities: ReadonlySet<PluginCapability>;
}

/**
 * Validates an installation grant. A host cannot accidentally grant authority
 * the plugin did not declare for review in its manifest.
 */
export function createPluginGrant(
  manifest: PluginManifest,
  capabilities: readonly PluginCapability[],
): Result<PluginGrant> {
  const declared = new Set(manifest.capabilities);
  const undeclared = capabilities.find((capability) => !declared.has(capability));
  if (undeclared !== undefined) {
    return err(
      appError(
        'VALIDATION',
        `Plugin ${manifest.id} did not declare capability ${undeclared}.`,
        'Review the plugin manifest and grant only declared capabilities.',
      ),
    );
  }
  return ok({ pluginId: manifest.id, capabilities: new Set(capabilities) });
}

/** Checks every sandbox request against the immutable installation grant. */
export function authorizePluginRequest(grant: PluginGrant, request: PluginRequest): Result<void> {
  if (grant.capabilities.has(request.capability)) return ok(undefined);
  return err(
    appError(
      'UNSUPPORTED',
      `Plugin ${grant.pluginId} is not allowed to use ${request.capability}.`,
      'Grant the capability explicitly, or disable the plugin operation.',
    ),
  );
}
