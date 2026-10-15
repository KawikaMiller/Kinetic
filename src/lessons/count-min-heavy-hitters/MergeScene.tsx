import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { mergeCaption } from './captions';
import { MERGE_DEPTH, MERGE_MAX_WIDTH, MERGE_N, MERGE_WIDTH, PARTITIONS, mergeRun } from './merge';
import { MAX_DEPTH, MIN_DEPTH, estimate } from './sketch';
import { DEFAULT_SEED, DEFAULT_SKEW, MIN_SCENE_WIDTH, TOP_K, exactCounts, exactTop, itemName, keyOfRank, zipfStream } from './stream';


export function MergeScene({ picker }: { picker: ReactNode }) {
  const [w, setW] = useState(MERGE_WIDTH);
  const [d, setD] = useState(MERGE_DEPTH);
  const [sameSeeds, setSameSeeds] = useState(true);
  const [seed, setSeed] = useState(DEFAULT_SEED);

  const stream = useMemo(() => zipfStream(MERGE_N, DEFAULT_SKEW, seed), [seed]);
  const run = useMemo(() => mergeRun(stream, w, d, seed, sameSeeds), [stream, w, d, seed, sameSeeds]);
  const counts = useMemo(() => exactCounts(stream), [stream]);
  const top = exactTop(counts, TOP_K);

  useIntroCaption(mergeCaption({ run, sameSeeds, items: stream.length }), [run]);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Merged = combined" value={run.equal ? '✓ every cell' : '✗ differs'} color={run.equal ? 'var(--ok)' : 'var(--bad)'} sub={`${run.differingCells} of ${run.merged.counts.length} cells differ`} />
          <Stat label="Records per partition" value={run.parts.map((p) => p.total).join(' + ')} sub={`${stream.length.toLocaleString('en-US')} in all`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the truth, or a merged estimate that matches the combined sketch', shape: 'square' },
            { color: 'var(--bad)', label: 'a merged estimate that is wrong', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Hash seeds" value={!sameSeeds} onChange={(different) => setSameSeeds(!different)} off="The same in every partition" on="Different per partition" />
          <Slider label="Width w" value={w} min={MIN_SCENE_WIDTH} max={MERGE_MAX_WIDTH} onChange={setW} />
          <Slider label="Depth d" value={d} min={MIN_DEPTH} max={MAX_DEPTH} onChange={setD} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <Box>
          <SectionTitle hint={`${PARTITIONS} partitions, records spread round-robin, one sketch each`}>Estimates of the five biggest items</SectionTitle>
          <table className="data-table cm-table">
            <thead>
              <tr><th scope="col">Item</th><th scope="col">True</th><th scope="col">Sketch of everything</th><th scope="col">Sum of the partition sketches</th></tr>
            </thead>
            <tbody>
              {top.map((r) => {
                const combined = estimate(run.combined, keyOfRank(r));
                const merged = estimate(run.merged, keyOfRank(r));
                return (
                  <tr key={r}>
                    <td>{itemName(r)}</td>
                    <td className="cm-true">{counts[r]}</td>
                    <td>{combined}</td>
                    <td className={merged === combined ? 'cm-true' : 'cm-wrong'}>{merged}{merged < counts[r] ? ' (below the truth)' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a seeded Zipf stream of {MERGE_N.toLocaleString('en-US')} items, split round-robin</Provenance>
          <Provenance kind="toy">three partitions stand in for the partitions of a topic; no brokers or consumers are simulated</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
