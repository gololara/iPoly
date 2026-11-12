// lib/attribution-contract.ts
import { z } from "zod";
var id = z.string().uuid();
var version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
var hash = z.string().regex(/^[a-f0-9]{64}$/);
var name = z.string().trim().min(1).max(120).nullable();
var attributionAuthorSchema = z.object({ role: z.enum(["ai", "user", "unknown"]), id: z.string().min(1).max(250).nullable(), name }).strict();
var attributionEvidenceSchema = z.object({ kind: z.literal("user_attestation"), statement: z.string().trim().min(1).max(2e3), reference: z.string().trim().min(1).max(500).nullable() }).strict();
var attributionSourceSchema = z.object({ noteId: id, debriefId: id, noteVersion: version, text: z.string().max(3e4), debriefCreatedAt: z.string().datetime({ offset: true }), debriefAppliedAt: z.string().datetime({ offset: true }) }).strict();
var attributionContentSchema = z.object({ source: attributionSourceSchema, sourceContentHash: hash, expectedNoteVersion: version, previousCorrectionId: id.nullable(), author: attributionAuthorSchema, evidence: attributionEvidenceSchema }).strict();
var proposeAttributionSchema = z.object({ id, noteId: id, debriefId: id, expectedNoteVersion: version, previousCorrectionId: id.nullable(), author: attributionAuthorSchema, evidence: attributionEvidenceSchema }).strict();
var attributionDecisionSchema = z.object({ id, proposalVersion: z.literal(1), contentHash: hash, confirmed: z.literal(true) }).strict();
var applyAttributionSchema = attributionDecisionSchema.extend({ approvedContent: attributionContentSchema }).strict();
function canonicalAttribution(v) {
  if (Array.isArray(v)) return "[" + v.map(canonicalAttribution).join(",") + "]";
  if (v !== null && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonicalAttribution(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
async function attributionHash(v) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalAttribution(v)))), (b) => b.toString(16).padStart(2, "0")).join("");
}
var attributionProposalHash = (id2, content) => attributionHash({ id: id2, proposalVersion: 1, content });
async function parseAttributionRow(r) {
  const c = attributionContentSchema.parse(JSON.parse(r.content));
  if (canonicalAttribution(c) !== r.content || c.source.noteId !== r.note_id || c.source.debriefId !== r.debrief_id || c.previousCorrectionId !== r.previous_id || await attributionHash(c.source) !== c.sourceContentHash || await attributionProposalHash(r.id, c) !== r.content_hash) throw Error("Invalid attribution journal");
  if (c.author.role === "user" ? c.author.id !== r.owner : c.author.id !== null) throw Error("Invalid attribution actor");
  if (c.author.role === "unknown" && c.author.name !== null) throw Error("Unknown attribution cannot claim a name");
  if (!Number.isFinite(Date.parse(r.created_at)) || r.state === "applied" && (!r.applied_at || !Number.isFinite(Date.parse(r.applied_at)) || r.approved_by !== r.owner)) throw Error("Invalid attribution approval");
  return c;
}

// lib/attribution-projection.ts
async function projectAttributions(entries, rows, sources, noteId, owner) {
  const groups2 = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.owner !== owner || r.note_id !== noteId || r.state !== "applied" || r.approved_by !== owner) throw Error("Invalid attribution scope");
    const group = groups2.get(r.debrief_id) ?? [];
    group.push(r);
    groups2.set(r.debrief_id, group);
  }
  for (const [debriefId, group] of groups2) {
    const d = sources.find((d2) => d2.id === debriefId), matches = entries.filter((e2) => e2.source.debriefId === debriefId);
    if (!d || !d.applied_at || matches.length !== 1) throw Error("Invalid attribution source");
    const e = matches[0], expectedHash = await attributionHash({ noteId, debriefId, noteVersion: d.expected_version + 1, text: d.clarified, debriefCreatedAt: d.created_at, debriefAppliedAt: d.applied_at });
    const chain = new Map(group.map((r) => [r.previous_id, r]));
    if (chain.size !== group.length) throw Error("Ambiguous attribution chain");
    let current = null;
    const history = [];
    while (chain.has(current)) {
      const r = chain.get(current);
      chain.delete(current);
      const c = await parseAttributionRow(r);
      if (c.sourceContentHash !== expectedHash || e.text !== c.source.text || e.source.noteVersion !== c.source.noteVersion) throw Error("Changed attribution source");
      history.push({ id: r.id, author: c.author, proposedBy: { role: "user", id: r.owner, name: null }, confirmedBy: { role: "user", id: r.approved_by, name: null }, proposedAt: r.created_at, confirmedAt: r.applied_at, evidence: c.evidence, sourceContentHash: c.sourceContentHash });
      current = r.id;
    }
    if (chain.size || !history.length) throw Error("Broken attribution chain");
    e.attribution = { originalAuthor: e.author, currentId: current, history };
    e.author = history.at(-1).author;
  }
}

// lib/memory-source-sql.ts
function ownedMemoryClassSql(classId, owner) {
  return `(EXISTS(SELECT 1 FROM tutor_threads t WHERE t.id=${classId} AND t.owner=${owner}) OR EXISTS(SELECT 1 FROM tutor_records p WHERE p.id=${classId} AND p.owner=${owner} AND p.kind='preparation' AND p.state='applied'))`;
}
var memoryListSourcesSql = `
 SELECT n.id note_id,CAST(part.value AS text) text,0 debrief,0 class_work,NULL role,NULL happened_at
 FROM base n,json_each(json_array(n.original,n.clarified,n.title)) part
 UNION ALL
 SELECT n.id,t.name,0,0,NULL,NULL FROM base n JOIN note_tags nt ON nt.note_id=n.id JOIN tags t ON t.id=nt.tag_id AND t.owner=n.owner
 UNION ALL
 SELECT n.id,COALESCE(json_extract(r.content,'$.after.clarified'),'')||' '||COALESCE(json_extract(r.content,'$.after.title'),''),0,0,NULL,r.created_at
 FROM base n JOIN revisions r ON r.note_id=n.id AND r.owner=n.owner
 WHERE json_valid(r.content) AND json_extract(r.content,'$.after.noteId')=n.id AND json_type(r.content,'$.after.clarified')='text'
 UNION ALL
 SELECT n.id,COALESCE(json_extract(change.value,'$.clarified'),'')||' '||COALESCE(json_extract(change.value,'$.title'),''),1,0,NULL,COALESCE(d.applied_at,d.created_at)
 FROM base n JOIN debriefs d ON d.owner=n.owner AND d.state='applied',json_each(d.changes) change WHERE json_extract(change.value,'$.noteId')=n.id
 UNION ALL
 SELECT n.id,COALESCE(json_extract(change.value,'$.clarified'),'')||' '||COALESCE(json_extract(change.value,'$.title'),''),0,1,NULL,COALESCE(t.applied_at,t.created_at)
 FROM base n JOIN tutor_records t ON t.owner=n.owner AND t.kind='closing' AND t.state='applied',json_each(t.data,'$.changes') change WHERE json_extract(change.value,'$.noteId')=n.id
 UNION ALL
 SELECT n.id,COALESCE(json_extract(e.value,'$.text'),'')||' '||COALESCE(json_extract(e.value,'$.examples'),'')||' '||COALESCE(json_extract(e.value,'$.questions'),'')||' '||COALESCE(json_extract(e.value,'$.attribution'),''),0,1,NULL,json_extract(e.value,'$.createdAt')
 FROM base n JOIN class_sessions s ON s.owner=n.owner,json_each(s.data,'$.notes."'||n.id||'".entries') e
 WHERE ${ownedMemoryClassSql("s.class_id", "n.owner")} AND json_type(e.value,'$.id')='text' AND json_type(e.value,'$.text')='text' AND json_type(e.value,'$.createdAt')='text'
 UNION ALL
 SELECT n.id,c.text||' '||c.context||' '||COALESCE(c.author_name,'')||' '||COALESCE(c.recorder_name,''),CASE WHEN c.kind='debrief' THEN 1 ELSE 0 END,CASE WHEN ${ownedMemoryClassSql("c.class_id", "n.owner")} THEN 1 ELSE 0 END,c.author_role,COALESCE(c.applied_at,c.created_at)
 FROM base n JOIN memory_contributions c ON c.note_id=n.id AND c.owner=n.owner AND c.state='applied' AND c.approved_by=n.owner
 UNION ALL
 SELECT n.id,COALESCE(json_extract(a.content,'$.author.name'),''),0,0,json_extract(a.content,'$.author.role'),a.applied_at
 FROM base n JOIN memory_attribution_corrections a ON a.note_id=n.id AND a.owner=n.owner AND a.state='applied' AND a.approved_by=n.owner
 JOIN debriefs d ON d.id=a.debrief_id AND d.owner=n.owner AND d.state='applied',json_each(d.changes) change
 WHERE json_extract(change.value,'$.noteId')=n.id AND json_extract(change.value,'$.clarified')=json_extract(a.content,'$.source.text') AND json_extract(change.value,'$.expectedVersion')+1=json_extract(a.content,'$.source.noteVersion') AND d.created_at=json_extract(a.content,'$.source.debriefCreatedAt') AND d.applied_at=json_extract(a.content,'$.source.debriefAppliedAt')
 AND NOT EXISTS(SELECT 1 FROM memory_attribution_corrections child WHERE child.previous_id=a.id AND child.owner=n.owner AND child.note_id=n.id AND child.debrief_id=a.debrief_id AND child.state='applied' AND child.approved_by=n.owner)
`;
var sourceArms = memoryListSourcesSql.split("\n UNION ALL\n");
var groups = Array.from({ length: Math.ceil(sourceArms.length / 3) }, (_, i) => `memory_sources_${i} AS MATERIALIZED (${sourceArms.slice(i * 3, i * 3 + 3).join(" UNION ALL ")})`);
var memoryListSourceCTEs = groups.join(",") + `,sources AS MATERIALIZED (${groups.map((_, i) => `SELECT * FROM memory_sources_${i}`).join(" UNION ALL ")})`;

// lib/review-sql.ts
function appliedDebriefSql(noteId, owner, maxVersion) {
  return `EXISTS(SELECT 1 FROM debriefs d, json_each(d.changes) change WHERE d.owner=${owner} AND d.state='applied' AND json_extract(change.value,'$.noteId')=${noteId}${maxVersion ? ` AND json_extract(change.value,'$.expectedVersion')+1<=${maxVersion}` : ""})`;
}

// lib/data.ts
import { env } from "cloudflare:workers";
import { z as z2 } from "zod";

// lib/audio.ts
var AUDIO_MAX_BYTES = 2 * 1024 * 1024;

// lib/data.ts
var ApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var uuid = z2.string().uuid();
var tagName = z2.string().trim().min(1).max(40).transform((s) => s.replace(/\s+/g, " "));
var tagNames = z2.array(tagName).max(12);
var createSchema = z2.object({ id: uuid, language: z2.enum(["sq", "en"]), original: z2.string().max(2e4).default(""), tags: tagNames.default([]), attachmentIds: z2.array(uuid).max(5).default([]) }).strict();
var changeSchema = z2.object({ noteId: uuid, expectedVersion: z2.number().int().positive(), clarified: z2.string().max(3e4), title: z2.string().trim().max(160).optional(), tags: tagNames });
var proposalSchema = z2.object({ id: uuid, summary: z2.string().trim().min(1).max(12e3), changes: z2.array(changeSchema).min(1).max(30) }).strict();
function database() {
  if (!env.DB) throw new ApiError(503, "No pudimos abrir tu memoria. Int\xE9ntalo de nuevo.");
  return env.DB;
}
async function hydrate(owner, rows) {
  const db = database();
  return Promise.all(rows.map(async (n) => {
    const tags = (await db.prepare("SELECT t.id,t.name,t.normalized FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=? AND t.owner=? ORDER BY t.name").bind(n.id, owner).all()).results;
    const attachments = (await db.prepare("SELECT id,mime,size,origin,duration_ms FROM attachments WHERE note_id=? AND owner=? AND included=1 ORDER BY created_at").bind(n.id, owner).all()).results.map((a) => ({ ...a, url: "/api/files/" + a.id }));
    return { ...n, tags, attachments };
  }));
}
var reviewedSql = appliedDebriefSql("n.id", "n.owner");
async function getNote(owner, id2) {
  uuid.parse(id2);
  const row = await database().prepare("SELECT n.id,n.language,n.original,n.clarified,n.title,n.created_at,n.updated_at,n.version,n.worked," + reviewedSql + " AS reviewed FROM notes n WHERE n.id=? AND n.owner=?").bind(id2, owner).first();
  if (!row) throw new ApiError(404, "No encontramos esa nota.");
  return (await hydrate(owner, [row]))[0];
}

// lib/v20-memory-read.ts
var unknown = () => ({ role: "unknown", id: null, name: null });
var recorder = (id2, name2 = null) => ({ role: "user", id: id2, name: name2 });
var actor = (role, id2, name2) => role !== null || id2 !== null || name2 !== null ? { role: role ?? "unknown", id: id2, name: name2 } : null;
var legacyMedia = (a) => ({ ...a, speaker: null, recordedBy: null, consentRecordedAt: null });
var conflict = () => new ApiError(409, "Memory history could not be reconstructed safely.");
function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw conflict();
  return value;
}
function parse(value) {
  try {
    return object(JSON.parse(value));
  } catch {
    throw conflict();
  }
}
function instant(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw conflict();
  return time;
}
var ownedClass = (column) => ownedMemoryClassSql(column, "?");
async function readMemory(owner, id2) {
  uuid.parse(id2);
  const note = await getNote(owner, id2), db = database(), entries = [], classContexts = [];
  const results = await db.batch([
    db.prepare(`SELECT n.version,${appliedDebriefSql("n.id", "n.owner")} reviewed FROM notes n WHERE n.id=? AND n.owner=?`).bind(id2, owner),
    db.prepare(`SELECT d.id,d.created_at,d.applied_at,json_extract(c.value,'$.clarified') clarified,json_extract(c.value,'$.title') title,json_extract(c.value,'$.expectedVersion') expected_version FROM debriefs d,json_each(d.changes) c WHERE d.owner=? AND d.state='applied' AND json_extract(c.value,'$.noteId')=?`).bind(owner, id2),
    db.prepare(`SELECT t.id,t.created_at,t.applied_at,p.id preparation_id,COALESCE(th.id,p.id) class_id,c.key IS NOT NULL has_change,json_extract(c.value,'$.clarified') clarified,json_extract(c.value,'$.title') title,json_extract(c.value,'$.expectedVersion') expected_version,
   CASE WHEN EXISTS(SELECT 1 FROM json_each(t.data,'$.references') r WHERE json_extract(r.value,'$.noteId')=?) OR EXISTS(SELECT 1 FROM json_each(t.data,'$.sourceNoteIds') r WHERE r.value=?) THEN 'source' ELSE 'preparation_reference' END relation
   FROM tutor_records t
   LEFT JOIN tutor_records p ON p.id=t.parent_id AND p.owner=t.owner AND p.kind='preparation' AND p.state='applied'
   LEFT JOIN tutor_thread_members m ON m.preparation_id=p.id AND m.owner=p.owner
   LEFT JOIN tutor_threads th ON th.id=m.thread_id AND th.owner=p.owner
   LEFT JOIN json_each(t.data,'$.changes') c ON json_extract(c.value,'$.noteId')=?
   WHERE t.owner=? AND t.kind='closing' AND t.state='applied' AND (c.key IS NOT NULL
    OR EXISTS(SELECT 1 FROM json_each(t.data,'$.references') r WHERE json_extract(r.value,'$.noteId')=?)
    OR EXISTS(SELECT 1 FROM json_each(t.data,'$.sourceNoteIds') r WHERE r.value=?)
    OR EXISTS(SELECT 1 FROM json_each(p.data,'$.references') r WHERE json_extract(r.value,'$.noteId')=?)) ORDER BY t.created_at,t.id`).bind(id2, id2, id2, owner, id2, id2, id2),
    db.prepare("SELECT id,version,content,created_at FROM revisions WHERE owner=? AND note_id=? ORDER BY version,id").bind(owner, id2),
    db.prepare(`SELECT s.class_id,s.data FROM class_sessions s WHERE s.owner=? AND json_type(s.data,?)='object' AND (${ownedClass("s.class_id")}) ORDER BY s.class_id`).bind(owner, '$.notes."' + id2 + '"', owner, owner),
    db.prepare(`SELECT i.entry_id,i.class_id,i.closing_id FROM class_session_integrations i JOIN tutor_records t ON t.id=i.closing_id AND t.owner=i.owner AND t.kind='closing' AND t.state='applied' WHERE i.owner=? AND i.note_id=?`).bind(owner, id2),
    db.prepare(`SELECT c.id,c.kind,c.text,c.context,c.author_role,c.author_id,c.author_name,c.recorder_role,c.recorded_by,c.recorder_name,c.created_at,c.applied_at,CASE WHEN ${ownedClass("c.class_id")} THEN c.class_id ELSE NULL END class_id FROM memory_contributions c WHERE c.owner=? AND c.note_id=? AND c.state='applied' AND c.approved_by=? ORDER BY c.created_at,c.id`).bind(owner, owner, owner, id2, owner),
    db.prepare(`SELECT m.contribution_id,a.id,a.mime,a.size,a.origin,a.duration_ms,m.speaker_role,m.speaker_id,m.speaker_name,m.recorder_role,m.recorded_by,m.recorder_name,m.consent_at FROM memory_contribution_attachments m JOIN memory_contributions c ON c.id=m.contribution_id JOIN attachments a ON a.id=m.attachment_id JOIN notes n ON n.id=a.note_id WHERE c.owner=? AND c.note_id=? AND c.state='applied' AND c.approved_by=? AND a.owner=? AND n.owner=? AND a.note_id=? AND a.included=1 ORDER BY a.created_at,a.id`).bind(owner, id2, owner, owner, owner, id2),
    db.prepare("SELECT count(*) total FROM memory_contributions WHERE owner=? AND note_id=? AND state='proposed'").bind(owner, id2),
    db.prepare("SELECT a.* FROM memory_attribution_corrections a JOIN notes n ON n.id=a.note_id AND n.owner=a.owner WHERE a.owner=? AND a.note_id=? AND a.state='applied' AND a.approved_by=?").bind(owner, id2, owner)
  ]);
  const rows = (index) => results[index].results;
  const guard = rows(0)[0];
  if (!guard || guard.version !== note.version || guard.reviewed !== note.reviewed) throw new ApiError(409, "Memory changed while it was read. Retrieve it again.");
  const debriefs = rows(1), closings = rows(2), revisions = rows(3), contributions = rows(6);
  const uniqueSources = (sources) => {
    const ids = /* @__PURE__ */ new Set();
    for (const s of sources) {
      if (ids.has(s.id)) throw conflict();
      ids.add(s.id);
    }
  };
  uniqueSources(debriefs);
  uniqueSources(closings);
  const closingChanges = closings.filter((c) => c.has_change === 1), representedDebriefs = /* @__PURE__ */ new Set(), representedClosings = /* @__PURE__ */ new Set();
  const sessions = rows(4).map((s) => {
    const notes = object(parse(s.data).notes), work = object(notes[id2]);
    if (!Array.isArray(work.entries)) throw conflict();
    const workEntries = work.entries.map((raw) => {
      const e = object(raw);
      if (typeof e.id !== "string" || typeof e.text !== "string" || typeof e.createdAt !== "string") throw conflict();
      return { ...e, id: e.id, text: e.text, createdAt: e.createdAt };
    });
    return { classId: s.class_id, entries: workEntries };
  });
  const sessionEntryIds = new Set(sessions.flatMap((s) => s.entries.map((e) => "class:" + s.classId + ":" + e.id)));
  const integrations = rows(5).filter((i) => sessionEntryIds.has("class:" + i.class_id + ":" + i.entry_id) && closingChanges.some((c) => c.id === i.closing_id && c.class_id === i.class_id));
  entries.push({ id: "capture:" + id2, kind: "capture", text: note.original, context: "", createdAt: note.created_at, appliedAt: null, author: recorder(owner), recordedBy: recorder(owner), source: { system: "capture", id: id2, noteVersion: 1 }, attachments: note.attachments.map(legacyMedia) });
  const closingSource = (c) => ({ closingId: c.id, incorporatedEntryIds: integrations.filter((i) => i.closing_id === c.id).map((i) => "class:" + i.class_id + ":" + i.entry_id).sort(), ...c.preparation_id ? { preparationId: c.preparation_id } : {}, ...c.class_id ? { classId: c.class_id } : {} });
  for (const r of revisions) {
    const after = object(parse(r.content).after);
    if (after.noteId !== id2 || typeof after.clarified !== "string") throw conflict();
    const d = debriefs.find((d2) => r.id === d2.id + ":" + id2), c = closingChanges.find((c2) => r.id === c2.id + ":" + id2);
    if (d && (d.clarified !== after.clarified || d.expected_version + 1 !== r.version) || c && (c.clarified !== after.clarified || c.expected_version + 1 !== r.version)) throw conflict();
    if (d) representedDebriefs.add(d.id);
    if (c) representedClosings.add(c.id);
    entries.push({ id: "revision:" + r.id, kind: d ? "debrief" : c ? "closing" : "revision", text: after.clarified, context: "", createdAt: r.created_at, appliedAt: d?.applied_at ?? c?.applied_at ?? null, author: unknown(), recordedBy: recorder(owner), source: { system: "revision", id: r.id, noteVersion: r.version, ...d ? { debriefId: d.id } : {}, ...c ? closingSource(c) : {} }, attachments: [], details: typeof after.title === "string" ? { title: after.title } : {} });
  }
  for (const d of debriefs.filter((d2) => !representedDebriefs.has(d2.id))) {
    if (typeof d.clarified !== "string" || !Number.isInteger(d.expected_version) || d.expected_version < 1) throw conflict();
    entries.push({ id: "debrief:" + d.id + ":" + id2, kind: "debrief", text: d.clarified, context: "", createdAt: d.created_at, appliedAt: d.applied_at, author: unknown(), recordedBy: null, source: { system: "debrief", id: d.id, debriefId: d.id, noteVersion: d.expected_version + 1 }, attachments: [], details: d.title ? { title: d.title } : {} });
  }
  for (const c of closingChanges.filter((c2) => !representedClosings.has(c2.id))) {
    if (typeof c.clarified !== "string" || !Number.isInteger(c.expected_version) || c.expected_version < 1) throw conflict();
    entries.push({ id: "closing:" + c.id + ":" + id2, kind: "closing", text: c.clarified, context: "", createdAt: c.created_at, appliedAt: c.applied_at, author: unknown(), recordedBy: null, source: { system: "closing", id: c.id, ...closingSource(c), noteVersion: c.expected_version + 1 }, attachments: [], details: c.title ? { title: c.title } : {} });
  }
  for (const c of closings.filter((c2) => !c2.has_change && c2.preparation_id && c2.class_id)) classContexts.push({ classId: c.class_id, preparationId: c.preparation_id, closingId: c.id, relation: c.relation, createdAt: c.created_at, appliedAt: c.applied_at, url: "/api/preparations/" + c.preparation_id });
  if (note.clarified && !entries.some((e) => e.source.system !== "capture" && e.text === note.clarified)) entries.push({ id: "clarified:" + id2, kind: "legacy_clarification", text: note.clarified, context: "", createdAt: note.updated_at, appliedAt: null, author: unknown(), recordedBy: null, source: { system: "legacy_clarification", id: id2, noteVersion: note.version }, attachments: [] });
  for (const s of sessions) {
    for (const e of s.entries) {
      const integrated = integrations.find((i) => i.class_id === s.classId && i.entry_id === e.id), name2 = typeof e.recordedBy === "string" ? e.recordedBy : null;
      const entry = { id: "class:" + s.classId + ":" + e.id, kind: "class_entry", text: e.text, context: typeof e.attribution === "string" ? e.attribution : "", createdAt: e.createdAt, appliedAt: null, author: unknown(), recordedBy: e.author === owner ? recorder(owner, name2) : actor(null, null, name2), source: { system: "class_session", id: e.id, classId: s.classId, ...typeof e.consultedVersion === "number" ? { noteVersion: e.consultedVersion } : {}, ...integrated ? { integratedByClosingId: integrated.closing_id } : {} }, attachments: [], details: { examples: typeof e.examples === "string" ? e.examples : "", questions: typeof e.questions === "string" ? e.questions : "" } };
      const duplicate = entries.find((x) => x.id === entry.id);
      if (duplicate) {
        if (JSON.stringify(duplicate) !== JSON.stringify(entry)) throw conflict();
      } else entries.push(entry);
    }
  }
  const mediaByContribution = /* @__PURE__ */ new Map();
  for (const a of rows(7)) {
    const media = { id: a.id, mime: a.mime, size: a.size, origin: a.origin, duration_ms: a.duration_ms, url: "/api/files/" + a.id, speaker: actor(a.speaker_role, a.speaker_id, a.speaker_name), recordedBy: actor(a.recorder_role, a.recorded_by, a.recorder_name), consentRecordedAt: a.consent_at };
    const list = mediaByContribution.get(a.contribution_id) ?? [];
    list.push(media);
    mediaByContribution.set(a.contribution_id, list);
  }
  for (const c of contributions) entries.push({ id: "contribution:" + c.id, kind: c.kind, text: c.text, context: c.context, createdAt: c.created_at, appliedAt: c.applied_at, author: { role: c.author_role, id: c.author_id, name: c.author_name }, recordedBy: actor(c.recorder_role, c.recorded_by, c.recorder_name), source: { system: "contribution", id: c.id, ...c.class_id ? { classId: c.class_id } : {} }, attachments: mediaByContribution.get(c.id) ?? [] });
  try {
    await projectAttributions(entries, rows(9), debriefs, id2, owner);
  } catch {
    throw conflict();
  }
  const times = new Map(entries.map((e) => [e.id, instant(e.createdAt)]));
  const contextTimes = new Map(classContexts.map((c) => [c.closingId, instant(c.createdAt)]));
  classContexts.sort((a, b) => contextTimes.get(a.closingId) - contextTimes.get(b.closingId) || a.closingId.localeCompare(b.closingId));
  entries.sort((a, b) => a.id === b.id ? 0 : a.source.system === "capture" ? -1 : b.source.system === "capture" ? 1 : times.get(a.id) - times.get(b.id) || a.id.localeCompare(b.id));
  return { note, entries, classContexts, history: { hasAppliedDebrief: note.reviewed === 1 || contributions.some((c) => c.kind === "debrief"), hasClassWork: entries.some((e) => e.source.system === "class_session" || e.source.closingId !== void 0 || e.source.system === "contribution" && e.source.classId !== void 0), hasUserContributions: contributions.some((c) => c.author_role === "user") || entries.some((e) => e.attribution && e.author.role === "user"), hasAiContributions: contributions.some((c) => c.author_role === "ai") || entries.some((e) => e.attribution && e.author.role === "ai"), hasTutorContributions: contributions.some((c) => c.author_role === "tutor") }, pendingContributionCount: rows(8)[0]?.total ?? 0 };
}
export {
  readMemory
};
