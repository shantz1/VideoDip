'use client';

import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  createPluginGrant,
  pluginManifestSchema,
  type PluginManifest,
} from '@videodip/plugin-sdk';
import {
  createIframeSandboxChannel,
  createPluginBroker,
  createSubtitleTemplateRegisterHandler,
  type PluginBroker,
  type PluginOperationRegistry,
} from '@videodip/plugin-runtime';
import { appError, err, ok, tryCatchAsync, type Result } from '@videodip/shared';
import type { TemplateDefinition } from '@videodip/template-engine';
import { create } from 'zustand';

/** One locally-installed plugin (ADR-0009 Phase 5 v1: local folder only, no registry). */
export interface InstalledPlugin {
  readonly manifest: PluginManifest;
  readonly folderPath: string;
  readonly enabled: boolean;
  /** Set once activation completes without a fault; cleared on disable or fault. */
  readonly fault: string | null;
}

interface PluginState {
  readonly plugins: readonly InstalledPlugin[];
  /** Subtitle style templates plugins have registered via `renderer.register`. */
  readonly templates: readonly TemplateDefinition[];
  readonly isInstalling: boolean;
  /** Opens the native folder picker and installs (enabled) the chosen plugin. */
  readonly installFromFolder: () => Promise<Result<void>>;
  readonly setEnabled: (pluginId: string, enabled: boolean) => void;
  readonly uninstall: (pluginId: string) => void;
}

/** Live sandboxes are not serializable Zustand state — tracked alongside it, keyed by plugin id. */
const activeBrokers = new Map<string, PluginBroker>();

export const usePluginStore = create<PluginState>()((set, get) => ({
  plugins: [],
  templates: [],
  isInstalling: false,

  installFromFolder: async () => {
    if (!isTauri()) {
      return err(
        appError(
          'UNSUPPORTED',
          'Attempted to install a plugin outside a Tauri window.',
          'Plugins need the desktop app — run `pnpm tauri dev`, not the browser preview.',
        ),
      );
    }
    const folderPath = await open({ directory: true, multiple: false });
    if (folderPath === null || Array.isArray(folderPath)) return ok(undefined);

    set({ isInstalling: true });
    const result = await tryCatchAsync(
      async () => {
        const source = await invoke<{ manifestJson: string; entrypointSource: string }>(
          'load_plugin_from_folder',
          { folderPath },
        );
        const manifestJson: unknown = JSON.parse(source.manifestJson);
        const manifest = pluginManifestSchema.parse(manifestJson);
        if (get().plugins.some((plugin) => plugin.manifest.id === manifest.id)) {
          throw new Error(`Plugin ${manifest.id} is already installed.`);
        }
        return { manifest, entrypointSource: source.entrypointSource, folderPath };
      },
      (cause) =>
        appError(
          'VALIDATION',
          `Could not load the plugin: ${cause instanceof Error ? cause.message : String(cause)}`,
          'Check that the folder contains a valid manifest.json and entrypoint.',
          { cause },
        ),
    );
    set({ isInstalling: false });
    if (!result.ok) return result;

    const { manifest, entrypointSource, folderPath: installedPath } = result.value;
    set((state) => ({
      plugins: [
        ...state.plugins,
        { manifest, folderPath: installedPath, enabled: false, fault: null },
      ],
    }));
    activateSandbox(manifest, entrypointSource);
    return ok(undefined);
  },

  setEnabled: (pluginId, enabled) => {
    const plugin = get().plugins.find((candidate) => candidate.manifest.id === pluginId);
    if (!plugin || plugin.enabled === enabled) return;
    set((state) => ({
      plugins: state.plugins.map((candidate) =>
        candidate.manifest.id === pluginId ? { ...candidate, enabled, fault: null } : candidate,
      ),
    }));
    if (!enabled) {
      activeBrokers.get(pluginId)?.stop();
      activeBrokers.delete(pluginId);
      set((state) => ({
        templates: state.templates.filter((template) => !template.id.startsWith(`${pluginId}.`)),
      }));
      return;
    }
    if (!isTauri()) return;
    void invoke<{ manifestJson: string; entrypointSource: string }>('load_plugin_from_folder', {
      folderPath: plugin.folderPath,
    }).then((source) => activateSandbox(plugin.manifest, source.entrypointSource));
  },

  uninstall: (pluginId) => {
    activeBrokers.get(pluginId)?.stop();
    activeBrokers.delete(pluginId);
    set((state) => ({
      plugins: state.plugins.filter((plugin) => plugin.manifest.id !== pluginId),
      templates: state.templates.filter((template) => !template.id.startsWith(`${pluginId}.`)),
    }));
  },
}));

function activateSandbox(manifest: PluginManifest, entrypointSource: string): void {
  const grant = createPluginGrant(manifest, manifest.capabilities);
  if (!grant.ok) {
    reportFault(manifest.id, grant.error.message);
    return;
  }

  const operations: PluginOperationRegistry = (capability, operation) => {
    if (capability === 'renderer.register' && operation === 'subtitle-template.register') {
      return createSubtitleTemplateRegisterHandler((template) => {
        usePluginStore.setState((state) => ({
          templates: [
            ...state.templates.filter((existing) => existing.id !== template.id),
            template,
          ],
        }));
      });
    }
    return undefined;
  };

  const channel = createIframeSandboxChannel(entrypointSource);
  const broker = createPluginBroker({ channel, manifest, grant: grant.value, operations });
  broker.onFault((message) => reportFault(manifest.id, message));
  activeBrokers.set(manifest.id, broker);

  void broker.start().then((result) => {
    if (!result.ok) reportFault(manifest.id, result.error.message);
    else markEnabled(manifest.id);
  });
}

function markEnabled(pluginId: string): void {
  usePluginStore.setState((state) => ({
    plugins: state.plugins.map((plugin) =>
      plugin.manifest.id === pluginId ? { ...plugin, enabled: true, fault: null } : plugin,
    ),
  }));
}

function reportFault(pluginId: string, message: string): void {
  usePluginStore.setState((state) => ({
    plugins: state.plugins.map((plugin) =>
      plugin.manifest.id === pluginId ? { ...plugin, enabled: false, fault: message } : plugin,
    ),
  }));
}
