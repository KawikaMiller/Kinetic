import type { ReactNode } from 'react';
import { analyse, previewOffset, repeatedOnLastPage, type Session, type World } from './model';

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

/** What the offset session's next page would do now, from a real look-ahead (so it is right after any mix of inserts and deletes). */
function nextOffsetNews(w: World): ReactNode {
  if (!w.offset.hasMore) return null;
  const p = previewOffset(w);
  const clean = p.repeated.length === 0 && p.skipped.length === 0;
  return <> The next OFFSET {w.offset.offset} page would {clean
    ? <span className="hl ok">line up exactly</span>
    : <>{p.repeated.length ? <span className="hl bad">repeat {list(p.repeated)}</span> : null}{p.repeated.length && p.skipped.length ? ' and ' : null}
      {p.skipped.length ? <span className="hl orange">skip {list(p.skipped)}</span> : null}</>}.</>;
}

export const insertCaption = (added: readonly number[], after: World): ReactNode =>
  <>{list(added)} arrived at the top, so every row below moved down {added.length} places.{nextOffsetNews(after)}</>;

export const deleteCaption = (gone: number, wasNew: boolean, after: World): ReactNode =>
  <>#{gone}{wasNew ? ' (one of the new rows)' : ''} was deleted from the top, so every row below moved up one place.{nextOffsetNews(after)}</>;
