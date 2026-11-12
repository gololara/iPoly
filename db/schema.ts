import {sqliteTable,text,integer,index,uniqueIndex,primaryKey,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
import type {AnySQLiteColumn} from 'drizzle-orm/sqlite-core';
export const notes=sqliteTable('notes',{id:text('id').primaryKey(),owner:text('owner').notNull(),language:text('language').notNull(),original:text('original').notNull(),clarified:text('clarified').notNull().default(''),title:text('title').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),version:integer('version').notNull().default(1),worked:integer('worked').notNull().default(0),requestHash:text('request_hash').notNull()},t=>[index('notes_owner_created').on(t.owner,t.createdAt)]);
export const tags=sqliteTable('tags',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),normalized:text('normalized').notNull()},t=>[uniqueIndex('tags_owner_normalized').on(t.owner,t.normalized)]);
export const noteTags=sqliteTable('note_tags',{noteId:text('note_id').notNull().references(()=>notes.id),tagId:text('tag_id').notNull().references(()=>tags.id)},t=>[primaryKey({columns:[t.noteId,t.tagId]}),index('note_tags_tag').on(t.tagId)]);
export const attachments=sqliteTable('attachments',{id:text('id').primaryKey(),owner:text('owner').notNull(),noteId:text('note_id').notNull(),objectKey:text('object_key').notNull(),included:integer('included').notNull().default(0),mime:text('mime').notNull(),size:integer('size').notNull(),origin:text('origin').notNull(),createdAt:text('created_at').notNull(),durationMs:integer('duration_ms'),contentHash:text('content_hash')},t=>[index('attachments_note_owner').on(t.noteId,t.owner)]);
export const revisions=sqliteTable('revisions',{id:text('id').primaryKey(),owner:text('owner').notNull(),noteId:text('note_id').notNull().references(()=>notes.id),version:integer('version').notNull(),content:text('content').notNull(),createdAt:text('created_at').notNull()},t=>[uniqueIndex('revisions_note_version').on(t.noteId,t.version)]);
export const debriefs=sqliteTable('debriefs',{id:text('id').primaryKey(),owner:text('owner').notNull(),summary:text('summary').notNull(),changes:text('changes').notNull(),state:text('state').notNull().default('proposed'),createdAt:text('created_at').notNull(),appliedAt:text('applied_at')},t=>[index('debriefs_owner_created').on(t.owner,t.createdAt)]);

export const tutorRecords=sqliteTable('tutor_records',{id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),parentId:text('parent_id').references(():AnySQLiteColumn=>tutorRecords.id),state:text('state').notNull().default('proposed'),version:integer('version').notNull().default(1),applyGuard:integer('apply_guard').notNull().default(1),data:text('data').notNull(),requestHash:text('request_hash').notNull(),createdAt:text('created_at').notNull(),appliedAt:text('applied_at')},t=>[check('tutor_apply_guard_check',sql`${t.applyGuard}=1`),index('tutor_owner_created').on(t.owner,t.createdAt),index('tutor_parent_owner').on(t.parentId,t.owner)]);

export const tutorThreads=sqliteTable('tutor_threads',{id:text('id').primaryKey(),owner:text('owner').notNull(),language:text('language').notNull(),currentPreparationId:text('current_preparation_id').notNull().references(()=>tutorRecords.id),version:integer('version').notNull().default(1),guard:integer('guard').notNull().default(1),requestHash:text('request_hash').notNull(),createdAt:text('created_at').notNull()},t=>[check('tutor_thread_guard_check',sql`${t.guard}=1`),index('tutor_threads_owner').on(t.owner)]);
export const tutorThreadMembers=sqliteTable('tutor_thread_members',{preparationId:text('preparation_id').primaryKey().references(()=>tutorRecords.id),threadId:text('thread_id').notNull().references(()=>tutorThreads.id),owner:text('owner').notNull(),createdAt:text('created_at').notNull()},t=>[index('tutor_thread_members_thread_owner').on(t.threadId,t.owner)]);
export const tutorThreadEvents=sqliteTable('tutor_thread_events',{id:text('id').primaryKey(),threadId:text('thread_id').notNull().references(()=>tutorThreads.id),owner:text('owner').notNull(),kind:text('kind').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull()},t=>[index('tutor_thread_events_thread_owner').on(t.threadId,t.owner)]);

export const teachers=sqliteTable('teachers',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),languageId:text('language_id'),languages:text('languages').notNull().default('[]'),deliveryPreference:text('delivery_preference').notNull().default(''),version:integer('version').notNull().default(1),requestHash:text('request_hash').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()},t=>[index('teachers_owner_created').on(t.owner,t.createdAt),index('teachers_owner_language_created').on(t.owner,t.languageId,t.createdAt)]);
export const teacherEdits=sqliteTable('teacher_edits',{id:text('id').primaryKey(),owner:text('owner').notNull(),teacherId:text('teacher_id').notNull().references(()=>teachers.id),version:integer('version').notNull(),requestHash:text('request_hash').notNull(),content:text('content').notNull(),createdAt:text('created_at').notNull()},t=>[uniqueIndex('teacher_edits_teacher_version').on(t.teacherId,t.version)]);
export const classTeachers=sqliteTable('class_teachers',{classId:text('class_id').primaryKey(),owner:text('owner').notNull(),teacherId:text('teacher_id').references(()=>teachers.id),version:integer('version').notNull(),updatedAt:text('updated_at').notNull()});
export const classTeacherEvents=sqliteTable('class_teacher_events',{id:text('id').primaryKey(),owner:text('owner').notNull(),classId:text('class_id').notNull(),version:integer('version').notNull(),teacherId:text('teacher_id').references(()=>teachers.id),requestHash:text('request_hash').notNull(),createdAt:text('created_at').notNull(),guard:integer('guard').notNull().default(1)},t=>[check('class_teacher_guard_check',sql`${t.guard}=1`),uniqueIndex('class_teacher_event_version').on(t.classId,t.version)]);
export const classDetails=sqliteTable('class_details',{classId:text('class_id').primaryKey(),owner:text('owner').notNull(),classDate:text('class_date'),classType:text('class_type'),methodology:text('methodology').notNull().default(''),version:integer('version').notNull(),updatedAt:text('updated_at').notNull()});
export const classDetailEvents=sqliteTable('class_detail_events',{id:text('id').primaryKey(),owner:text('owner').notNull(),classId:text('class_id').notNull(),classDate:text('class_date'),classType:text('class_type'),methodology:text('methodology').notNull().default(''),version:integer('version').notNull(),requestHash:text('request_hash').notNull(),createdAt:text('created_at').notNull(),guard:integer('guard').notNull().default(1)},t=>[check('class_detail_guard_check',sql`${t.guard}=1`),uniqueIndex('class_detail_event_version').on(t.classId,t.version)]);
export const materialSelections=sqliteTable('material_selections',{classId:text('class_id').primaryKey(),owner:text('owner').notNull(),data:text('data').notNull(),version:integer('version').notNull(),requestId:text('request_id').notNull(),requestHash:text('request_hash').notNull(),guard:integer('guard').notNull().default(1)},t=>[check('material_selection_guard_check',sql`${t.guard}=1`)]);
export const teacherPublications=sqliteTable('teacher_publications',{id:text('id').primaryKey(),owner:text('owner').notNull(),classId:text('class_id').notNull(),teacherId:text('teacher_id').notNull(),snapshot:text('snapshot').notNull(),deliveryStatus:text('delivery_status').notNull().default('pending'),codeHash:text('code_hash').notNull(),requestHash:text('request_hash').notNull(),publishedAt:integer('published_at').notNull(),expiresAt:integer('expires_at').notNull(),revokedAt:integer('revoked_at'),guard:integer('guard').notNull().default(1)},t=>[check('publication_guard',sql`${t.guard}=1`),index('publication_owner_teacher').on(t.owner,t.teacherId)]);
export const publicationSessions=sqliteTable('publication_sessions',{id:text('id').primaryKey(),publicationId:text('publication_id').notNull(),expiresAt:integer('expires_at').notNull()});
export const publicationAttempts=sqliteTable('publication_attempts',{id:text('id').primaryKey(),window:integer('window').notNull(),attempts:integer('attempts').notNull()});

export const materialOutbox=sqliteTable('material_outbox',{id:text('id').primaryKey(),owner:text('owner').notNull(),publicationId:text('publication_id').notNull(),action:text('action').notNull(),payload:text('payload').notNull(),state:text('state').notNull(),attempts:integer('attempts').notNull().default(0),lastError:text('last_error').notNull().default('')});

// Stable teacher links are independent of the seven-day, immutable shared copies.
export const teacherLinks=sqliteTable('teacher_links',{id:text('id').primaryKey(),owner:text('owner').notNull(),teacherId:text('teacher_id').notNull(),status:text('status').notNull(),version:integer('version').notNull(),remoteVersion:integer('remote_version').notNull().default(0),currentPublicationId:text('current_publication_id'),pendingPublicationId:text('pending_publication_id'),createdAt:integer('created_at').notNull(),disabledAt:integer('disabled_at')});
export const teacherShareCopies=sqliteTable('teacher_share_copies',{id:text('id').primaryKey(),owner:text('owner').notNull(),linkId:text('link_id').notNull(),classId:text('class_id').notNull(),teacherId:text('teacher_id').notNull(),linkVersion:integer('link_version').notNull(),snapshot:text('snapshot').notNull(),requestHash:text('request_hash').notNull(),status:text('status').notNull().default('pending'),publishedAt:integer('published_at'),expiresAt:integer('expires_at'),guard:integer('guard').notNull().default(1)},t=>[check('share_copy_guard',sql`${t.guard}=1`)]);
export const teacherShareOutbox=sqliteTable('teacher_share_outbox',{id:text('id').primaryKey(),owner:text('owner').notNull(),linkId:text('link_id').notNull(),version:integer('version').notNull(),action:text('action').notNull(),payload:text('payload').notNull(),state:text('state').notNull().default('pending'),attempts:integer('attempts').notNull().default(0),lastError:text('last_error').notNull().default(''),guard:integer('guard').notNull().default(1)},t=>[check('share_outbox_guard',sql`${t.guard}=1`)]);

// Private class work never enters teacher publication payloads.
export const classSessions=sqliteTable('class_sessions',{classId:text('class_id').primaryKey(),owner:text('owner').notNull(),version:integer('version').notNull(),data:text('data').notNull(),guard:integer('guard').notNull().default(1)},t=>[check('class_session_guard',sql`${t.guard}=1`)]);
export const classSessionEvents=sqliteTable('class_session_events',{id:text('id').primaryKey(),owner:text('owner').notNull(),classId:text('class_id').notNull(),version:integer('version').notNull(),requestHash:text('request_hash').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull()},t=>[uniqueIndex('class_session_event_version').on(t.classId,t.version)]);
export const classSessionIntegrations=sqliteTable('class_session_integrations',{entryId:text('entry_id').primaryKey(),owner:text('owner').notNull(),classId:text('class_id').notNull(),noteId:text('note_id').notNull(),closingId:text('closing_id').notNull()});

// Additive accumulation model. No writer is exposed in phase 1.
export const memoryContributions=sqliteTable('memory_contributions',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),noteId:text('note_id').notNull().references(()=>notes.id),
 kind:text('kind').notNull().default('addition'),text:text('text').notNull().default(''),context:text('context').notNull().default(''),
 authorRole:text('author_role').notNull(),authorId:text('author_id'),authorName:text('author_name'),
 recorderRole:text('recorder_role'),recordedBy:text('recorded_by'),recorderName:text('recorder_name'),classId:text('class_id'),
 state:text('state').notNull().default('proposed'),approvedBy:text('approved_by'),createdAt:text('created_at').notNull(),appliedAt:text('applied_at')
},t=>[index('memory_contributions_owner_note').on(t.owner,t.noteId,t.createdAt),
 check('memory_contribution_role',sql`${t.authorRole} IN ('user','ai','tutor','unknown')`),
 check('memory_contribution_recorder_role',sql`${t.recorderRole} IS NULL OR ${t.recorderRole} IN ('user','ai','tutor','unknown')`),
 check('memory_contribution_kind',sql`${t.kind} IN ('addition','debrief','correction','exercise')`),
 check('memory_contribution_approval',sql`(${t.state}='proposed' AND ${t.appliedAt} IS NULL) OR (${t.state}='applied' AND ${t.appliedAt} IS NOT NULL AND ${t.approvedBy} IS NOT NULL)`)
]);
export const memoryContributionAttachments=sqliteTable('memory_contribution_attachments',{
 contributionId:text('contribution_id').notNull().references(()=>memoryContributions.id),attachmentId:text('attachment_id').notNull().references(()=>attachments.id),
 speakerRole:text('speaker_role'),speakerId:text('speaker_id'),speakerName:text('speaker_name'),recorderRole:text('recorder_role'),recordedBy:text('recorded_by'),recorderName:text('recorder_name'),consentAt:text('consent_at')
},t=>[primaryKey({columns:[t.contributionId,t.attachmentId]}),
 check('memory_attachment_recorder_role',sql`${t.recorderRole} IS NULL OR ${t.recorderRole} IN ('user','ai','tutor','unknown')`),
 check('memory_attachment_speaker_role',sql`${t.speakerRole} IS NULL OR ${t.speakerRole} IN ('user','ai','tutor','unknown')`)
]);

// A separate immutable-content attribution journal; legacy notes are untouched.
export const memoryAttributionCorrections=sqliteTable('memory_attribution_corrections',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),noteId:text('note_id').notNull().references(()=>notes.id),debriefId:text('debrief_id').notNull().references(()=>debriefs.id),previousId:text('previous_id').references(():AnySQLiteColumn=>memoryAttributionCorrections.id),predecessorKey:text('predecessor_key').notNull(),
 content:text('content').notNull(),contentHash:text('content_hash').notNull(),requestHash:text('request_hash').notNull(),state:text('state').notNull().default('proposed'),createdAt:text('created_at').notNull(),appliedAt:text('applied_at'),approvedBy:text('approved_by'),cancelledAt:text('cancelled_at'),guard:integer('guard').notNull().default(1)
},t=>[check('attribution_guard',sql`${t.guard}=1`),check('attribution_predecessor_key',sql`${t.predecessorKey}=coalesce(${t.previousId},'')`),check('attribution_state',sql`${t.state} IN ('proposed','applied','cancelled')`),check('attribution_approval',sql`(${t.state}='applied' AND ${t.approvedBy} IS NOT NULL AND ${t.approvedBy}=${t.owner} AND ${t.appliedAt} IS NOT NULL AND ${t.cancelledAt} IS NULL) OR (${t.state}='proposed' AND ${t.approvedBy} IS NULL AND ${t.appliedAt} IS NULL AND ${t.cancelledAt} IS NULL) OR (${t.state}='cancelled' AND ${t.approvedBy} IS NULL AND ${t.appliedAt} IS NULL AND ${t.cancelledAt} IS NOT NULL)`),index('attribution_owner_note').on(t.owner,t.noteId,t.debriefId),uniqueIndex('attribution_applied_predecessor').on(t.owner,t.noteId,t.debriefId,t.predecessorKey).where(sql`${t.state}='applied'`)]);

// Approval lifecycle is separate from immutable applied contributions.
export const memoryHeads=sqliteTable('memory_heads',{
 noteId:text('note_id').primaryKey().references(()=>notes.id),owner:text('owner').notNull(),version:integer('version').notNull(),guard:integer('guard').notNull().default(1)
},t=>[check('memory_head_guard',sql`${t.guard}=1`),check('memory_head_version',sql`${t.version}>=0`)]);
export const memoryProposals=sqliteTable('memory_proposals',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),noteId:text('note_id').notNull().references(()=>notes.id),
 version:integer('version').notNull().default(1),expectedNoteVersion:integer('expected_note_version').notNull(),expectedMemoryVersion:integer('expected_memory_version').notNull(),
 content:text('content').notNull(),requestHash:text('request_hash').notNull(),contentHash:text('content_hash').notNull(),
 state:text('state').notNull().default('proposed'),createdAt:text('created_at').notNull(),appliedAt:text('applied_at'),cancelledAt:text('cancelled_at'),approvedBy:text('approved_by'),guard:integer('guard').notNull().default(1)
},t=>[index('memory_proposals_owner_note_state').on(t.owner,t.noteId,t.state),
 check('memory_proposal_guard',sql`${t.guard}=1`),check('memory_proposal_version',sql`${t.version}=1 AND ${t.expectedNoteVersion}>0 AND ${t.expectedMemoryVersion}>=0`),
 check('memory_proposal_lifecycle',sql`(${t.state}='proposed' AND ${t.appliedAt} IS NULL AND ${t.cancelledAt} IS NULL AND ${t.approvedBy} IS NULL) OR (${t.state}='applied' AND ${t.appliedAt} IS NOT NULL AND ${t.cancelledAt} IS NULL AND ${t.approvedBy} IS NOT NULL) OR (${t.state}='cancelled' AND ${t.appliedAt} IS NULL AND ${t.cancelledAt} IS NOT NULL AND ${t.approvedBy} IS NULL)`)
]);

// New media stays outside the original capture (attachments.included remains 0).
export const memoryUploads=sqliteTable('memory_uploads',{
 attachmentId:text('attachment_id').primaryKey().references(()=>attachments.id),owner:text('owner').notNull(),noteId:text('note_id').notNull().references(()=>notes.id),createdAt:text('created_at').notNull()
},t=>[index('memory_uploads_owner_note').on(t.owner,t.noteId)]);

// A simple private class needs no preparation, summary or debrief prerequisite.
// Work/history is retained in the existing class_sessions and event tables.
export const memoryClasses=sqliteTable('memory_classes',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),language:text('language').notNull(),title:text('title').notNull(),teacherId:text('teacher_id').references(()=>teachers.id),classDate:text('class_date'),createdAt:text('created_at').notNull(),requestHash:text('request_hash').notNull(),guard:integer('guard').notNull().default(1)
},t=>[check('memory_class_guard',sql`${t.guard}=1`),index('memory_classes_owner_created').on(t.owner,t.createdAt)]);

export const learningLanguages=sqliteTable('learning_languages',{owner:text('owner').notNull(),id:text('id').notNull(),name:text('name').notNull(),createdAt:text('created_at').notNull()},t=>[uniqueIndex('learning_languages_owner_id').on(t.owner,t.id)]);
