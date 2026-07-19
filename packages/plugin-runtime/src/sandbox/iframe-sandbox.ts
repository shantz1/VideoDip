import {
  pluginHostMessageSchema,
  type HostPluginMessage,
  type PluginHostMessage,
} from '@videodip/plugin-sdk';
import type { PluginChannel } from '../broker/broker.types.js';
import { buildSandboxSrcDoc } from './plugin-bootstrap.js';

/**
 * Hosts one plugin inside a `sandbox="allow-scripts"` iframe — deliberately
 * without `allow-same-origin`, `allow-forms`, `allow-popups`, or any other
 * sandbox token. That combination gives the plugin an opaque origin: no
 * cookies, no `localStorage`/`indexedDB`, no access to the parent DOM, and
 * no ambient `window.__TAURI__` — the plugin can only affect the host through
 * `postMessage`, which is exactly the channel `PluginContext.request` uses.
 *
 * `targetOrigin: '*'` is required (an opaque origin cannot be addressed by
 * name), which means origin-based authentication is unavailable in either
 * direction. Both sides authenticate by `event.source` identity instead — a
 * reference check, not a string compare, so it cannot be spoofed by another
 * frame claiming the same origin.
 */
export function createIframeSandboxChannel(pluginSource: string): PluginChannel {
  const iframe = document.createElement('iframe');
  iframe.sandbox.add('allow-scripts');
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.srcdoc = buildSandboxSrcDoc(pluginSource);
  document.body.appendChild(iframe);

  return {
    post: (message: HostPluginMessage) => {
      iframe.contentWindow?.postMessage(message, '*');
    },
    onMessage: (handler: (message: PluginHostMessage) => void) => {
      const listener = (event: MessageEvent<unknown>) => {
        if (event.source !== iframe.contentWindow) return;
        // The sandbox is untrusted by definition — validate before the
        // broker ever sees a shape it assumes is already checked.
        const parsed = pluginHostMessageSchema.safeParse(event.data);
        if (parsed.success) handler(parsed.data);
      };
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
    dispose: () => {
      iframe.remove();
    },
  };
}
