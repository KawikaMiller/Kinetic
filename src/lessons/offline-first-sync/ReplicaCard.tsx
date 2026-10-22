import type { ReactNode } from 'react';
import { rowKeys, type ItemView, type View } from './ops';
import type { Mark } from './status';

const MARK_WORD: Record<Mark, string> = { pending: 'pending', inflight: 'in flight', confirmed: 'confirmed' };

/**
 * One replica's list: live items with a mark for the device's own unsettled edits, deleted items as dim tombstones, an
 * orange chip on a conflicted item, the counter and the listed conflicts. `actions` draws buttons beside each live
 * item; its second argument is the item's position among the live items, which is what an edit names.
 */
export function ReplicaCard({
  name, view, mark, offline = false, rolledBack = [], actions, children,
}: {
  name: string;
  view: View;
  mark?: (itemId: string) => Mark;
  offline?: boolean;
  rolledBack?: readonly string[];
  actions?: (item: ItemView, position: number) => ReactNode;
  children?: ReactNode;
}) {
  const keys = rowKeys(view.items);
  const positions = view.items.map((_, i) => view.items.slice(0, i).filter((x) => !x.deleted).length);
  return (
    <section className={`ofs-card${offline ? ' is-offline' : ''}`} aria-label={`${name}${offline ? ', offline' : ''}`}>
      <header className="ofs-card-head">
        <b>{name}</b>
        {offline && <span className="ofs-offline">airplane mode</span>}
      </header>
      {children}
      <ul className="ofs-items">
        {view.items.length === 0 && <li className="ofs-empty">no items</li>}
        {view.items.map((item, i) => {
          const live = !item.deleted;
          const m = mark?.(item.id);
          return (
            <li key={keys[i]} className={`ofs-item${item.deleted ? ' is-deleted' : ''}${item.conflicted ? ' is-conflict' : ''}`}>
              <span className="ofs-title">
                {item.deleted ? 'deleted: ' : ''}
                {item.title === null ? 'undecided' : item.title}
                {item.done ? ' (done)' : ''}
              </span>
              {item.conflicted && <span className="ofs-chip is-conflict">conflict</span>}
              {live && m && m !== 'confirmed' && <span className={`ofs-chip is-${m}`}>{MARK_WORD[m]}</span>}
              {live && m === 'confirmed' && <span className="ofs-chip is-confirmed">{MARK_WORD[m]}</span>}
              {live && actions && <span className="ofs-actions">{actions(item, positions[i])}</span>}
            </li>
          );
        })}
      </ul>
      <div className="ofs-counter">
        counter <b>{view.counter}</b>
      </div>
      {view.conflicts.length > 0 && (
        <ul className="ofs-conflicts" aria-label={`Conflicts listed on the ${name}`}>
          {view.conflicts.map((c) => (
            <li key={c.text}>{c.text}</li>
          ))}
        </ul>
      )}
      {rolledBack.length > 0 && (
        <ul className="ofs-rolled" aria-label={`Edits rolled back on the ${name}`}>
          {rolledBack.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
