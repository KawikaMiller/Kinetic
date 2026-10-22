import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider } from '../../components/ui';
import { SAFETY } from './abr';
import { ladderCaption } from './captions';
import { useChartWidth } from './chartMath';
import { initialLadder } from './init';
import { LADDERS, LADDER_SIZES, POPULATION_SEED, SLOW_SHARE, TITLE_SECONDS, VIEWERS, evaluate, population, type LadderSize } from './ladder';

const SIZE_OPTIONS = LADDER_SIZES.map((n) => ({ value: n, label: `${n} ${n === 1 ? 'rendition' : 'renditions'}` }));
const BANDWIDTH_DOMAIN: [number, number] = [0.1, 100];
const CURVE_POINTS = 120;
const MAX_STORAGE_GB = 12;
const MAX_BITRATE = 5;

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'viewers who can play at all' },
      { color: 'var(--info)', label: 'average bitrate they get' },
      { color: 'var(--bad)', label: 'storage per title: the cost of more renditions' },
      { color: 'var(--violet)', label: 'the bandwidth a rung needs, on the chart' },
    ]}
  />
);

export function LadderScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialLadder);
  const bws = useMemo(() => population(POPULATION_SEED, st.slow), [st.slow]);
  const results = useMemo(() => LADDER_SIZES.map((n) => evaluate(n, bws)), [bws]);
  const sorted = useMemo(() => [...bws].sort((a, b) => a - b), [bws]);
  const width = useChartWidth();
  const curve = useMemo(
    () =>
      Array.from({ length: CURVE_POINTS }, (_, i): [number, number] => {
        const p = (i + 1) / CURVE_POINTS;
        const x = sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
        return [Math.min(BANDWIDTH_DOMAIN[1], Math.max(BANDWIDTH_DOMAIN[0], x)), p];
      }),
    [sorted],
  );

  return (
    <StageFrame
      height={660}
      legend={LEGEND}
      intro={ladderCaption(results, st.slow)}
      introKey={`${st.slow}`}
      controls={[
        <>
          {picker}
          <Slider label="Viewers on slow connections" value={st.slow} min={SLOW_SHARE.min} max={SLOW_SHARE.max} step={SLOW_SHARE.step} format={(n) => `${n}%`} onChange={(slow) => setSt((s) => ({ ...s, slow }))} />
          <Segmented<LadderSize> label="Mark the rungs of" value={st.size} options={SIZE_OPTIONS} onChange={(size) => setSt((s) => ({ ...s, size }))} />
        </>,
      ]}
    >
      <div className="abr-stage stage-pad">
        <Box>
          <SectionTitle hint={`${VIEWERS.toLocaleString('en-US')} seeded viewers; a rung plays for a viewer whose bandwidth is above its bitrate divided by ${SAFETY}`}>One file cannot fit everyone</SectionTitle>
          <Plot2D x={{ domain: BANDWIDTH_DOMAIN, log: true, label: 'viewer bandwidth (Mbit/s)' }} y={{ domain: [0, 1], label: 'share of viewers below' }} width={width} height={220} ariaLabel="The share of viewers at or below each bandwidth, with the bandwidth each rung of the chosen ladder needs marked">
            <Curve points={curve} tone="info" />
            {LADDERS[st.size].map((b) => <VLine key={b} at={b / SAFETY} tone="violet" label={`${b}`} />)}
          </Plot2D>
        </Box>
        <Box>
          <SectionTitle hint="the same viewers, three ladders">What each ladder gives and costs</SectionTitle>
          <div className="abr-ladders">
            {results.map((r) => (
              <div key={r.size} className="abr-ladder">
                <b>{r.size} {r.size === 1 ? 'rendition' : 'renditions'}: {LADDERS[r.size].join(', ')} Mbit/s</b>
                <div className="abr-bar-row">
                  <span className="abr-bar-name">can play</span>
                  <Bar value={r.share} max={1} tone="ok" ariaLabel={`${Math.round(r.share * 100)}% of viewers can play`} />
                  <span className="abr-bar-text">{Math.round(r.share * 100)}% of viewers ({r.canPlay.toLocaleString('en-US')})</span>
                </div>
                <div className="abr-bar-row">
                  <span className="abr-bar-name">average bitrate</span>
                  <Bar value={r.avgBitrate} max={MAX_BITRATE} tone="info" ariaLabel={`average bitrate ${r.avgBitrate.toFixed(2)} Mbit/s`} />
                  <span className="abr-bar-text">{r.avgBitrate.toFixed(2)} Mbit/s</span>
                </div>
                <div className="abr-bar-row">
                  <span className="abr-bar-name">storage</span>
                  <Bar value={r.storageGb} max={MAX_STORAGE_GB} tone="bad" ariaLabel={`${r.storageGb.toFixed(1)} GB per title`} />
                  <span className="abr-bar-text">{r.storageGb.toFixed(2)} GB for a {TITLE_SECONDS / 3600}-hour title</span>
                </div>
              </div>
            ))}
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={POPULATION_SEED}>a seeded population of {VIEWERS.toLocaleString('en-US')} viewers</Provenance>
          <Provenance kind="illustrative">the bandwidth mix (slow viewers around 1 Mbit/s, fast ones around 8), the ladders and the storage sums are made up; per-title encoding is out of scope</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
