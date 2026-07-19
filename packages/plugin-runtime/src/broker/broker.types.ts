import type {
  HostPluginMessage,
  PluginCapability,
  PluginHostMessage,
  PluginJson,
} from '@videodip/plugin-sdk';
import type { Result } from '@videodip/shared';

/**
 * The transport a {@link createPluginBroker} host talks through.
 *
 * Deliberately abstract: the sandboxed-iframe adapter in `../sandbox`
 * implements this over `postMessage`, and tests implement it with an
 * in-memory pair — the broker itself never touches `window` or `iframe`, so
 * its message handling, request/response correlation, and authorization
 * logic are unit-testable without a browser.
 */
export interface PluginChannel {
  /** Sends one host-to-plugin message. */
  readonly post: (message: HostPluginMessage) => void;
  /** Subscribes to plugin-to-host messages; returns an unsubscribe function. */
  readonly onMessage: (handler: (message: PluginHostMessage) => void) => () => void;
  /** Releases the underlying transport (e.g. removes the iframe). Idempotent. */
  readonly dispose: () => void;
}

/**
 * Executes one authorized plugin operation and returns its result.
 *
 * Registered per `${capability}:${operation}` — see {@link operationKey}.
 * Handlers run with full host authority; the broker has already checked the
 * request's capability against the plugin's grant before a handler is ever
 * invoked, so a handler only needs to validate its own payload shape.
 */
export type PluginOperationHandler = (payload: PluginJson) => Promise<Result<PluginJson>>;

/** Looks up the handler for a capability + dotted operation name, if any is registered. */
export type PluginOperationRegistry = (
  capability: PluginCapability,
  operation: string,
) => PluginOperationHandler | undefined;

/** Reported when the plugin's sandbox signals an unrecoverable problem. */
export type PluginFaultHandler = (message: string) => void;
