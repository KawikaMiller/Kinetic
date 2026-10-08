import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import type { BehindBeat } from './beats';
import type { Beat, Lane } from './model';
import type { Race, RaceId } from './races';

/** One step of a scripted scene: which arrow is current (-1 before the first). */
export interface CacheFrame extends Frame {
  index: number;
}

export const LANE_NAME: Record<Lane, string> = { A: 'Client A', B: 'Client B', cache: 'the cache', db: 'the database', replica: 'the replica' };
/** Who is Client A: the pattern scripts have one app, the races have two clients. */
export const APP_NAME = 'The app';
const whoIs = (b: Beat, app: string) => (b.client === 'A' ? app : b.client ? LANE_NAME[b.client] : 'The cache');

/** The value written or read, from an arrow's label ("UPDATE price=$12") or note ("returns $10, then…"). */
const valueOf = (b: Beat) => b.label.split('=')[1];
const readValue = (b: Beat) => b.note!.replace('returns ', '').split(',')[0];

/** The most recent load arrow by the same client before arrow `i`. */
function lastLoad(beats: readonly Beat[], i: number): Beat | undefined {
  const client = beats[i].client;
  for (let k = i - 1; k >= 0; k--) if (beats[k].client === client && (beats[k].kind === 'db-read' || beats[k].kind === 'replica-read')) return beats[k];
  return undefined;
}

/** What one arrow means, from the arrow itself and what the stores held when it happened. */
export function beatCaption(beats: readonly Beat[], i: number, ttl: number | null, app: string = APP_NAME): ReactNode {
  const b = beats[i];
  const prev = i > 0 ? beats[i - 1] : null;
  const who = whoIs(b, app);
  switch (b.kind) {
    case 'hit':
      return b.served!.stale
        ? <>{who} reads the cache: a <span className="hl ok">hit</span> that returns <span className="hl orange">{b.served!.value}</span>, but the database already holds {b.view.db}. A stale read: the cache cannot tell its entry is out of date.</>
        : <>{who} reads the cache: a <span className="hl ok">hit</span>, {b.served!.value}, and the database was never asked.</>;
    case 'miss':
      return <>{who} reads the cache: a <span className="hl bad">miss</span>. {b.note?.includes('loads') ? 'The cache layer loads it from the database itself.' : 'The app has to go and get it from the database.'}</>;
    case 'db-read':
      return b.from === 'cache'
        ? <>The cache layer reads {readValue(b)} from the <span className="hl info">database</span> and stores it, so the next read hits.</>
        : <>{who} reads {readValue(b)} from the <span className="hl info">database</span>.</>;
    case 'replica-read': {
      const read = readValue(b);
      return read === b.view.db
        ? <>{who} reads {read} from a read replica, which has caught up with the database.</>
        : <>{who} reads <span className="hl orange">{read}</span> from a read replica, but the database already holds {b.view.db}: the replica has not caught up yet (replica lag).</>;
    }
    case 'fill': {
      if (!b.served!.stale) return <>{who} stores {b.served!.value} in the cache{ttl === null ? '' : `, to expire after ${ttl} s`}. Later reads will hit.</>;
      const lagged = lastLoad(beats, i)?.kind === 'replica-read';
      return <>{who} stores <span className="hl orange">{b.served!.value}</span> in the cache, but the database holds {b.view.db}. {lagged
        ? 'It read from a replica that was behind, so a stale value is now cached.'
        : 'It read that value before the write and is storing it after the invalidation, so the invalidation is undone.'} It will be served until {ttl === null ? 'something overwrites or deletes it' : `its ${ttl} s TTL runs out`}.</>;
    }
    case 'db-write':
      return <>{who} writes {valueOf(b)} to the <span className="hl info">database</span>. The cache still has the old value until someone fixes it.</>;
    case 'delete':
      return <>{who} <span className="hl violet">deletes</span> the key. Nothing stale can survive in an empty slot: the next read misses and loads from the database.</>;
    case 'set':
      return <>{who} overwrites the cache with {valueOf(b)}.{b.stale ? <> But the database holds {b.view.db}: another writer's database write came after this one's, so this entry is already out of date.</> : null}</>;
    case 'cache-write':
      return <>{who} writes {valueOf(b)} to the cache layer, which passes it straight on to the database before answering.</>;
    case 'cache-db-write':
      return <>The cache layer writes {valueOf(b)} to the <span className="hl info">database</span> in the same step, so the two agree once the write returns. The price is a slower write, and every written value is cached whether or not anyone reads it.</>;
    case 'queue': {
      const waiting = (b as BehindBeat).state.queue.length;
      return <>{who} writes {valueOf(b)} to the cache and moves on: a fast write, but the database still holds {b.view.db} and {plural(waiting, 'write')} {waiting === 1 ? 'is' : 'are'} waiting in the queue.</>;
    }
    case 'flush':
      return <>The flush job writes the latest queued value, {(b as BehindBeat).state.db}, to the <span className="hl info">database</span>: the queued writes become one. Until the next write, cache and database agree.</>;
    case 'crash': {
      const beat = b as BehindBeat;
      return <>The cache <span className="hl bad">crashes</span> before the next flush. {plural(beat.lostNow, 'queued write')} {beat.lostNow === 1 ? 'was' : 'were'} only ever in its memory and {beat.lostNow === 1 ? 'is' : 'are'} gone for good: the database still holds {beat.state.db}.</>;
    }
    case 'ttl':
      return <>The TTL runs out and the entry <span className="hl violet">expires</span>.{prev?.stale ? ' The stale value is no longer served: the next read loads the database\'s.' : ''}</>;
  }
}

/** What the race produced, said once its last arrow has happened. */
export function raceEndCaption(race: Race): ReactNode {
  const { afterRace, options } = race;
  if (afterRace.stale) {
    return <>The race is over. The database holds <b>{afterRace.db}</b> and the cache holds <span className="hl orange">{afterRace.cache}</span>: stale, {options.ttl === null ? 'with nothing scheduled to fix it' : `until its ${options.ttl} s TTL runs out`}.</>;
  }
  return <>The race is over. The database holds <b>{afterRace.db}</b> and the cache is {afterRace.cache === null ? 'empty' : <>holding the same value</>}: nothing stale is left.</>;
}

const RACE_INTRO: Record<RaceId, ReactNode> = {
  'update-set': <>Two clients change the price at the same time, and each updates the database and then the cache. Their steps interleave in the unlucky order.</>,
  'read-fill': <>One client reads (a cache miss) while another changes the price. The reader loads first, the writer finishes, then the reader fills the cache.</>,
  'replica-lag': <>A write finishes and invalidates the cache. A moment later a reader misses and fills the cache from a read replica.</>,
  'ttl-only': <>Nobody invalidates anything: writes go to the database only, and the cache learns of them when its entries expire.</>,
};

export function raceIntro(race: Race, invalidate: 'delete' | 'set', lag: number): ReactNode {
  const how = invalidate === 'delete' ? <><b>delete</b> the key</> : <><b>overwrite</b> the key</>;
  const tail = {
    'update-set': <>Writers {how}.</>,
    'read-fill': <>The writer {invalidate === 'delete' ? <><b>deletes</b> the key</> : <><b>overwrites</b> the key</>}.</>,
    'replica-lag': <>The replica shows a write <b>{lag} s</b> after the database.</>,
    'ttl-only': <>Entries live <b>{race.options.ttl} s</b>.</>,
  }[race.id];
  return <>{RACE_INTRO[race.id]} {tail} Step through it.</>;
}

/** Frames for a race: an intro, one per arrow (the race's last arrow also says how it ended), and a verdict. */
export function raceFrames(race: Race, invalidate: 'delete' | 'set', lag: number): CacheFrame[] {
  const frames: CacheFrame[] = [{ index: -1, say: raceIntro(race, invalidate, lag) }];
  race.beats.forEach((_, i) => {
    const base = beatCaption(race.beats, i, race.options.ttl, LANE_NAME.A);
    frames.push({ index: i, say: i === race.raceEnd ? <>{base} {raceEndCaption(race)}</> : base });
  });
  frames.push({ index: race.beats.length - 1, say: raceVerdict(race) });
  return frames;
}

/** The closing caption: what the first read after the race got, and what the TTL did or would do. */
export function raceVerdict(race: Race): ReactNode {
  const { firstRead, afterTtl, staleUntil, options, afterRace } = race;
  const read = firstRead && (firstRead.stale
    ? <>The next read is served <span className="hl orange">{firstRead.value}</span>, which is wrong: the database holds {afterRace.db}.</>
    : <>The next read gets <span className="hl ok">{firstRead.value}</span>, which is right: the database holds {afterRace.db}.</>);
  if (afterRace.stale || firstRead?.stale) {
    return options.ttl === null
      ? <>{read} With no TTL nothing corrects it: it stays stale until another write to this key happens to fix it.</>
      : <>{read} The TTL is the backstop: at {staleUntil} s the entry expires and the next read gets <span className="hl ok">{afterTtl?.value}</span>. Staleness was bounded by the TTL, not removed.</>;
  }
  return <>{read} With these settings the race leaves nothing stale.</>;
}

/** Frames for the three-pattern scripts: an intro, one per arrow, then the point of the pattern. */
export function patternFrames(beats: readonly Beat[], intro: ReactNode, point: ReactNode, ttl: number | null): CacheFrame[] {
  return [
    { index: -1, say: intro },
    ...beats.map((_, i) => ({ index: i, say: beatCaption(beats, i, ttl) })),
    { index: beats.length - 1, say: point },
  ];
}
