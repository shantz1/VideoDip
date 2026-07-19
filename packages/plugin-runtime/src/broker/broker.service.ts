import {
  authorizePluginRequest,
  PLUGIN_API_VERSION,
  type PluginGrant,
  type PluginManifest,
  type PluginRequest,
} from '@videodip/plugin-sdk';
import { appError, err, ok, type Result } from '@videodip/shared';
import type {
  PluginChannel,
  PluginFaultHandler,
  PluginOperationRegistry,
} from './broker.types.js';

/** How long the broker waits for the sandbox's initial `ready` message. */
const DEFAULT_READY_TIMEOUT_MS = 5_000;

export interface PluginBrokerOptions {
  readonly channel: PluginChannel;
  readonly manifest: PluginManifest;
  readonly grant: PluginGrant;
  readonly operations: PluginOperationRegistry;
  readonly readyTimeoutMs?: number;
}

export interface PluginBroker {
  /**
   * Waits for the sandbox to report `ready`, then sends `initialize`
   * followed by `activate`. Resolves once both are dispatched — activation
   * itself is fire-and-forget from the host's side; a plugin that fails to
   * activate reports it through {@link PluginBroker.onFault}, not through
   * this promise, since activation happens inside the sandbox after this
   * call returns.
   */
  readonly start: () => Promise<Result<void>>;
  /** Sends `deactivate` and tears down the channel. Safe to call more than once. */
  readonly stop: () => void;
  /** Subscribes to sandbox faults (bad messages, thrown errors, mismatched API version). */
  readonly onFault: (handler: PluginFaultHandler) => () => void;
}

/**
 * Hosts one plugin's protocol lifecycle over an injected {@link PluginChannel}.
 *
 * Every inbound `request` is authorized against `grant` before its handler
 * (looked up in `operations`) ever runs — a plugin cannot reach a host
 * operation it was not granted, regardless of what the sandbox sends.
 */
export function createPluginBroker(options: PluginBrokerOptions): PluginBroker {
  const { channel, manifest, grant, operations } = options;
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const faultHandlers = new Set<PluginFaultHandler>();
  let stopped = false;

  const emitFault = (message: string): void => {
    for (const handler of faultHandlers) handler(message);
  };

  const unsubscribe = channel.onMessage((message) => {
    if (stopped) return;
    switch (message.type) {
      case 'ready':
        // Consumed by `start()`'s own one-shot listener below; a `ready`
        // outside that window (e.g. a duplicate) is unexpected but harmless.
        return;
      case 'fault':
        emitFault(message.message);
        return;
      case 'request': {
        void handleRequest(message);
        return;
      }
    }
  });

  async function handleRequest(request: PluginRequest): Promise<void> {
    const authorized = authorizePluginRequest(grant, request);
    if (!authorized.ok) {
      channel.post({
        type: 'response',
        requestId: request.requestId,
        ok: false,
        error: {
          code: authorized.error.code,
          message: authorized.error.message,
          recovery: authorized.error.recovery,
        },
      });
      return;
    }

    const handler = operations(request.capability, request.operation);
    if (handler === undefined) {
      channel.post({
        type: 'response',
        requestId: request.requestId,
        ok: false,
        error: {
          code: 'UNSUPPORTED',
          message: `No host operation is registered for ${request.capability}:${request.operation}.`,
          recovery: 'Contact the plugin author — this operation is not implemented.',
        },
      });
      return;
    }

    const result = await handler(request.payload);
    channel.post(
      result.ok
        ? { type: 'response', requestId: request.requestId, ok: true, value: result.value }
        : {
            type: 'response',
            requestId: request.requestId,
            ok: false,
            error: {
              code: result.error.code,
              message: result.error.message,
              recovery: result.error.recovery,
            },
          },
    );
  }

  const start = (): Promise<Result<void>> =>
    new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(
          err(
            appError(
              'PLUGIN',
              `Plugin ${manifest.id} did not become ready within ${readyTimeoutMs}ms.`,
              'The plugin may be broken or too slow to load. Disable it and check for updates.',
            ),
          ),
        );
      }, readyTimeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeout);
        unsubscribeReady();
      };

      const unsubscribeReady = channel.onMessage((message) => {
        if (message.type !== 'ready') return;
        cleanup();
        if (message.apiVersion !== PLUGIN_API_VERSION) {
          resolve(
            err(
              appError(
                'UNSUPPORTED',
                `Plugin ${manifest.id} targets API v${message.apiVersion}, host supports v${PLUGIN_API_VERSION}.`,
                'Update the plugin, or update VideoDip if this is an older plugin.',
              ),
            ),
          );
          return;
        }
        channel.post({
          type: 'initialize',
          manifest,
          grantedCapabilities: [...grant.capabilities],
        });
        channel.post({ type: 'activate' });
        resolve(ok(undefined));
      });
    });

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    channel.post({ type: 'deactivate' });
    unsubscribe();
    channel.dispose();
  };

  return {
    start,
    stop,
    onFault: (handler) => {
      faultHandlers.add(handler);
      return () => faultHandlers.delete(handler);
    },
  };
}
