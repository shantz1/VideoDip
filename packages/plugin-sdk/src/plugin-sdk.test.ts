import { describe, expect, it } from 'vitest';
import {
  PLUGIN_API_VERSION,
  authorizePluginRequest,
  createPluginGrant,
  hostPluginMessageSchema,
  pluginHostMessageSchema,
  pluginManifestSchema,
  pluginRequestSchema,
  type PluginManifest,
  type PluginRequest,
} from './index.js';

const MANIFEST: PluginManifest = {
  apiVersion: PLUGIN_API_VERSION,
  id: 'com.example.captions',
  name: 'Example Captions',
  version: '1.2.3',
  description: 'A test-only caption plugin.',
  entrypoint: 'dist/plugin.js',
  surfaces: ['subtitle-template'],
  capabilities: ['timeline.read', 'timeline.write'],
};

const REQUEST: PluginRequest = {
  type: 'request',
  requestId: 'request-1',
  capability: 'timeline.read',
  operation: 'timeline.get-document',
  payload: { includeClips: true },
};

describe('plugin manifest boundary', () => {
  it('accepts a namespaced, semver-versioned manifest', () => {
    expect(pluginManifestSchema.safeParse(MANIFEST).success).toBe(true);
  });

  it.each([
    ['un-namespaced id', { ...MANIFEST, id: 'captions' }],
    ['non-semver version', { ...MANIFEST, version: 'latest' }],
    ['parent traversal', { ...MANIFEST, entrypoint: '../plugin.js' }],
    ['absolute path', { ...MANIFEST, entrypoint: 'C:\\plugin.js' }],
    [
      'duplicate capability',
      {
        ...MANIFEST,
        capabilities: ['timeline.read', 'timeline.read'],
      },
    ],
  ])('rejects %s', (_case, manifest) => {
    expect(pluginManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects unknown fields so misspelled security declarations are visible', () => {
    expect(
      pluginManifestSchema.safeParse({ ...MANIFEST, capabilites: ['network.fetch'] }).success,
    ).toBe(false);
  });
});

describe('sandbox message protocol', () => {
  it('accepts JSON-only, capability-scoped requests', () => {
    expect(pluginRequestSchema.safeParse(REQUEST).success).toBe(true);
  });

  it('rejects functions and other non-JSON request payloads', () => {
    expect(
      pluginRequestSchema.safeParse({ ...REQUEST, payload: { callback: () => undefined } }).success,
    ).toBe(false);
  });

  it('validates lifecycle messages in both directions', () => {
    expect(
      hostPluginMessageSchema.safeParse({
        type: 'initialize',
        manifest: MANIFEST,
        grantedCapabilities: ['timeline.read'],
      }).success,
    ).toBe(true);
    expect(
      pluginHostMessageSchema.safeParse({ type: 'ready', apiVersion: PLUGIN_API_VERSION }).success,
    ).toBe(true);
  });

  it('rejects a plugin using a different protocol major', () => {
    expect(pluginHostMessageSchema.safeParse({ type: 'ready', apiVersion: 2 }).success).toBe(false);
  });
});

describe('capability grants', () => {
  it('creates an immutable-shaped grant from declared capabilities', () => {
    const result = createPluginGrant(MANIFEST, ['timeline.read']);
    expect(result.ok).toBe(true);
    if (result.ok) expect([...result.value.capabilities]).toEqual(['timeline.read']);
  });

  it('refuses authority that was not declared for installation review', () => {
    const result = createPluginGrant(MANIFEST, ['network.fetch']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('authorizes each request against the actual grant', () => {
    const grant = createPluginGrant(MANIFEST, ['timeline.read']);
    if (!grant.ok) throw new Error(grant.error.message);

    expect(authorizePluginRequest(grant.value, REQUEST).ok).toBe(true);
    expect(
      authorizePluginRequest(grant.value, {
        ...REQUEST,
        capability: 'timeline.write',
      }).ok,
    ).toBe(false);
  });
});
