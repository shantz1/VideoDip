# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

VideoDip is intended to be a long-lived, open-source, plugin-extensible project
worked on by both humans and coding agents, often months apart. The expensive
failure mode is not writing wrong code — it is re-litigating settled decisions,
or silently violating one because nobody wrote down why it existed.

`CLAUDE.md` captures the standing rules. It does not capture _why_ those rules
exist, and a rule without a rationale gets discarded by the first contributor it
inconveniences.

## Decision

Record every architecturally significant decision as a numbered ADR in
`docs/adr/`, in the format of this file: Context, Decision, Consequences.

A decision is architecturally significant if reversing it would touch multiple
packages, change a public contract, alter the offline-first guarantee, or
contradict a non-goal in `CLAUDE.md`.

ADRs are immutable once accepted. To change a decision, write a new ADR that
supersedes the old one and mark the old one `Superseded by ADR-XXXX`.

## Consequences

- Decisions carry their rationale forward to contributors who weren't there.
- `CLAUDE.md` stays short and prescriptive; ADRs hold the argument.
- Small overhead per significant decision. Deliberate — it should cost a little
  to change architecture.
