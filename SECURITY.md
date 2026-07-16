# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately via GitHub's [Security Advisories](../../security/advisories/new).
Expect an acknowledgement within 72 hours and an assessment within 7 days.

Please include what you can: affected version and OS, reproduction steps, impact,
and any suggested fix. If you have a proof of concept, share it privately rather
than publishing it.

We will credit you in the advisory unless you'd rather stay anonymous.

## Threat model

VideoDip is an offline-first desktop application. Its security posture follows
from that, and it differs from a web app in ways worth being explicit about.

**What we protect:**

- **User media never leaves the machine.** Not a policy promise — a structural
  fact of the architecture (see [ADR-0002](./docs/adr/0002-local-compute-thin-server.md)).
  Any code path that uploads user media is a vulnerability, not a feature.
- **The update signing key.** The single highest-value secret in the project.
  Whoever holds it can ship a malicious update to every install. It lives in CI
  secrets, never in the repo, never on a developer machine.
- **The plugin boundary.** Plugins get the capabilities they declare and nothing
  ambient.

**What is explicitly not a vulnerability:**

- Reading VideoDip's own local files as the user who owns them. The user
  controls the machine. There is no local privilege boundary to cross.
- Absence of authentication in the editor. Working with no account is the point.

## Handling secrets in this repository

This repository is public. Assume every push is indexed within minutes and that
deletion does not undo exposure.

- Real values go in `.env` (gitignored) or a secret manager. `.env.example`
  holds placeholders only.
- `git rm --cached` does **not** remove a secret from history. A committed
  secret is a leaked secret: rotate it first, then clean history.
- `NEXT_PUBLIC_*` is inlined into the client bundle and is public by definition.
  Never put a secret behind that prefix.
- Automated secret scanning runs on every push and pull request.

## If you leak a secret

1. **Rotate it immediately.** Before anything else, and before cleaning history.
   Assume it is already compromised.
2. Remove it from history (`git filter-repo`) and force-push.
3. Notify a maintainer privately.

Order matters. Cleaning history first only buys the attacker time.

## Supported versions

VideoDip is pre-1.0. Only the latest `main` receives security fixes.
