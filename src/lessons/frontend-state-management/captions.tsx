import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { EFFECT_FOR, IDS, LABEL, PRODUCTS, type Action, type Approach, type CompId, type Outcome, type SignalRun } from './model';
import { FIRST_PRICE, isStale, type SwrFrame, type SwrMode } from './swr';
import { isDrifting, type DerivedCart } from './derived';

const names = (ids: readonly CompId[]) => ids.map((id) => LABEL[id]).join(', ');
const verb = (a: Action) => (a.type === 'add' ? `Added a ${PRODUCTS[a.product].name}` : 'Toggled the theme');

export const renderIntro = (
  <>
    One piece of state changes, and four ways of sharing it decide which components run again. Pick an approach, then press an action. Boxes show how many times each component re-rendered.
  </>
);

/** What happened for one action, in the words of the approach. All numbers come from the model's outcome or the signals run. */
export function actionCaption(approach: Approach, memo: boolean, action: Action, react: Outcome | null, signals: SignalRun | null): ReactNode {
  const total = IDS.length;
  if (approach === 'signals') {
    const run = signals!;
    const bound = run.effects.length;
    return (
      <>
        {verb(action)}. No component function ran again: {plural(bound, 'text binding')} did ({run.effects.map((e) => LABEL[EFFECT_FOR[e]!]).join(', ')}).{' '}
        {run.computeds.length ? `${run.computeds.join(' and ')} recomputed once${run.computeds.length > 1 ? ' each' : ''}.` : 'Nothing was recomputed.'}
      </>
    );
  }
  const o = react!;
  const wasted = o.rendered.filter((id) => o.kinds.get(id) === 'wasted');
  const tail = wasted.length ? <> Re-ran with identical output: {names(wasted)}.</> : <> None of them re-ran for nothing.</>;
  const head = (
    <>
      {verb(action)}. {o.rendered.length} of {total} components re-rendered.
    </>
  );
  if (approach === 'lifted') {
    return (
      <>
        {head} App owns the state, so it re-rendered
        {memo ? ', and each level below re-rendered only if its props changed.' : '; with memo off, a parent re-rendering re-renders every child.'}
        {tail}
      </>
    );
  }
  if (approach === 'context') {
    return (
      <>
        {head} The provider re-rendered and so did every component that reads the context, whichever field it reads.{tail}
      </>
    );
  }
  return (
    <>
      {head} Each component asks the store for a slice and re-renders only if that slice changed: {names(o.rendered)}.{tail}
    </>
  );
}

export const swrIntro = (
  <>
    A price lives on a server and the UI reads it through a cache. Change the server price, pick how the component reads it, and press play: watch which value the UI shows, and when.
  </>
);

export function swrCaption(f: SwrFrame, mode: SwrMode, serverPrice: number): ReactNode {
  const stale = isStale(f);
  switch (f.event) {
    case 'intro': return swrIntro;
    case 'ask': return <>The component asks the cache for the price. Nothing is cached yet, so it has nothing to show.</>;
    case 'miss': return <>Cache miss: the cache fetches the price from the server.</>;
    case 'stored': return <>The server answers {FIRST_PRICE} and the cache stores it.</>;
    case 'fresh': return <>The component shows {FIRST_PRICE}. The value is fresh: the cache and the server agree.</>;
    case 'edit':
      return serverPrice === f.cache ? (
        <>The price is saved again on the server, but it is still {serverPrice}, so nothing the UI shows is out of date.</>
      ) : (
        <>Someone changes the price on the server to {serverPrice}. The UI still shows {FIRST_PRICE} and cannot know: that value is now <span className="hl bad">stale</span>.</>
      );
    case 'revisit': return <>The user comes back to the page (a refocus or a remount) and the component reads the price again.</>;
    case 'instant':
      return <>Stale-while-revalidate: the cache answers at once with what it has, {FIRST_PRICE}{stale ? ', which is stale' : ''}, so the page never waits.</>;
    case 'copied':
      return <>The anti-pattern: the component copies the cached {FIRST_PRICE} into its own local state with <code>useState</code>. From now on the cache cannot reach it. (Shown at the revisit so the stale value is visible; a real copy happens on the first mount.)</>;
    case 'revalidate': return <>Behind the scenes the cache asks the server again.</>;
    case 'updated': return <>The server answers {serverPrice} and the cache updates{mode === 'swr' && stale ? ', but the UI has not heard yet' : ''}.</>;
    case 'refreshed':
      return <>The cache tells the component and it re-renders with {serverPrice}: <span className="hl ok">fresh</span> again. Stale first, then fresh, and the user never saw a spinner.</>;
    case 'drift':
      return serverPrice === FIRST_PRICE ? (
        <>The price never changed, so the copy happens to be right. It would not have been otherwise.</>
      ) : (
        <>The cache and the server say {serverPrice}, but the component keeps its local copy, {FIRST_PRICE}. Two sources of truth drifted apart and nothing will fix it.</>
      );
  }
}

export const derivedIntro = (
  <>
    Two carts hold the same items. One computes its total from the items on every render; the other keeps the total as a second piece of state. Add and remove items, and compare.
  </>
);

export function derivedCaption(cart: DerivedCart, derived: number): ReactNode {
  if (!isDrifting(cart) && derived === 0) return <>Both totals read $0: the cart is empty, so there was nothing to remove.</>;
  return isDrifting(cart) ? (
    <>
      The stored total says ${cart.storedTotal}; the items add up to ${derived}. The code that removes items never updated the copy, so the copy is <span className="hl bad">stale</span>.
      The derived total cannot drift: there is only one source of truth.
    </>
  ) : (
    <>
      Both totals read ${derived}. They agree because nothing has been taken out of the cart yet; remove an item and the stored copy stops following.
    </>
  );
}
