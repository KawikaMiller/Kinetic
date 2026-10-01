import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';

const START_ITEMS = 5;
const BULK = 100;

type Wiring = 'delegate' | 'per-item';

interface LastClick {
  /** What `event.target` actually was: often something *inside* the item. */
  target: string;
  item: number | null;
  handled: boolean;
  removed: boolean;
}

const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
const itemIdOf = (el: Element | null) => {
  const li = el?.closest('li[data-id]') as HTMLElement | null;
  return li ? Number(li.dataset.id) : null;
};

export function Delegation({ picker }: { picker: ReactNode }) {
  const [items, setItems] = useState<number[]>(() => Array.from({ length: START_ITEMS }, (_, i) => i + 1));
  const [wiring, setWiring] = useState<Wiring>('delegate');
  const [attached, setAttached] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [last, setLast] = useState<LastClick | null>(null);
  const setCaption = useSetCaption();
  const nextId = useRef(START_ITEMS + 1);
  const listRef = useRef<HTMLUListElement>(null);
  const handled = useRef(false);

  useIntroCaption(
    <>One listener on the <code>&lt;ul&gt;</code> handles clicks on every item, even items added later: the click bubbles up
      to it, and <code>event.target.closest('li')</code> says which item was hit.</>,
  );

  // Stable: it only touches setters and refs.
  const act = useCallback((el: Element) => {
    const id = itemIdOf(el);
    if (id === null) return;
    handled.current = true;
    const removing = el.closest('.de-li-x') !== null;
    if (removing) setItems((prev) => prev.filter((x) => x !== id));
    else setSelected(id);
    setLast({ target: describe(el), item: id, handled: true, removed: removing });
  }, []);

  // Delegation: one real listener on the list.
  useEffect(() => {
    const list = listRef.current;
    if (!list || wiring !== 'delegate') return;
    const onClick = (e: Event) => act(e.target as Element);
    list.addEventListener('click', onClick);
    setAttached(1);
    return () => list.removeEventListener('click', onClick);
  }, [wiring, act]);

  // Per item: a listener on each <li> that exists *right now*. Items added later get none.
  useEffect(() => {
    const list = listRef.current;
    if (!list || wiring !== 'per-item') return;
    const lis = [...list.querySelectorAll('li[data-id]')];
    const onClick = (e: Event) => act(e.target as Element);
    lis.forEach((li) => li.addEventListener('click', onClick));
    setAttached(lis.length);
    return () => lis.forEach((li) => li.removeEventListener('click', onClick));
  }, [wiring, act]);

  // Notice clicks that reached the list but no listener handled.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const before = () => {
      handled.current = false;
    };
    const after = (e: Event) => {
      const id = itemIdOf(e.target as Element);
      if (id !== null && !handled.current) setLast({ target: describe(e.target as Element), item: id, handled: false, removed: false });
    };
    list.addEventListener('click', before, { capture: true });
    // on the parent, so it runs after the list's own (bubble) listener
    const parent = list.parentElement;
    parent?.addEventListener('click', after);
    return () => {
      list.removeEventListener('click', before, { capture: true });
      parent?.removeEventListener('click', after);
    };
  }, []);

  useEffect(() => {
    if (!last) return;
    if (!last.handled) {
      setCaption(
        <><span className="hl bad">Nothing happened</span>: item {last.item} was added after the per-item listeners were
          attached, so it has none. Delegation doesn't have this bug.</>,
      );
    } else if (last.removed) {
      setCaption(<>The click landed on <code>{last.target}</code>; <code>closest('li')</code> found item {last.item}, and the ✕ removed it.</>);
    } else {
      setCaption(
        <><code>event.target</code> was <code>{last.target}</code>, not the <code>li</code>. <code>closest('li')</code> walks up to
          item <span className="hl">{last.item}</span>.</>,
      );
    }
  }, [last, setCaption]);

  const add = (n: number) => {
    // Take the ids outside the updater: StrictMode runs updaters twice, which skipped numbers.
    const ids = Array.from({ length: n }, () => nextId.current++);
    setItems((prev) => [...prev, ...ids]);
  };

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Items" value={items.length} />
          <Stat label="Listeners attached" value={attached} color={wiring === 'delegate' ? 'var(--ok)' : 'var(--hi)'} sub={wiring === 'delegate' ? 'one, on the <ul>' : 'one per item, at attach time'} />
          <Stat label="event.target" value={last ? last.target : NA} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'item picked by closest()' },
            { color: 'var(--bad)', label: 'click nobody handled' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Listeners" value={wiring === 'per-item'} onChange={(v) => setWiring(v ? 'per-item' : 'delegate')} off="One on the list" on="One per item" />
        </>,
        <>
          <Button variant="primary" onClick={() => add(BULK)}>Add {BULK} items</Button>
          <Button onClick={() => add(1)}>Add 1 item</Button>
          <Button onClick={() => setItems([])} disabled={!items.length}>Clear</Button>
          <Hint>Click an item, or its ✕</Hint>
        </>,
      ]}
    >
      <div className="stage-pad de">
        <Box className="de-list-box">
          <SectionTitle hint={wiring === 'delegate' ? 'ul.addEventListener("click", …)' : 'li.addEventListener("click", …) × each'}>
            ul (the real list)
          </SectionTitle>
          <div className="de-list-wrap">
            <ul ref={listRef} className="de-list">
              {items.map((id) => (
                <li
                  key={id}
                  data-id={id}
                  className={[
                    'de-li',
                    id === selected ? 'tone-hi is-picked' : '',
                    last && !last.handled && last.item === id ? 'tone-bad is-missed' : '',
                  ].join(' ')}
                >
                  <button type="button" className="de-li-label">Item {id}</button>
                  <button type="button" className="de-li-x" aria-label={`Remove item ${id}`}>✕</button>
                </li>
              ))}
            </ul>
            {!items.length && <p className="empty-note">The list is empty. Add some items.</p>}
          </div>
        </Box>
        <p className="de-note">
          Real DOM, real listeners. In per-item mode the listeners are attached once, when you switch modes: add items
          afterwards and click one.
        </p>
      </div>
    </StageFrame>
  );
}
