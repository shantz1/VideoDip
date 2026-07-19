import { createPluginGrant, type HostPluginMessage, type PluginHostMessage } from '@videodip/plugin-sdk';
import { ok, type PluginManifest } from '@videodip/shared';
import { describe, expect, it, vi } from 'vitest';
import { createPluginBroker } from './broker.service.js';
import type { PluginChannel } from './broker.types.js';

const manifest: PluginManifest = {
  apiVersion: 1,
  id: 'videodip.example',
  name: 'Example',
  version: '1.0.0',
  entrypoint: 'index.js',
  surfaces: ['subtitle-template'],
  capabilities: ['renderer.register'],
};

/**
 * An in-memory duplex pair standing in for the real iframe/postMessage
 * transport — the broker only ever sees the `PluginChannel` interface, so
 * this is enough to exercise its logic without a browser.
 */
function createFakeChannelPair() {
  const toHost = new Set<(message: PluginHostMessage) => void>();
  const toSandbox = new Set<(message: HostPluginMessage) => void>();
  const sentToSandbox: HostPluginMessage[] = [];
  let disposed = false;

  const hostChannel: PluginChannel = {
    post: (message) => {
      sentToSandbox.push(message);
      for (const handler of toSandbox) handler(message);
    },
    onMessage: (handler) => {
      toHost.add(handler);
      return () => toHost.delete(handler);
    },
    dispose: () => {
      disposed = true;
    },
  };

  return {
    hostChannel,
    sentToSandbox,
    isDisposed: () => disposed,
    sandboxSend: (message: PluginHostMessage) => {
      for (const handler of toHost) handler(message);
    },
    onSandboxReceive: (handler: (message: HostPluginMessage) => void) => {
      toSandbox.add(handler);
    },
  };
}

describe('createPluginBroker', () => {
  it('waits for ready, then sends initialize and activate', async () => {
    const { hostChannel, sandboxSend, sentToSandbox } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, manifest.capabilities);
    if (!grant.ok) throw new Error(grant.error.message);
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: () => undefined,
    });

    const started = broker.start();
    sandboxSend({ type: 'ready', apiVersion: 1 });
    const result = await started;

    expect(result.ok).toBe(true);
    expect(sentToSandbox).toEqual([
      { type: 'initialize', manifest, grantedCapabilities: ['renderer.register'] },
      { type: 'activate' },
    ]);
  });

  it('fails start() when apiVersion mismatches', async () => {
    const { hostChannel, sandboxSend } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, []);
    if (!grant.ok) throw new Error(grant.error.message);
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: () => undefined,
    });

    const started = broker.start();
    // @ts-expect-error -- exercising an intentionally invalid wire version
    sandboxSend({ type: 'ready', apiVersion: 2 });
    const result = await started;

    expect(result.ok).toBe(false);
  });

  it('times out when ready never arrives', async () => {
    const { hostChannel } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, []);
    if (!grant.ok) throw new Error(grant.error.message);
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: () => undefined,
      readyTimeoutMs: 5,
    });

    const result = await broker.start();
    expect(result.ok).toBe(false);
  });

  it('authorizes a granted request and dispatches it to the registered handler', async () => {
    const { hostChannel, sandboxSend, sentToSandbox } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, ['renderer.register']);
    if (!grant.ok) throw new Error(grant.error.message);
    const handler = vi.fn().mockResolvedValue(ok({ registered: true }));
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: (capability, operation) =>
        capability === 'renderer.register' && operation === 'subtitle-template.register'
          ? handler
          : undefined,
    });

    const started = broker.start();
    sandboxSend({ type: 'ready', apiVersion: 1 });
    await started;
    sentToSandbox.length = 0;

    sandboxSend({
      type: 'request',
      requestId: 'req-1',
      capability: 'renderer.register',
      operation: 'subtitle-template.register',
      payload: { foo: 'bar' },
    });
    await vi.waitFor(() => expect(sentToSandbox).toHaveLength(1));

    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    expect(sentToSandbox[0]).toEqual({
      type: 'response',
      requestId: 'req-1',
      ok: true,
      value: { registered: true },
    });
  });

  it('rejects a request for a capability the plugin was not granted, without calling any handler', async () => {
    const { hostChannel, sandboxSend, sentToSandbox } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, []);
    if (!grant.ok) throw new Error(grant.error.message);
    const handler = vi.fn().mockResolvedValue(ok({}));
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: () => handler,
    });

    const started = broker.start();
    sandboxSend({ type: 'ready', apiVersion: 1 });
    await started;
    sentToSandbox.length = 0;

    sandboxSend({
      type: 'request',
      requestId: 'req-1',
      capability: 'renderer.register',
      operation: 'subtitle-template.register',
      payload: {},
    });
    await vi.waitFor(() => expect(sentToSandbox).toHaveLength(1));

    expect(handler).not.toHaveBeenCalled();
    expect(sentToSandbox[0]).toMatchObject({ type: 'response', requestId: 'req-1', ok: false });
  });

  it('reports UNSUPPORTED when no handler is registered for an authorized capability', async () => {
    const { hostChannel, sandboxSend, sentToSandbox } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, ['renderer.register']);
    if (!grant.ok) throw new Error(grant.error.message);
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: () => undefined,
    });

    const started = broker.start();
    sandboxSend({ type: 'ready', apiVersion: 1 });
    await started;
    sentToSandbox.length = 0;

    sandboxSend({
      type: 'request',
      requestId: 'req-1',
      capability: 'renderer.register',
      operation: 'nothing.here',
      payload: {},
    });
    await vi.waitFor(() => expect(sentToSandbox).toHaveLength(1));

    expect(sentToSandbox[0]).toMatchObject({
      type: 'response',
      requestId: 'req-1',
      ok: false,
      error: { code: 'UNSUPPORTED' },
    });
  });

  it('surfaces sandbox faults through onFault', async () => {
    const { hostChannel, sandboxSend } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, []);
    if (!grant.ok) throw new Error(grant.error.message);
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: () => undefined,
    });
    const faults: string[] = [];
    broker.onFault((message) => faults.push(message));

    const started = broker.start();
    sandboxSend({ type: 'ready', apiVersion: 1 });
    await started;
    sandboxSend({ type: 'fault', message: 'plugin threw' });

    expect(faults).toEqual(['plugin threw']);
  });

  it('stop() sends deactivate and disposes the channel', async () => {
    const { hostChannel, sandboxSend, sentToSandbox, isDisposed } = createFakeChannelPair();
    const grant = createPluginGrant(manifest, []);
    if (!grant.ok) throw new Error(grant.error.message);
    const broker = createPluginBroker({
      channel: hostChannel,
      manifest,
      grant: grant.value,
      operations: () => undefined,
    });

    const started = broker.start();
    sandboxSend({ type: 'ready', apiVersion: 1 });
    await started;

    broker.stop();

    expect(sentToSandbox.at(-1)).toEqual({ type: 'deactivate' });
    expect(isDisposed()).toBe(true);
  });
});
