import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Arrow, Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { pct } from '../../core/format';
import { goodputText, hiddenIntro } from './captions';
import { AP, FRAME_RANGE, PLANE, RANGE, circle, clampPoint, clampRange, exchange, hearing, isHidden } from './hidden';
import { initialHidden, type HiddenState } from './init';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--amber)', label: 'station A and its radio range (dashed)' },
      { color: 'var(--pink)', label: 'station C and its radio range (dashed)' },
      { color: 'var(--dim)', label: 'a station out of range of the access point' },
      { color: 'var(--bad)', label: 'the access point, when overlapping frames collide there' },
      { color: 'var(--violet)', label: 'the CTS that silences a station (NAV), and the access point once RTS/CTS is on' },
    ]}
  />
);

export function HiddenScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<HiddenState>(initialHidden);
  const h = useMemo(() => hearing({ a: st.a, c: st.c, range: st.range }), [st.a, st.c, st.range]);
  const reach = h.aToAp && h.cToAp;
  const hidden = isHidden(h);
  const plain = reach ? exchange(h, st.frame, false) : null;
  const rts = reach ? exchange(h, st.frame, true) : null;
  const shown = st.rtsCts ? rts : plain;
  const other = st.rtsCts ? plain : rts;
  const aTone = h.aToAp ? 'amber' : 'dim';
  const cTone = h.cToAp ? 'pink' : 'dim';

  return (
    <StageFrame
      height={640}
      legend={LEGEND}
      intro={hiddenIntro(st)}
      introKey={[st.a.x, st.a.y, st.c.x, st.c.y, st.range, st.frame, st.rtsCts]}
      stats={
        <Stats>
          <Stat label="A and C hear each other" value={h.aToC ? 'yes' : 'no'} color={hidden ? 'var(--violet)' : undefined} sub={hidden ? 'a hidden node: both reach the access point' : reach ? 'carrier sensing works' : 'a station is out of range'} />
          <Stat
            label={st.rtsCts ? 'RTS frames collide' : 'Data frames collide'}
            value={shown ? pct(shown.pCollide, 1) : '–'}
            color={shown && shown.pCollide > 0.5 ? 'var(--bad)' : undefined}
            sub={st.rtsCts ? 'data frames collide in 0% of attempts' : 'attempts where both start close enough to overlap'}
          />
          <Stat
            label="Airtime that delivered payload"
            value={shown ? goodputText(shown.goodput) : '–'}
            sub={shown && other ? [`${st.rtsCts ? 'with' : 'without'} RTS/CTS`, `${st.rtsCts ? 'without' : 'with'}: ${goodputText(other.goodput)}`] : 'nothing reaches the access point'}
          />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="RTS/CTS" value={st.rtsCts} off="off" on="on" onChange={(rtsCts) => setSt((s) => ({ ...s, rtsCts }))} />
        </>,
        <>
          <Slider label="Radio range" value={st.range} min={RANGE.min} max={RANGE.max} step={5} format={(v) => `${v} units`} onChange={(range) => setSt((s) => ({ ...s, range: clampRange(range) }))} />
          <Slider label="Frame length" value={st.frame} min={FRAME_RANGE.min} max={FRAME_RANGE.max} format={(v) => `${v} slots`} onChange={(frame) => setSt((s) => ({ ...s, frame }))} />
          <Button onClick={() => setSt(initialHidden())}>Reset</Button>
        </>,
      ]}
    >
      <div className="wf-stage stage-pad">
        <Box>
          <SectionTitle hint="drag A or C, or focus one and use the arrow keys; hearing is a plain distance test">Access point and two stations</SectionTitle>
          <Plot2D x={{ domain: [0, PLANE], label: 'metres, illustrative', ticks: 5 }} y={{ domain: [0, PLANE], ticks: 5 }} aspect="equal" ariaLabel="An access point in the middle and two stations you can move, with each station's radio range">
            <Curve points={circle(st.a, st.range)} tone={aTone} dashed />
            <Curve points={circle(st.c, st.range)} tone={cTone} dashed />
            {st.rtsCts && reach && <Arrow from={[AP.x, AP.y]} to={[st.a.x, st.a.y]} tone="violet" label="CTS" />}
            {st.rtsCts && reach && <Arrow from={[AP.x, AP.y]} to={[st.c.x, st.c.y]} tone="violet" />}
            <Points data={[{ x: AP.x, y: AP.y, tone: 'muted', r: 7, ring: hidden && !st.rtsCts ? 'bad' : st.rtsCts && reach ? 'violet' : undefined }]} labels={() => 'AP'} />
            <Points data={[{ x: st.a.x, y: st.a.y, tone: aTone, r: 7 }]} labels={() => 'A'} onDrag={(_, p) => setSt((s) => ({ ...s, a: clampPoint(p) }))} pointLabel={() => 'Station A'} />
            <Points data={[{ x: st.c.x, y: st.c.y, tone: cTone, r: 7 }]} labels={() => 'C'} onDrag={(_, p) => setSt((s) => ({ ...s, c: clampPoint(p) }))} pointLabel={() => 'Station C'} />
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">both stations pick a start slot among the first 16; the probabilities are counted over all pairs</Provenance>
          <Provenance kind="illustrative">positions, ranges and frame lengths are made up; real range depends on power, walls and rate</Provenance>
          <Provenance kind="toy">RTS and CTS take 2 slots each here; real timings differ, and the overhead is a fixed number of slots</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
