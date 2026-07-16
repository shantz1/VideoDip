# ADR-0002: Compute runs locally; the server stays thin

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

VideoDip's available server infrastructure is a single Hostinger KVM 2 VPS
(≈2 vCPU, 8 GB RAM, NVMe). The competitors we are positioned against — Submagic
and VEED — are cloud-first: the user uploads media, their fleet transcribes and
renders, the user downloads the result.

Copying that model on this hardware does not work, and the arithmetic is not
close. A single 4K H.264 export saturates both vCPUs for minutes. Whisper
transcription on CPU runs at a fraction of realtime. One concurrent user would
degrade the box; a handful would take it down, including the marketing site
hosted beside them. Scaling out means GPU instances and a bill that an
open-source project with no revenue cannot absorb — and the cost grows linearly
with users, so success becomes the thing that kills it.

Meanwhile the target user already owns the hardware. A creator editing short-form
video has a machine with a GPU and cores that sit idle while a cloud service
bills them per minute to do the same work more slowly, after an upload.

## Decision

**All compute runs on the user's machine. The VPS never touches user media.**

The desktop app owns transcription (Faster-Whisper / WhisperX), media probing and
processing (FFmpeg), composition (Remotion), and export. It is fully functional
with the network cable unplugged and no account.

The VPS is limited to work that is small, cacheable, and media-free:

- `apps/web` — the marketing site.
- `apps/api` — licensing, the plugin/template registry, the update feed, and
  opt-in settings sync (project metadata only, never media).

`apps/worker` and `apps/renderer` exist as workspaces and are architected as
queue consumers, but in the shipping topology they run **in-process on the
desktop**, driven by the local queue. The BullMQ/Redis abstraction is retained so
that a future cloud tier is a deployment change rather than a rewrite — but no
such tier is planned, and none may be added without an ADR superseding this one.

## Consequences

**Good:**

- Server cost is flat and near-zero regardless of user count. The project can't
  be bankrupted by growth.
- Privacy is structural, not a promise in a policy — media has nowhere to go.
- No quotas, no per-minute billing, no upload wait. This is our actual wedge
  against Submagic and VEED, and it follows from the constraint rather than
  fighting it.
- Renders use the user's GPU, which is usually faster than a shared vCPU slice.

**Bad, and accepted:**

- Performance varies with the user's hardware. A weak laptop is a slow
  experience, and we cannot fix that server-side.
- No browser-based editing. `apps/web` markets the product; it does not run it.
- We must ship platform-specific binaries (FFmpeg, Whisper models) per OS, which
  makes packaging and the download size materially harder than a web app.
- No mobile path without a real rethink.

## Alternatives rejected

- **Cloud rendering on the KVM 2** — does not fit; fails at ~1 concurrent user.
- **Cloud rendering on rented GPUs** — unfunded, and cost scales with success.
- **Hybrid: local by default, cloud for heavy jobs** — doubles the surface area
  (two pipelines, two auth paths, two failure modes) for a tier we can't pay for.
  Revisit only with funding and a superseding ADR.
