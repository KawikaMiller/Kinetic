import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { pctText, sig } from '../../core/format';
import { HOT_SHARE, READ_SHARE, SHARDS, SKETCH_DEPTH, SKETCH_WIDTH, SPLIT_M, UTILISATION } from './skew';
import { detectView, initialDetect } from './init';

const WIDTHS = [4, 8, 16, 32, 64, 128, 256, 512].filter((w) => w >= SKETCH_WIDTH.min && w <= SKETCH_WIDTH.max);

export function DetectScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialDetect);
  const v = useMemo(() => detectView(s), [s]);
  const d = v.detection;
  const keys = [...new Set([...d.hot, ...d.flagged])].sort((a, b) => a - b);

  return (
    <StageFrame
      height={420}
      intro={
        <>
          A count-min sketch of {d.cells} counters ({SKETCH_DEPTH} rows of {s.width}) watched the stream and flagged {d.flagged.length} keys. {d.missed.length > 0 ? <>It <span className="hl bad">missed</span> the hot {d.missed.length === 1 ? 'key' : 'keys'} {d.missed.join(', ')}.</> : <>It found every key above {pctText(HOT_SHARE, 0)} of the traffic.</>} Salting only what it flagged leaves the busiest shard at {sig(v.flaggedLoads.maxOverMean)} times the plain mean (requests / {SHARDS}); salting the true hot keys gives {sig(v.trueLoads.maxOverMean)}.
        </>
      }
      introKey={[s.width, s.hashSeed]}
      stats={
        <Stats>
          <Stat label="Sketch memory" value={d.cells} sub={`${SKETCH_DEPTH} rows x ${s.width} counters`} />
          <Stat label="True hot keys" value={d.hot.length} sub={`each at least ${pctText(HOT_SHARE, 0)} of the traffic`} />
          <Stat label="Missed" value={d.missed.length} color={d.missed.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub="hot keys the sketch did not flag" />
          <Stat label="False alarms" value={d.falseAlarms.length} color={d.falseAlarms.length > 0 ? 'var(--orange)' : undefined} sub="flagged, yet not hot" />
          <Stat label="Hottest shard / plain mean" value={sig(v.flaggedLoads.maxOverMean)} sub={`${sig(v.trueLoads.maxOverMean)} if the true hot keys were salted`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a hot key the sketch flagged' },
            { color: 'var(--dim)', label: 'a hot key it missed (struck through)' },
            { color: 'var(--orange)', label: 'a key flagged that is not hot (a collision)' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Slider label="Sketch width" value={WIDTHS.indexOf(s.width)} min={0} max={WIDTHS.length - 1} format={(i) => `${WIDTHS[i]} (${WIDTHS[i] * SKETCH_DEPTH} counters)`} onChange={(i) => setS((x) => ({ ...x, width: WIDTHS[i] }))} />
          <SeedField seed={s.hashSeed} onSeed={(hashSeed) => setS((x) => ({ ...x, hashSeed }))} label="Hash seed" />
          <Button onClick={() => setS(initialDetect())}>Reset</Button>
        </>
      }
    >
      <div className="hk-stage stage-pad">
        <Box>
          <SectionTitle hint="the keys that matter: the truly hot ones and whatever the sketch flagged">Hot keys against flagged keys</SectionTitle>
          <ul className="hk-keys">
            {keys.map((k) => {
              const hot = d.hot.includes(k);
              const flagged = d.flagged.includes(k);
              return (
                <li key={k} className={hot && flagged ? 'is-found' : hot ? 'is-missed' : 'is-false'}>
                  user:{k} {hot && flagged ? 'hot, flagged' : hot ? 'hot, missed' : 'flagged, not hot'}
                </li>
              );
            })}
          </ul>
          <p className="hk-note">Only flagged keys are salted, so a missed hot key keeps melting its shard. A smaller sketch collides more: cold keys inherit counts from hot ones and push real hot keys out of the candidate list. The shard figures salt the keys with {SPLIT_M.max} suffixes, at {pctText(READ_SHARE.default, 0)} reads and {pctText(UTILISATION.default, 0)} total utilisation.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">the count-min sketch and candidate list of the heavy-hitters lesson, run on a seeded stream of 20,000 requests</Provenance>
          <Provenance kind="illustrative">a key is hot at {pctText(HOT_SHARE, 0)} of the traffic, a threshold chosen for this lesson; the candidate list holds 6 keys</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
