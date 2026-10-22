/**
 * A toy handshake against a half-open table of eight slots, as a fixed-tick seeded simulation
 * (core/simTick). Flood entries are abstract: a source that never answers, at a rate only. With
 * SYN cookies the server keeps no state after the SYN-ACK and rebuilds it from a keyed value in the
 * reply; the keyed value here is a toy hash, not any real scheme. Every size and time is a
 * named constant and illustrative.
 */
import { poisson } from '../../core/distributions';
import { hash32 } from '../../core/hash';
import { createTickSim, type TickSim } from '../../core/simTick';

/** The table is a toy size: eight half-open slots. */
export const SLOTS = 8;
/** An entry that never completes is forgotten after this many ticks, so the table drains at SLOTS / HOLD per tick. */
export const HOLD_TICKS = 40;
export const DRAIN_RATE = SLOTS / HOLD_TICKS;
export const RUN_TICKS = 240;
/** A legitimate client starts a handshake on about this share of ticks, and its ACK comes back this many ticks later. */
export const LEGIT_PER_TICK = 0.1;
export const RTT_TICKS = 6;
/** The cookie's time slot: a value is accepted in its slot and the one after. */
export const COOKIE_SLOT_TICKS = 64;
export const FLOOD_RANGE = { min: 0, max: 2, step: 0.1, default: 1 } as const;
/** A toy key and a toy hash: they only show where the value comes from. */
export const TOY_KEY = 'toy-key-not-a-secret';

export type Mode = 'plain' | 'cookies' | 'broken';
export const MODE_NAME: Record<Mode, string> = { plain: 'no cookies', cookies: 'SYN cookies', broken: 'cookies, entry allocated first (the bug)' };

/** The toy cookie: a hash of the four-tuple and the time slot, under a toy key. */
export const cookieFor = (tuple: string, slot: number): number => hash32(`${TOY_KEY}|${tuple}|${slot}`);

/** The server recomputes the cookie for this slot and the one before, and accepts an ACK that carries either. */
export const cookieValid = (tuple: string, ackedCookie: number, nowSlot: number): boolean => ackedCookie === cookieFor(tuple, nowSlot) || ackedCookie === cookieFor(tuple, nowSlot - 1);

export interface Entry {
  kind: 'legit' | 'flood';
  expires: number;
  /** For a legitimate entry: when its ACK arrives. */
  ackAt: number;
}

export interface SynState {
  tick: number;
  table: Entry[];
  /** Legitimate handshakes started, completed, and refused because the table was full. */
  started: number;
  completed: number;
  dropped: number;
  /** Flood SYNs seen, and how many were refused for want of a slot. */
  floodSeen: number;
  floodRefused: number;
  /** Legitimate ACKs in flight under cookies (no table entry): when each arrives and when its SYN was sent. */
  acks: { at: number; sent: number }[];
  /** Cookies put in a SYN-ACK, and ACKs whose cookie the server then checked. Zero without cookies. */
  cookiesIssued: number;
  cookiesChecked: number;
}

export interface SynConfig {
  seed: number;
  /** Flood connection attempts per tick (an abstract rate). */
  flood: number;
  mode: Mode;
}

const free = (table: readonly Entry[], tick: number) => table.filter((e) => e.expires > tick);

export function createSynSim(c: SynConfig): TickSim<SynState> {
  return createTickSim<SynState>({
    seed: c.seed,
    init: () => ({ tick: 0, table: [], started: 0, completed: 0, dropped: 0, floodSeen: 0, floodRefused: 0, acks: [], cookiesIssued: 0, cookiesChecked: 0 }),
    step: (s, rnd, tick) => {
      let table = free(s.table, tick);
      let { started, completed, dropped, floodSeen, floodRefused, cookiesIssued, cookiesChecked } = s;
      let acks = [...s.acks];
      const cookies = c.mode === 'cookies';
      // The bug: the cookie handshake is on, but every SYN takes a table entry before any cookie is checked.
      const allocateFirst = c.mode === 'broken';

      const dueEntries = table.filter((e) => e.kind === 'legit' && e.ackAt <= tick);
      for (const e of dueEntries) {
        if (!allocateFirst) {
          completed++;
          continue;
        }
        // The held entry makes the ACK checkable, and the cookie is checked only now, after the slot was spent.
        cookiesChecked++;
        const tuple = `client-${e.ackAt - RTT_TICKS}`;
        if (cookieValid(tuple, cookieFor(tuple, Math.floor((e.ackAt - RTT_TICKS) / COOKIE_SLOT_TICKS)), Math.floor(tick / COOKIE_SLOT_TICKS))) completed++;
      }
      table = table.filter((e) => !(e.kind === 'legit' && e.ackAt <= tick));
      for (const a of acks.filter((x) => x.at <= tick)) {
        const tuple = `client-${a.sent}`;
        const cookie = cookieFor(tuple, Math.floor(a.sent / COOKIE_SLOT_TICKS));
        if (cookieValid(tuple, cookie, Math.floor(tick / COOKIE_SLOT_TICKS))) completed++;
      }
      acks = acks.filter((x) => x.at > tick);

      const floods = poisson(rnd, c.flood);
      floodSeen += floods;
      for (let i = 0; i < floods; i++) {
        if (cookies) continue;
        if (table.length < SLOTS) table = [...table, { kind: 'flood', expires: tick + HOLD_TICKS, ackAt: Infinity }];
        else floodRefused++;
      }
      if (rnd() < LEGIT_PER_TICK) {
        started++;
        if (cookies) {
          cookiesIssued++;
          acks = [...acks, { at: tick + RTT_TICKS, sent: tick }];
        } else if (table.length < SLOTS) {
          if (allocateFirst) cookiesIssued++;
          table = [...table, { kind: 'legit', expires: tick + HOLD_TICKS, ackAt: tick + RTT_TICKS }];
        } else dropped++;
      }
      return { tick, table, started, completed, dropped, floodSeen, floodRefused, acks, cookiesIssued, cookiesChecked };
    },
    // The invariant for cookies: the table holds nothing. (Not checked in the bug mode: the run must play to the end, and the tests read its history.)
    check: c.mode === 'cookies' ? (s) => (s.table.length > 0 ? `${s.table.length} half-open entries held under cookies` : null) : undefined,
  });
}

export function runSyn(c: SynConfig, ticks = RUN_TICKS): { sim: TickSim<SynState>; final: SynState } {
  const sim = createSynSim(c);
  sim.run(ticks);
  return { sim, final: sim.state };
}

/** Handshakes still in flight (started, neither completed nor refused). */
export const inFlight = (s: SynState): number => s.started - s.completed - s.dropped;

/** The three steps of a legitimate handshake, as lanes for a sequence diagram. */
export const HANDSHAKE_TUPLE = 'client:49152>server:443';
