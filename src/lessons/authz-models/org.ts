/**
 * Example Co: the invented organisation every model is asked about, and the requirement the models are
 * measured against. Pure data and one pure rule; nothing here knows how any model works.
 */

export type Action = 'read' | 'edit';
export const ACTIONS: readonly Action[] = ['read', 'edit'];

export interface User {
  id: string;
  name: string;
  dept: string;
  /** 1 to org.levels. */
  clearance: number;
}

export interface Doc {
  id: string;
  name: string;
  dept: string;
  /** 1 to org.levels: how sensitive the document is. */
  level: number;
}

export interface Org {
  depts: readonly string[];
  levels: number;
  users: readonly User[];
  docs: readonly Doc[];
  /** Where each document sits: a folder id from `folderId`. Default: the folder of its own department and level. */
  folderOf: Readonly<Record<string, string>>;
  /** One document is shared with one person for a week (the second requirement). */
  share: boolean;
  /** A loop is closed in the first department's clearance groups (ReBAC only). */
  cycle: boolean;
}

export const folderId = (dept: string, level: number) => `${dept}-L${level}`;

/** The person and the document the "share for a week" requirement is about. */
export const SHARE = { user: 'erin', doc: 'roadmap' } as const;

export const DEPTS = ['eng', 'sales'] as const;
export const LEVELS = 3;

export const DEFAULT_USERS: readonly User[] = [
  { id: 'alice', name: 'Alice', dept: 'eng', clearance: 3 },
  { id: 'bob', name: 'Bob', dept: 'eng', clearance: 1 },
  { id: 'carol', name: 'Carol', dept: 'sales', clearance: 2 },
  { id: 'dave', name: 'Dave', dept: 'sales', clearance: 1 },
  { id: 'erin', name: 'Erin', dept: 'sales', clearance: 3 },
];

export const DEFAULT_DOCS: readonly Doc[] = [
  { id: 'notes', name: 'Design notes', dept: 'eng', level: 2 },
  { id: 'roadmap', name: 'Roadmap', dept: 'eng', level: 3 },
  { id: 'pricing', name: 'Price list', dept: 'sales', level: 1 },
  { id: 'terms', name: 'Deal terms', dept: 'sales', level: 2 },
  { id: 'onboarding', name: 'Onboarding guide', dept: 'eng', level: 1 },
];

export const defaultOrg = (): Org => ({
  depts: DEPTS,
  levels: LEVELS,
  users: DEFAULT_USERS,
  docs: DEFAULT_DOCS,
  folderOf: Object.fromEntries(DEFAULT_DOCS.map((d) => [d.id, folderId(d.dept, d.level)])),
  share: false,
  cycle: false,
});

/** Clearance needed for an action on a document of this level: reading needs the level, editing one more. */
export const needed = (action: Action, level: number) => level + (action === 'edit' ? 1 : 0);

export type RequirementId = 'dept-clearance' | 'dept-clearance-share';

export const REQUIREMENTS: readonly { id: RequirementId; label: string; text: string }[] = [
  { id: 'dept-clearance', label: 'Own department, up to clearance', text: 'Staff may read documents of their own department whose level is at most their clearance, and may edit those whose level is below it.' },
  { id: 'dept-clearance-share', label: 'That, plus Erin reads the Roadmap this week', text: 'The first rule, plus Erin may read the Roadmap for a week.' },
];

/**
 * The stated requirement, evaluated directly over the raw attributes. This is the oracle every model is compared
 * with: `user.dept === doc.dept && user.clearance >= level`, with editing needing one level more.
 */
export function required(req: RequirementId, u: User, action: Action, d: Doc): boolean {
  if (u.dept === d.dept && u.clearance >= needed(action, d.level)) return true;
  return req === 'dept-clearance-share' && u.id === SHARE.user && d.id === SHARE.doc && action === 'read';
}

export const userById = (o: Org, id: string): User => o.users.find((u) => u.id === id)!;
export const docById = (o: Org, id: string): Doc => o.docs.find((d) => d.id === id)!;
