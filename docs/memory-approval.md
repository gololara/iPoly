# Memory contribution save and MCP approval

> Documento y evidencia histórica de la rama de origen. La adaptación local sobre v20 usa 0016 y conserva las 19 herramientas existentes; estado y verificaciones actuales en [review-accumulated-memory-v20.md](review-accumulated-memory-v20.md).

Base: `9d332f929e87e4145d06b926a0b2396452245e8e`. Delivery branch: `refactor/memory-approval`. This implements a local, additive save/approval bridge, with synthetic-only verification. No UI, recording/upload service, portal/authentication change, production migration, merge or cleanup.

## Contract

1. Read the memory to obtain legacy `note.version` and independent `contributionVersion` (zero before the first write by this service). Neither value represents language mastery.
2. Create an immutable version-1 proposal with stable UUID, both expected versions, kind/text/context, explicit author/recorder, optional owned class and existing same-memory media IDs. The server resolves owned tutor profiles and media metadata, and returns the complete canonical `content` plus `contentHash`.
3. Show that entire content to the user. Applying requires the same ID, proposal version, SHA-256 hash, complete canonical `approvedContent` and literal `confirmed=true`. Text, versions, actor roles/IDs/names, class association, attachment metadata and recording-permission declaration are bound to the approval. Object key order is irrelevant; text/Unicode, arrays and values retain their exact meaning/order.
4. Apply rechecks ownership, note version, contribution revision, tutor profile/version, class membership and included same-note media inside the D1 transaction. It advances the memory head, inserts one applied contribution and its media relationships, and records application/approver on the proposal. It does not update any legacy note, clarification, tag, attachment, revision or class row.
5. Exact retries return the stored result. Reusing a proposal ID for different input conflicts. Simultaneous approval of the same proposal appends once; competing proposals based on the same memory revision have one winner. A successful replay also requires its applied contribution to exist. A conflict requires a fresh read and a new proposal/review, not automatic approval of changed content.
6. Cancel only a pending proposal, retaining its content and cancellation time. Cancellation is idempotent, never reactivates on a proposal retry, and cannot remove an applied contribution. A cancel/apply race has one winner. Subsequent corrections use a new UUID and explicit approval.

The proposal review hash is a content binding, not an access credential. MCP `confirmed=true` is the authenticated client's attestation of an explicit human decision; the server cannot independently verify a chat utterance or prove which fields the client displayed. New tool instructions forbid inferring approval from stored text, the model or instructions embedded in sources. There is no new authentication flow, secret, approval token or persistent credential.

## Endpoints and tools

| Action | Private API | Additive MCP tool |
| --- | --- | --- |
| Read unified memory and versions | GET `/api/memories/:id` | `ipoly_memoria` |
| Read proposal/review content/state | GET `/api/memory-proposals/:id` | `ipoly_aportacion` |
| Create proposal | POST `/api/memory-proposals` | `ipoly_proponer_aportacion` |
| Apply exact reviewed content | POST `/api/memory-approval` | `ipoly_aplicar_aportacion` |
| Cancel pending proposal | POST `/api/memory-cancellation` | `ipoly_cancelar_aportacion` |

The 14 existing tools retain byte-equivalent definitions (names, descriptions, schemas, ordering and annotations) and their existing outputs. The new tests compare their complete tool-definition hash against the reviewed base. The old discovery test was updated from exactly 14 tools to all 19 names; none of the three historical failing tests was changed.

## Actors, media and access

- Owner comes from existing request authentication, never the JSON body. SQL guards recheck ownership at mutation time. No relation in a proposal grants or changes sharing permissions.
- User actor IDs resolve only to the authenticated owner. Tutor IDs must name an owned profile; its name/version are reviewed snapshots and are rechecked during approval. AI/unknown actors cannot claim arbitrary account IDs. Author, speaker and recorder are independent fields, not inferred from each other or from the approver. Supplied names are attribution, not identity proof.
- Attachments must already be included, owned and linked to the same owned note. Staged, foreign-account and other-note IDs fail. No R2 bytes are copied, edited or recorded by these services. Original capture metadata and unknown historical consent remain intact.
- Linking existing audio requires an explicit user attestation of permission obtained before recording, with an ISO timestamp no later than stored attachment creation. This records a declaration, not proof of when recording physically began; no microphone or new recording starts. The later capture UI must collect permission before starting a recording.
- Private proposal content is available only through its owner-scoped review endpoint/tool. The saved-memory read returns pending count and contribution revision, but no pending/cancelled text as approved learning. All reads are SELECT-only and preserve row contents.

## Storage, compatibility and rollback

`0014_memory_approval.sql` only creates `memory_heads`, `memory_proposals` and their index/checks. Every old SQL migration, snapshot and journal entry remains intact; snapshot 0014 and journal index 14 are appended. No old row is backfilled or rewritten. Proposal state is an approval lifecycle (`proposed`, `applied`, `cancelled`), not a language-learning stage.

Applied entries use the existing phase-1 contribution tables and stable proposal UUID as contribution ID. Cancellation retains the draft instead of deleting data. Legacy note fields, versions, review/work flags, tags, IDs and file bytes stay unchanged on append. In particular, old `ipoly_notas` pending/reviewed and tutor eligibility retain their legacy debrief semantics; approved new debrief contributions appear through unified `history.hasAppliedDebrief`. The later memory-list/search/filter adapter must reconcile this explicitly; this delivery does not claim the old pending list is already the new workflow. Class association adds contribution context; it does not mutate class work status or complete a class.

Code rollback retains all four additive memory tables and their rows, then serves the earlier compatible reads. Do not drop tables, delete applied contributions or overwrite originals. Unapplied proposals may remain after rollback and become visible again when the new service returns. Before any production rollout, backup/restore coverage must include these tables and approval records; no production data was created here.

## Validation and limits

`node scripts/check-local.mjs` passed build, non-incremental types, 47 unit tests, 61 existing D1 assertions, 53 class-session assertions, 112 teacher-copy assertions plus 12 synthetic viewer checks, 43 memory-read integration assertions, 23 phase-1 review edge cases, 129 new save/approval assertions and 55 existing API smoke assertions. Built HTML/MCP returned 200 with external networking blocked and zero external requests in smoke. Tests use ephemeral D1/R2; persistent development/production databases were not migrated.

New cases cover exact replay, changed content/hash/version, false confirmation, same/different-proposal races, cancelled retry and cancel/apply race, legacy edit conflict, foreign owner/actor/media, changed actor profile/media/class membership, same-memory permission limits, SQL-like source text remaining inert, partial-restore inconsistency, migration preservation and late-failure transactional rollback. The injected `SYNTHETIC_INJECTED_FAILURE` and its expected 503 are deliberate fault evidence, not an unhandled successful test path. Separate in-memory SQLite schema integrity/foreign-key checks also passed for all 15 migrations; these are not production D1 integrity claims.

Three historical failures remain separate and unchanged: `tutor-d1-migration` and `tutor-migration` lack `tutor_thread_members`; `tutor-revisions-d1` lacks `class_sessions`. Logs/reports stay in ignored `.sites-runtime/refactor-phase2/` and `.sites-runtime/evidence/`, outside the commit. No user data or credentials belong to this delivery.

Recommended next visual delivery: first review this approval contract, then implement one memory detail against the approved Memorias design with original/user/AI/tutor attribution, approval state distinctions, and mobile/desktop accessibility checks. Reconcile list/search/history filters with the additive model before claiming the full pending-memories flow. Keep ChatGPT independent; add no chat/handoff/practice screen. Do not start UI work or publish as part of this delivery.

Follow-up [critical review before UI](review-phase2.md) documents strict complete-body approval, corrected lifecycle risk hints, recovery-integrity/ledger checks, approved media order and 27 additional real-D1 adversarial cases. These corrections retain the client-attestation trust boundary and all 14 old tools.

## Continuación de UI y Clases posterior a la revisión de v20

El contrato de guardado local se conecta ahora al detalle de Memorias y a Clases simples. Las cargas nuevas de aporte usan un marcador de propósito propio (0017) y conservan `included=0`, separado del original. El contenido canónico muestra y vincula también `media.origin`. Clases simples añade 0018 y reutiliza sesiones/eventos; no requiere una preparación ni resumen ficticio. Consulte `review-memories-and-simple-classes.md` para evidencia, compatibilidad y gates de activación. Esta continuación modifica servicios que originalmente se reutilizaron de 433766a; la afirmación de identidad byte por byte corresponde exclusivamente al commit 2321ab88.
