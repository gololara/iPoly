import type {Attachment,Note} from './model';
export type MemoryRole='user'|'ai'|'tutor'|'unknown';
export type MemoryActor={role:MemoryRole;id:string|null;name:string|null};
export type MemoryMedia=Attachment & {speaker:MemoryActor|null;recordedBy:MemoryActor|null;consentRecordedAt:string|null};
export type MemorySource={system:'capture'|'revision'|'contribution'|'legacy_clarification'|'debrief';id:string;noteVersion?:number;debriefId?:string};
export type MemoryEntry={id:string;kind:string;text:string;context:string;createdAt:string;appliedAt:string|null;author:MemoryActor;recordedBy:MemoryActor|null;source:MemorySource;attachments:MemoryMedia[];attribution?:{originalAuthor:MemoryActor;currentId:string;history:{id:string;author:MemoryActor;proposedBy:MemoryActor;confirmedBy:MemoryActor;proposedAt:string;confirmedAt:string;evidence:{kind:'user_attestation';statement:string;reference:string|null};sourceContentHash:string}[]};details?:{title?:string}};
export type UnifiedMemory={note:Note;entries:MemoryEntry[];contributionVersion:number;history:{hasAppliedDebrief:boolean;hasUserContributions:boolean;hasAiContributions:boolean;hasTutorContributions:boolean};pendingContributionCount:number};
