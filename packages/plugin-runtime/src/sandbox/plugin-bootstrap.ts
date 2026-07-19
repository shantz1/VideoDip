/**
 * The script that runs *inside* the sandboxed iframe (see `iframe-sandbox.ts`).
 *
 * Written as a plain ES5-ish function body — this never goes through the
 * package's own TypeScript build, it is embedded verbatim into the iframe's
 * `srcdoc` and executed by the browser directly in the plugin's isolated
 * realm. Base64-encoding the plugin source (rather than string-interpolating
 * it into the HTML) sidesteps `</script>`-sequence escaping entirely, and
 * `Blob` + `URL.createObjectURL` + dynamic `import()` load it as a real ES
 * module without ever fetching over the network — the object URL is created
 * inside the iframe's own realm, so it is same-realm to itself regardless of
 * the sandbox's opaque origin.
 */
const BOOTSTRAP_SCRIPT = String.raw`
(function () {
  var pending = new Map();
  var pluginModule = null;
  var context = null;
  var abortController = new AbortController();
  var nextRequestId = 0;

  function post(message) {
    window.parent.postMessage(message, '*');
  }

  function requestFromHost(capability, operation, payload) {
    return new Promise(function (resolve) {
      var requestId = 'req-' + (nextRequestId += 1);
      pending.set(requestId, resolve);
      post({
        type: 'request',
        requestId: requestId,
        capability: capability,
        operation: operation,
        payload: payload,
      });
    });
  }

  function faultMessage(error) {
    return error && typeof error.message === 'string' ? error.message : String(error);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'initialize') {
      context = {
        manifest: message.manifest,
        grantedCapabilities: new Set(message.grantedCapabilities),
        signal: abortController.signal,
        request: requestFromHost,
      };
      return;
    }

    if (message.type === 'activate') {
      if (pluginModule === null || context === null) {
        post({ type: 'fault', message: 'Received activate before the plugin module finished loading.' });
        return;
      }
      Promise.resolve()
        .then(function () {
          return pluginModule.activate(context);
        })
        .then(function (result) {
          if (!result || result.ok !== true) {
            var message = result && result.error && result.error.message;
            post({ type: 'fault', message: message || 'Plugin activation returned a failing result.' });
          }
        })
        .catch(function (error) {
          post({ type: 'fault', message: faultMessage(error) });
        });
      return;
    }

    if (message.type === 'deactivate') {
      abortController.abort();
      if (pluginModule !== null) {
        Promise.resolve()
          .then(function () {
            return pluginModule.deactivate();
          })
          .catch(function (error) {
            post({ type: 'fault', message: faultMessage(error) });
          });
      }
      return;
    }

    if (message.type === 'response') {
      var resolver = pending.get(message.requestId);
      if (resolver === undefined) return;
      pending.delete(message.requestId);
      resolver(message.ok ? { ok: true, value: message.value } : { ok: false, error: message.error });
      return;
    }
  });

  try {
    var source = atob('__PLUGIN_SOURCE_BASE64__');
    var blob = new Blob([source], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    import(url)
      .then(function (module) {
        pluginModule = module;
        post({ type: 'ready', apiVersion: 1 });
      })
      .catch(function (error) {
        post({ type: 'fault', message: 'Failed to load the plugin module: ' + faultMessage(error) });
      })
      .finally(function () {
        URL.revokeObjectURL(url);
      });
  } catch (error) {
    post({ type: 'fault', message: 'Failed to decode the plugin source: ' + faultMessage(error) });
  }
})();
`;

/**
 * Builds the sandboxed iframe's `srcdoc`. `pluginSource` is the plugin
 * entrypoint's raw JS text (an ES module exporting `activate`/`deactivate`
 * per `VideoDipPlugin`) — the host reads it (e.g. from the local plugin
 * folder) and passes it in; the sandbox never fetches anything itself.
 */
export function buildSandboxSrcDoc(pluginSource: string): string {
  const base64 = encodeUtf8Base64(pluginSource);
  const script = BOOTSTRAP_SCRIPT.replace('__PLUGIN_SOURCE_BASE64__', base64);
  return `<!doctype html><title>VideoDip plugin sandbox</title><script>${script}</script>`;
}

/** `btoa` only accepts Latin1 code points; plugin source is UTF-8 and may contain any character. */
function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}
