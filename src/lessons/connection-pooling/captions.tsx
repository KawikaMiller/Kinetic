import type { ReactNode } from 'react';
import { decimal, plural } from '../../core/format';
import { ACQUIRE_TIMEOUT_MS, effectiveHoldMs, LEAK_FLAG_MS, littlesLaw, TICK_MS, type Config, type Summary } from './model';

/** How far the measured number may be from the prediction and still be called close. */
const NEAR_SHARE = 0.25;

const ms = (v: number) => `${decimal(v, 0)} ms`;

/** The caption for the current state of the run, from its own numbers. */
export function poolCaption(cfg: Config, s: Summary): ReactNode {
  const total = cfg.instances * cfg.poolSize;
  if (!cfg.usePool) {
    const connect = s.connectMean.tcp + s.connectMean.tls + s.connectMean.auth;
    return <>With <b>no pool</b> every request opens its own connection first: about <span className="hl">{ms(connect)}</span> of TCP, TLS and login before a {cfg.queryMs} ms query.
      Median latency is <span className="hl info">{ms(s.p50)}</span> and <b>{s.open}</b> connections are open at the database right now.</>;
  }
  if (cfg.leak && s.leaked > 0) {
    return s.leaked >= s.slots
      ? <>Every one of the <b>{s.slots}</b> connections has <span className="hl bad">leaked</span>. Nothing can get a connection, so every request waits the full {ACQUIRE_TIMEOUT_MS / 1000} s and <span className="hl bad">{plural(s.timedOut, 'request')}</span> have timed out.</>
      : <><span className="hl bad">{s.leaked} of {s.slots}</span> connections were taken and never returned, and {plural(s.flagged, 'connection')} {s.flagged === 1 ? 'is' : 'are'} flagged by leak detection after {LEAK_FLAG_MS / 1000} s. The pool is shrinking by one every time the buggy path runs.</>;
  }
  if (s.failed > 0) {
    return <>The instances ask for <b>{cfg.instances} × {cfg.poolSize} = {total}</b> connections but the database allows <b>{cfg.dbMax}</b>: <span className="hl orange">{s.failed} slots were refused</span> and keep retrying.
      In this model queries run {decimal(s.slowdown, 1)}× slower, from sharing the cores and an invented cost for holding {s.open} connections, and the median request takes <span className="hl info">{ms(s.p50)}</span>.{s.timedOut > 0 && <> Pools that opened first took every connection the database had, so requests sent to the other instances wait for one that never comes: <span className="hl bad">{plural(s.timedOut, 'timeout')}</span>.</>}</>;
  }
  if (s.timedOut > 0 || s.waiting > 0) {
    return <>The pool has <b>{total}</b> connections for about <b>{decimal(littlesLaw(cfg.rate, cfg.queryMs), 1)}</b> in use on average, so requests queue: <span className="hl">{plural(s.waiting, 'request')} waiting</span> and{' '}
      <span className="hl bad">{plural(s.timedOut, 'request')} timed out</span> after waiting a second for a connection.</>;
  }
  return <>A pool of <b>{total}</b> connections serves <b>{cfg.rate}</b> requests a second. Median latency is <span className="hl info">{ms(s.p50)}</span>, and on average{' '}
    <b>{decimal(s.meanInUse, 1)}</b> connections are in use. {littleComparison(cfg, s.meanInUse)} Connections are opened once and reused.</>;
}

/** How near the measured connections in use are to rate × query time, said as it is rather than assumed. */
function littleComparison(cfg: Config, measured: number): ReactNode {
  const predicted = littlesLaw(cfg.rate, cfg.queryMs);
  if (cfg.queryMs < TICK_MS) {
    return <>Rate × query time predicts {decimal(predicted, 1)}, but this model moves in {TICK_MS} ms steps and holds a connection for at least one step, so a {cfg.queryMs} ms query counts as {TICK_MS} ms (rate × {TICK_MS} ms = {decimal(littlesLaw(cfg.rate, effectiveHoldMs(cfg.queryMs)), 1)}).</>;
  }
  const near = Math.abs(measured - predicted) <= predicted * NEAR_SHARE;
  return near
    ? <>That is close to the {decimal(predicted, 1)} that rate × query time predicts.</>
    : <>Rate × query time predicts {decimal(predicted, 1)}; the run has not settled on it yet.</>;
}
