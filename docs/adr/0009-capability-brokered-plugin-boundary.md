# ADR-0009: Capability-brokered plugin boundary

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

VideoDip treats templates, transitions, effects, fonts, AI providers, and
export presets as third-party extensions. The constitution requires plugins to
be sandboxed and to receive only declared capabilities. A TypeScript interface
alone cannot provide that isolation: loading plugin JavaScript in the editor's
main realm would give it the same browser globals and application authority as
core code.

The SDK is also a public semver contract. Binding it to React, Tauri, Node, or
today's desktop file paths would either fork plugins by host or make those
implementation details permanent public API.

## Decision

The v1 plugin edge is a JSON-only, capability-brokered message protocol.

- A strict manifest declares an API major, namespaced id, semantic version,
  relative package entrypoint, extension surfaces, and requested capabilities.
- Installation grants are a subset of declared capabilities. Every operation
  request repeats its capability and the host broker authorizes it against the
  immutable grant before dispatch.
- Plugin lifecycle code receives only `PluginContext`: its validated manifest,
  granted capabilities, cancellation signal, and a brokered request function.
  It receives no editor store, filesystem object, process handle, network
  client, React tree, or Tauri API.
- Messages and payloads are validated at both ends and restricted to JSON so
  the same contract works through `MessagePort`, IPC, or a future isolated
  process.
- Plugin code must not execute in the main editor JavaScript realm. The runtime
  will use an isolated host with ambient network/storage denied and communicate
  only through the broker. Exact browser/desktop hardening, time limits, crash
  recovery, signatures, and native plugin policy must be completed and audited
  before third-party execution is enabled.

`packages/plugin-sdk` defines the contract and authorization primitives; it is
not itself a sandbox and must never be described as one.

## Consequences

**Good:** one plugin contract spans desktop and browser; permission review is
explicit; operations are testable without a host; arbitrary plugin code cannot
be coupled to internal editor state through the SDK.

**Accepted cost:** every plugin operation crosses an asynchronous broker and
needs a public operation schema. High-frequency rendering effects will require
purpose-built declarative payloads or a separately audited compute runtime,
not callbacks smuggled through the message edge.

**Still incomplete:** no third-party plugin is executed yet. Registry,
installer/signature verification, sandbox runtime, quotas/timeouts, manager UI,
and concrete extension descriptors remain Phase 5 work.
