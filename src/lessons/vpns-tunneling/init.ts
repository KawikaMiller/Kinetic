/** The state each scene opens in (pure, so a test can switch through all of them) and the learner's edits. */
import { ipToString, ipv4, parseIPv4 } from '../../core/ipv4';
import { parseBoundedInt } from '../../core/parse';
import type { LadderId } from './ladders';
import { DEFAULT_MTU_INPUT, type MtuInput } from './mtu';
import { MAX_NUMBER, emptyWindow, receive, type ReplayWindow, type Verdict } from './replay';
import type { PresetId, TiePolicy } from './routing';
import { DEFAULT_OPTIONS, type TunnelId, type TunnelOptions } from './tunnels';

// ---- scene 1: wrapping ------------------------------------------------------------------------

export const WRAP_PAYLOAD = { min: 0, max: 1400, initial: 108 } as const;
export interface WrapState {
  tunnel: TunnelId;
  opts: TunnelOptions;
  payload: number;
}
/** A 108-byte payload makes the inner packet 128 bytes: a whole number of WireGuard blocks, so the padding row is honest at zero. */
export const initialWrap = (): WrapState => ({ tunnel: 'wireguard', opts: { ...DEFAULT_OPTIONS }, payload: WRAP_PAYLOAD.initial });

// ---- scene 2: MTU -----------------------------------------------------------------------------

export const initialMtu = (): MtuInput => ({ ...DEFAULT_MTU_INPUT });

// ---- scene 3: routes --------------------------------------------------------------------------

export interface RoutesState {
  preset: PresetId;
  policy: TiePolicy;
  /** What is typed in the destination field; `dest` holds the last text that parsed. */
  text: string;
  dest: number;
  error: string | null;
}
export const DEFAULT_DEST = '203.0.113.50';
export const initialRoutes = (): RoutesState => ({ preset: 'full', policy: 'direct', text: DEFAULT_DEST, dest: ipv4(DEFAULT_DEST), error: null });

/** Typing a destination: a good address is used at once, a bad one is refused with the reason and the old one stays in use. */
export function typeDestination(s: RoutesState, text: string): RoutesState {
  const r = parseIPv4(text);
  if (!r.ok) return { ...s, text, error: `${r.error} Still showing ${ipToString(s.dest)}.` };
  return { ...s, text, dest: r.value, error: null };
}

// ---- scene 4: keys and replay -----------------------------------------------------------------

export interface LogEntry {
  id: number;
  n: number;
  verdict: Verdict;
}
export interface ReplayState {
  window: ReplayWindow;
  log: LogEntry[];
  sent: number;
  accepted: number;
  /** The packet number field and the last message about it. */
  field: string;
  note: string | null;
  lastAccepted: number | null;
}
export const LOG_LENGTH = 6;
export const initialReplay = (): ReplayState => ({ window: emptyWindow(), log: [], sent: 0, accepted: 0, field: '', note: null, lastAccepted: null });

export interface KeysState {
  ladder: LadderId;
  replay: ReplayState;
}
export const initialKeys = (): KeysState => ({ ladder: 'wireguard', replay: initialReplay() });

/** Send one packet number to the receiver. */
export function sendNumber(s: ReplayState, n: number): ReplayState {
  if (n > MAX_NUMBER) return { ...s, note: `This lesson's numbers stop at ${MAX_NUMBER.toLocaleString('en-US')}; press Reset to start again.` };
  const out = receive(s.window, n);
  const entry: LogEntry = { id: s.sent + 1, n, verdict: out.verdict };
  return {
    ...s,
    window: out.window,
    sent: s.sent + 1,
    accepted: s.accepted + (out.verdict.kind === 'accepted' ? 1 : 0),
    log: [...s.log, entry].slice(-LOG_LENGTH),
    lastAccepted: out.verdict.kind === 'accepted' ? n : s.lastAccepted,
    note: null,
  };
}

/** Send the number the field holds, or keep everything and say why not. */
export function sendTyped(s: ReplayState): ReplayState {
  const r = parseBoundedInt(s.field, {
    min: 0,
    max: MAX_NUMBER,
    thousands: true,
    messages: { empty: 'Type a packet number, 1 or more.', invalid: () => 'A packet number is a whole number.', tooSmall: () => 'Packet numbers are 0 or more.', tooBig: () => `This lesson's numbers stop at ${MAX_NUMBER.toLocaleString('en-US')}.` },
  });
  if (!r.ok) return { ...s, note: r.error };
  return sendNumber({ ...s, field: '' }, r.value);
}

export const sendNext = (s: ReplayState): ReplayState => sendNumber(s, s.window.top + 1);
export const sendReplayOfLast = (s: ReplayState): ReplayState => (s.lastAccepted === null ? { ...s, note: 'Nothing has been accepted yet, so there is nothing to replay.' } : sendNumber(s, s.lastAccepted));
export const sendOld = (s: ReplayState, back: number): ReplayState => (s.window.top - back < 1 ? { ...s, note: `The highest number is ${s.window.top}, so there is no number ${back} below it yet.` } : sendNumber(s, s.window.top - back));
export const sendAhead = (s: ReplayState, jump: number): ReplayState => sendNumber(s, s.window.top + jump);
