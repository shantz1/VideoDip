// Reference example for VideoDip's plugin runtime (ADR-0009 Phase 5 v1).
//
// Runs inside a sandboxed iframe with no DOM access to the host, no cookies
// or storage, and no ambient network — see
// docs/adr/0009-phase-5-plugin-runtime-v1.md. The only authority this code
// has is what `context` exposes: the manifest, the granted capabilities,
// and `request()`, which crosses the message boundary back to the host.
//
// Install: in VideoDip's Text styles panel, "Install from folder" and pick
// this directory.

export async function activate(context) {
  const result = await context.request('renderer.register', 'subtitle-template.register', {
    version: 1,
    id: 'example.neon-glow.template',
    name: 'Neon Glow',
    description: 'A vivid neon caption style, contributed by the Neon Glow example plugin.',
    surface: 'subtitle',
    parameters: [],
    payload: {
      fontFamily: 'Anton',
      foreground: '#39ff14',
      fontSize: 56,
      fontWeight: 700,
      shadowColor: '#39ff14',
      shadowBlur: 18,
      shadowOpacity: 0.9,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
  });

  if (!result.ok) {
    throw new Error(`Neon Glow could not register its template: ${result.error.message}`);
  }
  return { ok: true };
}

export async function deactivate() {
  return { ok: true };
}
