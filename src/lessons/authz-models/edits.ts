/** The learner's edits to the organisation: bounded pickers only, each returning a new Org. */
import { folderId, type Org } from './org';

export const setUserDept = (o: Org, userId: string, dept: string): Org =>
  o.depts.includes(dept) ? { ...o, users: o.users.map((u) => (u.id === userId ? { ...u, dept } : u)) } : o;

export const setUserClearance = (o: Org, userId: string, clearance: number): Org =>
  Number.isInteger(clearance) && clearance >= 1 && clearance <= o.levels ? { ...o, users: o.users.map((u) => (u.id === userId ? { ...u, clearance } : u)) } : o;

/** Move a document to a folder that exists (one per department and level). */
export function moveDoc(o: Org, docId: string, folder: string): Org {
  const exists = o.depts.some((d) => Array.from({ length: o.levels }, (_, i) => folderId(d, i + 1)).includes(folder));
  return exists ? { ...o, folderOf: { ...o.folderOf, [docId]: folder } } : o;
}

export const setShare = (o: Org, share: boolean): Org => ({ ...o, share });
export const setCycle = (o: Org, cycle: boolean): Org => ({ ...o, cycle });

/** Every folder of the organisation, in a stable order. */
export const foldersOf = (o: Org): string[] => o.depts.flatMap((d) => Array.from({ length: o.levels }, (_, i) => folderId(d, i + 1)));
