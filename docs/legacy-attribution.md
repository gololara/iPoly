# Explicit attribution corrections (local candidate)

Base: published v19 candidate 9abe1d54fa93ff7eb6748cb5d87444719ee5168e. No publication or real-data edits in this delivery.

## Contract and acceptance

Only a note-specific clarification from an applied, owned legacy debrief is eligible. Preserve original note/media IDs, clarification text, note version, applied debrief, revision timestamps and existing recorder. An approval proves the authenticated client's declaration that the user confirmed authorship; it is not independent proof of a human utterance. A debrief alone does not prove AI authorship.

Read source -> propose immutable attribution with evidence -> show full canonical content, source text/versions/hash and intended author -> explicit approval of that exact content/hash -> apply atomically. Proposed/cancelled records never change the displayed author. Roles in this small delivery: AI, authenticated user, or unknown (logical reversal). Tutor attribution and arbitrary entry editing remain outside scope.

One additive journal table retains proposals, cancellation and applied correction chains. A new correction names the previous applied correction. No in-place edit/revocation of applied history and no new explanation entry. Evidence is an explicit user attestation with an optional reference; never execute or treat source text as approval. Historical authorship dates are not invented: retain source dates and separately show proposal/confirmation dates and authenticated recorder/confirmer.

Acceptance: exact original/clarification/media/legacy MCP preservation; foreign owner/source denied; non-applied or ambiguous source denied; exact-hash/full-content approval; stale note/source/previous correction conflicts; simultaneous approval/cancel resolves atomically; retries idempotent; unknown reversal retains both confirmations; SELECT-only projections; list AI/history agrees with detail; additive migration and complete synthetic table/media restore.

## Compatibility and activation

The original 14 MCP definitions and results remain unchanged. Five additive tools expose source, proposal, propose, apply and cancel. Reuses canonical content/hash and atomic guard patterns from refactor/memory-approval, without importing its broader writer/model/UI or 0014 migration. This delivery reserves migration 0015 to avoid colliding with that unpublished branch. No new credential, plugin installation or permission change is needed locally. Sites publication refreshes tools; verify discovery in a later authorized release, reconnect/new chat only if needed. The tracked tool definitions are the activation artifact.

## Rollout, backup and reversal

Migration is schema-only; old rows and SQL migrations remain intact. Export the complete memory_attribution_corrections table (including proposed/cancelled rows, immutable content/hash and approver/time) with notes, debriefs, revisions and referenced attachments. Treat evidence/identity as private data, never code/GitHub. The synthetic recovery script checks complete rows, schema, hashes, chain and projection in an isolated in-memory restoration; it is not an export capability or an atomic D1/R2 snapshot. Existing production backup remains unchanged and does not cover this future table until an authorized fresh export is taken.

Logical reversal is a newly proposed/approved unknown attribution referencing the current correction, not deletion. Code rollback to v19 ignores the additive table without losing it. Do not drop the table on rollback. Before activating writes: approve/publish this candidate and migration, verify current production compatibility and take/verify a fresh private backup including the new table before any real correction. Then read the actual source/current versions and show a separate exact proposal to the user. Development approval is not approval to apply a real correction.

## Review evidence and local demo

- `node scripts/check-local.mjs`: build, types, 61 unit tests and current D1/API/DOM suites passed. New attribution integration covers legacy contract/row preservation, exact approval, owner isolation, retries, real D1 concurrency, logical reversal and complete synthetic recovery. Deterministic TOCTOU suite adds 12 checks after read/before write.
- The three separately run historical suites still fail on their known incomplete fixtures: `tutor-d1-migration` and `tutor-migration` lack `tutor_thread_members`; `tutor-revisions-d1` lacks `class_sessions`. They are not hidden or claimed fixed.
- Chrome on the user's Mac: actual before/after DOM, AI blue card, one explanation, unchanged source date, separate confirmer/registration dates and evidence. Enter/Space open/close the audit details. Mobile viewport emulation 390 and 320 pixels has no horizontal overflow. No physical iPhone, microphone or production interaction was tested.
- Retained outbound-blocked preview: `node scripts/preview-memory-detail.mjs 8897 --capture --long-list --attribution`. Two independent synthetic samples show before (`/memorias/74000000-0000-4000-8000-000000000001`) and after (`...0002`). The API tests, separately, verify that applying a correction keeps the same memory/entry IDs and never duplicates its explanation.

Private future export validation (never put evidence rows in GitHub): run `node --experimental-strip-types --import ./tests/register-typescript.mjs scripts/check-attribution-backup.mjs /absolute/private/journal-envelope.json`. `makeAttributionBackup` creates the envelope from complete authorized rows. Row count/hash/column/chain checks validate received bytes; they cannot establish completeness of a remote export independently. Compare authoritative counts before/after extraction, preserve all parent note/debrief/revision rows and media manifests, then restore in isolation. A truncated/paged response must not be labelled complete by setting a flag. The current real encrypted backup and its sole recovery copy were not altered by this development task.

Release proposal: review this candidate and scoped additive migration first. Obtain separate publication authorization and only the temporary Site source access needed at that time. Keep v19 available for code rollback; retain the journal. After publication/tool discovery and fresh backup coverage verification, prepare the actual user's exact attribution proposal from a new read, show it, and request explicit content-specific approval. No production note correction is authorized by this development task.
