import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { derivedCaption, derivedIntro } from './captions';
import { DERIVED_CODE, EMPTY_CART, STORED_CODE, derivedTotal, editCart, isDrifting, type CartEdit, type DerivedCart } from './derived';
import { PRODUCTS } from './model';

/** The code line each edit runs, in both listings. */
const LINE_OF: Record<CartEdit['type'], number> = { add: 2, remove: 3, clear: 4 };
const PRODUCT_OPTIONS = PRODUCTS.map((p, i) => ({ value: i, label: p.name }));

export function DerivedScene({ picker }: { picker: ReactNode }) {
  const [cart, setCart] = useState<DerivedCart>(EMPTY_CART);
  const [product, setProduct] = useState(0);
  const [lastEdit, setLastEdit] = useState<CartEdit['type'] | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(derivedIntro);
  const derived = derivedTotal(cart);
  const drifting = isDrifting(cart);

  const edit = (e: CartEdit) => {
    const next = editCart(cart, e);
    setCart(next);
    setLastEdit(e.type);
    setCaption(derivedCaption(next, derivedTotal(next)));
  };
  const reset = () => {
    setCart(EMPTY_CART);
    setLastEdit(null);
    setCaption(derivedIntro);
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Derived total" value={`$${derived}`} color="var(--ok)" sub="computed from the items" />
          <Stat label="Stored total" value={`$${cart.storedTotal}`} color={drifting ? 'var(--bad)' : 'var(--ok)'} sub={drifting ? 'stale' : 'matches, for now'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'agrees with the items' },
            { color: 'var(--bad)', label: 'stale copy' },
            { color: 'var(--hi)', label: 'code the last edit ran' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Product" value={product} onChange={setProduct} options={PRODUCT_OPTIONS} />
          <ControlGroup label="Do">
            <ChipButton tone="ok" onClick={() => edit({ type: 'add', product })}>Add one</ChipButton>
            <ChipButton tone="bad" onClick={() => edit({ type: 'remove', product })}>Remove one</ChipButton>
            <ChipButton tone="dim" onClick={() => edit({ type: 'clear' })}>Clear cart</ChipButton>
          </ControlGroup>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="fs stage-pad">
        <table className="data-table fs-items">
          <caption className="fs-caption">The single source of truth: the items</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Price</th>
              <th scope="col">In cart</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCTS.map((p, i) => (
              <tr key={p.name}>
                <th scope="row" className="keep-case">{p.name}</th>
                <td>${p.price}</td>
                <td>{cart.items[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="fs-two">
          <Box className={`fs-copy ${drifting ? 'is-bad' : 'is-ok'}`}>
            <SectionTitle hint="a second copy in state">Stored total</SectionTitle>
            <CodePanel lines={STORED_CODE} active={lastEdit ? LINE_OF[lastEdit] : undefined} gutter="none" className="fs-code" />
          </Box>
          <Box className="fs-copy is-ok">
            <SectionTitle hint="no second copy">Derived total</SectionTitle>
            <CodePanel lines={DERIVED_CODE} active={lastEdit ? LINE_OF[lastEdit] : undefined} gutter="none" className="fs-code" />
          </Box>
        </div>
        <Hint block>
          Both carts start from the same items and run the same edits. Remove an item to see the stored copy stop following. A value you can compute from state should usually be computed, not stored.
        </Hint>
      </div>
    </StageFrame>
  );
}
