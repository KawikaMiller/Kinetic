import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, ClaimLabel } from '../../components/ui';
import { pct } from '../../core/format';
import type { Tone } from '../../core/tone';
import { ratesIntro, withoutSlow } from './captions';
import { initialRates, setSlow, type RatesState } from './init';
import { COUNT_RANGE, FAST_RATE, FRAME_BYTES, OVERHEAD_US, SLOW_RATE, ratesFor, shares } from './rates';

const STATION_TONES: readonly Tone[] = ['amber', 'pink', 'sky', 'orange'];

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--amber)', label: 'each bar is a station, in its own plain tone (amber, pink, blue, orange)' },
      { color: 'var(--bad)', label: 'the throughput every station is held to when one is slow' },
    ]}
  />
);

export function RateScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<RatesState>(initialRates);
  const rates = useMemo(() => ratesFor(st.count, st.slow), [st]);
  const sh = useMemo(() => shares(rates), [rates]);
  const without = useMemo(() => withoutSlow(rates), [rates]);
  const slowCount = rates.filter((r) => r === SLOW_RATE).length;

  return (
    <StageFrame
      height={520}
      legend={LEGEND}
      intro={ratesIntro(rates, sh, without)}
      introKey={[rates.join(','), st.count]}
      stats={
        <Stats>
          <Stat label="Each station gets" value={`${sh.stations[0].mbps.toFixed(1)} Mbit/s`} color={slowCount > 0 && slowCount < rates.length ? 'var(--bad)' : undefined} sub="one frame per round, the same for all" />
          <Stat label="All stations together" value={`${sh.totalMbps.toFixed(1)} Mbit/s`} sub={without ? `${without.totalMbps.toFixed(1)} Mbit/s without the slow ones` : 'every station at the same rate'} />
          <Stat label="One round lasts" value={`${Math.round(sh.roundUs)} µs`} sub={`${FRAME_BYTES}-byte frames, ${OVERHEAD_US} µs of overhead each`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Stations" value={st.count} min={COUNT_RANGE.min} max={COUNT_RANGE.max} onChange={(count) => setSt((s) => ({ ...s, count }))} />
        </>,
        <>
          <ControlGroup label="Slow (6 Mbit/s)" inline>
            {Array.from({ length: st.count }, (_, i) => (
              <ChipButton key={i} tone="info" on={st.slow[i]} onClick={() => setSt((s) => setSlow(s, i, !s.slow[i]))}>
                {`S${i + 1}: ${st.slow[i] ? SLOW_RATE : FAST_RATE} Mbit/s`}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setSt(initialRates())}>Reset</Button>
        </>,
      ]}
    >
      <div className="wf-stage stage-pad">
        <Box>
          <SectionTitle hint="share of the air each station holds in a round, and what it gets">Airtime and throughput per station</SectionTitle>
          <div className="wf-bars">
            {sh.stations.map((s, i) => (
              <div key={i} className="wf-bar-row">
                <span className="wf-bar-name">S{i + 1}</span>
                <Bar value={s.airtime} max={1} tone={STATION_TONES[i % STATION_TONES.length]} ariaLabel={`Station ${i + 1} at ${s.rate} Mbit/s holds ${pct(s.airtime)} of the air`} />
                <span className="wf-bar-text">
                  {s.rate} Mbit/s: {pct(s.airtime)} of the air, {s.mbps.toFixed(1)} Mbit/s
                </span>
              </div>
            ))}
          </div>
          <p className="wf-note">
            <ClaimLabel kind="research">the rate anomaly of Heusse et al., 2003, from memory: verify</ClaimLabel>
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">the rates 6 and 54 Mbit/s and the 100 µs of overhead per frame are made up</Provenance>
          <Provenance kind="simulated">computed from frame time = size / rate + overhead, one frame per station per round</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
