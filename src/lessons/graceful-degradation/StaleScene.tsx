import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { timeFrames } from '../../core/frames';
import { barsAt } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { money, staleIntro, staleMilestones, staleSummary } from './captions';
import { initialStale, type StaleState } from './init';
import {
  CACHE_RANGES, PRICE, TIMELINE_END_MIN, bugProbeMinute, checkout, livePriceAt, originUpAt, runTimeline, segments, type CacheConfig, type MinuteServed, type Served,
} from './model';

const PLAY_MS = 120;
const FRAME_STEPS = 45;
const GANTT_MIN_WIDTH = 480;

const SERVED_TONE = { fresh: 'ok', refreshed: 'ok', stale: 'hi', error: 'bad' } as const;
const SERVED_LABEL: Record<Served, string> = { fresh: 'fresh', refreshed: 'fresh', stale: 'stale', error: 'error' };

function seen(row: MinuteServed): string {
  if (row.served === 'error') return 'an error';
  if (row.served === 'stale') return `stale, updated ${row.age} min ago`;
  return row.served === 'refreshed' ? 'a fresh copy, just refetched' : `a fresh copy, ${row.age} min old`;
}

export function StaleScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<StaleState>(initialStale);
  const c = s.cache;
  const rows = useMemo(() => runTimeline(c), [c]);
  const frames = useMemo(() => {
    const probe = bugProbeMinute(c, rows);
    const row = rows[probe];
    return timeFrames({
      end: TIMELINE_END_MIN,
      steps: FRAME_STEPS,
      milestones: staleMilestones(c, rows),
      intro: staleIntro(c),
      summary: staleSummary(c, rows, s.rule, checkout(s.rule, probe, row.originUp, row.fetchedAt), probe),
      hold: 2,
    });
  }, [c, rows, s.rule]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: false });
  const now = player.frame.now;
  const minute = Math.min(TIMELINE_END_MIN, Math.floor(now));
  const row = rows[minute];
  const shownPrice = row.served === 'error' ? null : livePriceAt(row.fetchedAt);
  const ch = checkout(s.rule, minute, row.originUp, row.fetchedAt);

  const bars = useMemo<GanttBar[]>(() => {
    const out: GanttBar[] = segments(rows).map((g) => ({ id: `user-${g.from}`, lane: 'user', start: g.from, end: g.to, tone: SERVED_TONE[g.served], label: SERVED_LABEL[g.served] }));
    if (c.outageLength > 0) out.push({ id: 'outage', lane: 'origin', start: c.outageStart, end: Math.min(TIMELINE_END_MIN, c.outageStart + c.outageLength), tone: 'bad', label: 'origin down' });
    return out;
  }, [rows, c]);

  const setCache = (patch: Partial<CacheConfig>) => setS((x) => ({ ...x, cache: { ...x.cache, ...patch } }));

  return (
    <StageFrame
      height={460}
      player={player}
      stats={
        <Stats>
          <Stat label={`The user sees at minute ${minute}`} value={seen(row)} color={`var(--${SERVED_TONE[row.served]})`} sub={[originUpAt(c, minute) ? 'the origin is up' : 'the origin is down']} />
          <Stat label="Price shown" value={shownPrice === null ? 'none' : money(shownPrice)} sub={[shownPrice === null ? 'no copy is safe to show' : row.served === 'stale' ? `from a copy ${row.age} min old` : 'from the cache']} />
          <Stat
            label="Checkout charges"
            value={ch.charged === null ? 'refused' : money(ch.charged)}
            color={ch.outcome === 'charged-stale' && ch.cachedPrice !== ch.livePrice ? 'var(--bad)' : ch.outcome === 'refused' ? 'var(--hi)' : 'var(--ok)'}
            sub={[`the live price is ${money(ch.livePrice)}`, s.rule === 'fail-closed' ? 'it reads the live price or refuses' : 'it trusts the cached price']}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a fresh copy' },
            { color: 'var(--hi)', label: 'stale, with its age' },
            { color: 'var(--bad)', label: 'an error, or the origin down' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Checkout" value={s.rule === 'stale-price'} onChange={(on) => setS((x) => ({ ...x, rule: on ? 'stale-price' : 'fail-closed' }))} off="fails closed" on="trusts the cache" />
          <Button onClick={() => setS(initialStale())}>Reset</Button>
        </>,
        <>
          <Slider label="TTL" value={c.ttl} {...CACHE_RANGES.ttl} format={(v) => `${v} min`} onChange={(ttl) => setCache({ ttl })} />
          <Slider label="Stale-if-error window" value={c.staleIfError} {...CACHE_RANGES.staleIfError} format={(v) => `${v} min`} onChange={(staleIfError) => setCache({ staleIfError })} />
          <Slider label="Outage starts" value={c.outageStart} {...CACHE_RANGES.outageStart} format={(v) => `minute ${v}`} onChange={(outageStart) => setCache({ outageStart })} />
          <Slider label="Outage lasts" value={c.outageLength} {...CACHE_RANGES.outageLength} format={(v) => `${v} min`} onChange={(outageLength) => setCache({ outageLength })} />
        </>,
      ]}
    >
      <div className="gd-stage stage-pad">
        <Box>
          <SectionTitle hint={`one request a minute, minute 0 to ${TIMELINE_END_MIN}`}>What the user sees</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Timeline: scroll sideways to see all of it">
            <GanttLanes
              lanes={[{ id: 'origin', label: 'Origin' }, { id: 'user', label: 'User sees' }]}
              bars={barsAt(bars, now)}
              domain={[0, TIMELINE_END_MIN]}
              now={now}
              unit=" min"
              axis
              size="md"
              labelWidth={84}
              ariaLabel="Timeline of what the user sees while the origin is down"
            />
          </WideRegion>
        </Box>
        <Box className="gd-money">
          <SectionTitle hint="degrade what is shown, never what moves money">The price, shown and charged</SectionTitle>
          <p className="gd-note">
            The price changes from {money(PRICE.before)} to {money(PRICE.after)} at minute {PRICE.changeAtMin}. A page may show the cached price with its age. A checkout that cannot read the live price should refuse; one that trusts the cache charges the old price.
          </p>
          <ProvenanceRow>
            <ClaimLabel kind="practice">many shops refuse a charge they cannot confirm; some treat the price shown as binding, so this is one common rule, not the only one</ClaimLabel>
          </ProvenanceRow>
        </Box>
        <Hint tone="muted" block>
          Press play, or drag the scrubber. The stale-if-error idea is a cache-control extension (RFC 5861, from memory; check the RFC): it lets a cache reuse an expired copy for a stated time when the origin errors.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated">one request a minute against one cache entry; the run is the same every time because nothing in it is random</Provenance>
          <Provenance kind="illustrative">the TTL, window, outage and prices are made up</Provenance>
          <Provenance kind="from-memory">stale-if-error as RFC 5861 describes it: verify against the RFC</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
