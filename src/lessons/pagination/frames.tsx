import type { ReactNode } from 'react';
import { analyse, repeatedOnLastPage, type Session, type World } from './model';

export const list = (xs: readonly number[]) => xs.map((id) => `#${id}`).join(', ');

/** What one session's latest page did: rows it repeated, and rows newly jumped over since the page before. */
export function pageNews(before: World, after: World, mode: 'offset' | 'cursor'): { done: boolean; repeated: number[]; skipped: number[] } {
  const b: Session = before[mode];
  const a: Session = after[mode];
  if (a.pages.length === b.pages.length || !a.pages[a.pages.length - 1].length) return { done: true, repeated: [], skipped: [] };
  const old = new Set(analyse(before, b).gaps);
  return { done: false, repeated: repeatedOnLastPage(a), skipped: analyse(after, a).gaps.filter((id) => !old.has(id)) };
}

function side(name: string, news: ReturnType<typeof pageNews>): ReactNode {
  if (news.done) return <>{name} has nothing left.</>;
  return <>{name}: {news.repeated.length ? <span className="hl bad">repeats {list(news.repeated)}</span> : 'no repeats'}
    {news.skipped.length ? <>, <span className="hl orange">skipped {list(news.skipped)}</span></> : null}.</>;
}

/** The caption after Next page. "Stays stable" is judged over the whole cursor session. */
export function pageCaption(before: World, after: World): ReactNode {
  const c = analyse(after, after.cursor);
  const stable = c.duplicates.length === 0 && c.gaps.length === 0;
  return <>Page {Math.max(after.offset.pages.length, after.cursor.pages.length)}. {side('Offset', pageNews(before, after, 'offset'))}{' '}
    {side('Cursor', pageNews(before, after, 'cursor'))} {stable ? <span className="hl ok">The cursor stays stable.</span> : null}</>;
}

export const insertCaption = (added: readonly number[], offset: number, offsetDone: boolean): ReactNode =>
  <>{list(added)} arrived at the top. Every row below moved down {added.length} places
    {offsetDone ? '.' : <>, so OFFSET {offset} now lands {added.length} rows earlier in the list.</>}</>;

export const deleteCaption = (gone: number, offset: number, offsetDone: boolean): ReactNode =>
  <>#{gone} was deleted from the top. Every row below moved up one
    {offsetDone ? '.' : <>, so OFFSET {offset} now lands one row later: the offset page will jump over a row.</>}</>;
