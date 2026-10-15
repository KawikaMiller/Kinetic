import { plural } from '../../core/format';
import { KEY_COUNT, START_SERVERS, type Change } from './model';

export type Scheme = 'ring' | 'mod';

const list = (xs: string[]) => xs.join(', ');

export const introCaption = () => (
  <>
    {KEY_COUNT} keys, {START_SERVERS.length} servers. On the ring, each key walks <b>clockwise</b> to the first server it
    meets. Hover a key, or use the Inspect key slider, to see its path.
  </>
);

export const schemeCaption = (scheme: Scheme) =>
  scheme === 'ring' ? (
    <>The ring: servers and keys hashed onto the same circle. Ownership changes <b>locally</b>: only near the point that comes or goes.</>
  ) : (
    <><code>hash(key) % N</code>: dead simple, perfectly fine until N changes. Try adding a server.</>
  );

/** What a join would move on average on the ring: the closed form K/(N+1), for the caption's yardstick. */
export const expectedJoinMoves = (serversBefore: number, keyCount = KEY_COUNT) => keyCount / (serversBefore + 1);

/** The caption after a join or a leave, for the scheme on screen; every figure comes from `change`. */
export function changeCaption(scheme: Scheme, change: Change, serversBefore: number) {
  const ring = change.ringMoved.size;
  const mod = change.modMoved.size;
  const label = change.joined ? `Server ${change.server} joined` : `Server ${change.server} left`;
  if (scheme === 'mod') {
    return (
      <>
        {label}. <code>hash % N</code> changed the owner of <span className="hl bad">{mod} of {KEY_COUNT} keys</span>. A ring
        would have moved <span className="hl ok">{ring}</span>.
      </>
    );
  }
  if (ring === 0) {
    return (
      <>
        {label}. On the ring <span className="hl ok">no key</span> moved: no key hashed into the slices that changed hands.
        With <code>% N</code> it would have been <span className="hl bad">{mod}</span>.
      </>
    );
  }
  const where = change.joined
    ? <>all of them onto {change.server}, taken from {plural(change.ringDonors.length, 'server')} ({list(change.ringDonors)})</>
    : <>they passed to {plural(change.ringTakers.length, 'server')} ({list(change.ringTakers)}), and no other key moved</>;
  return (
    <>
      {label}. On the ring <span className="hl ok">{plural(ring, 'key')}</span> moved: {where}. With <code>% N</code> it
      would have been <span className="hl bad">{mod}</span>.
      {change.joined && <> A join into {serversBefore} servers averages about {expectedJoinMoves(serversBefore).toFixed(0)} moves; one random draw of the points can land well off that.</>}
    </>
  );
}

export const vnodesCaption = (scheme: Scheme, vnodes: number, busiest: number) =>
  scheme === 'mod' ? (
    <>
      <code>hash % N</code> has no points, so this slider changes nothing here. On a ring, {plural(vnodes, 'point')} per
      server would leave the busiest server at <b>{busiest.toFixed(2)}×</b> its fair share.
    </>
  ) : (
  <>
    <span className="hl violet">{plural(vnodes, 'point')}</span> per server: the busiest server holds{' '}
    <b>{busiest.toFixed(2)}×</b> its fair share. {vnodes === 1
      ? 'With one point each the arcs are random sizes, so the load can be far from even.'
      : 'Many small arcs average out, so the bars move towards the fair-share line.'}
  </>
);
