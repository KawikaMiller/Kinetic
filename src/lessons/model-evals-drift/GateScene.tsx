import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { gateCaption, pct1 } from './captions';
import { SEGMENTS, SEGMENT_LABEL, SLICE_LIMIT_POINTS, TEST_SIZES, VERSIONS, evaluate, gate } from './gate';
import { GATE_DEFAULT } from './settings';

export function GateScene({ picker }: { picker: ReactNode }) {
  const [sizeIndex, setSizeIndex] = useState<number>(GATE_DEFAULT.sizeIndex);
  const [strict, setStrict] = useState(GATE_DEFAULT.rule === 'slices');
  const rule = strict ? 'slices' : 'overall';
  const n = TEST_SIZES[sizeIndex];
  const e = useMemo(() => evaluate(n), [n]);
  const verdict = gate(e, rule);
  const within = e.interval.lo <= 0 && e.interval.hi >= 0;
  const caption = gateCaption(e, rule, verdict);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="v2 minus v1" value={`${e.difference >= 0 ? '+' : ''}${e.difference.toFixed(1)} pts`} color={within ? 'var(--orange)' : e.difference > 0 ? 'var(--ok)' : 'var(--bad)'} sub={[`95% interval ${e.interval.lo.toFixed(1)} to ${e.interval.hi.toFixed(1)}`, within ? 'includes 0: within noise' : 'excludes 0']} />
          <Stat label="Release gate" value={verdict.ship ? 'ships v2' : 'blocks v2'} color={verdict.ship ? 'var(--ok)' : 'var(--bad)'} sub={verdict.reason} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'segment A and an interval that includes 0', shape: 'square' },
            { color: 'var(--info)', label: 'segment B', shape: 'square' },
            { color: 'var(--ok)', label: 'ships', shape: 'square' },
            { color: 'var(--bad)', label: 'blocks, or a slice that regressed', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Test examples" value={sizeIndex} min={0} max={TEST_SIZES.length - 1} onChange={setSizeIndex} format={(i) => TEST_SIZES[i].toLocaleString('en-US')} />
          <Toggle label="Release gate" value={strict} onChange={setStrict} off="Block only if worse overall" on={`Block if any slice falls over ${SLICE_LIMIT_POINTS} points`} />
        </>,
      ]}
    >
      <div className="med-stage stage-pad">
        <Box>
          <SectionTitle hint="the same held-out test set, first n examples">Accuracy overall and by slice</SectionTitle>
          <table className="med-table table-cards">
            <thead>
              <tr><th>Slice</th><th>Examples</th>{VERSIONS.map((v) => <th key={v.id}>{v.label}</th>)}<th>v2 minus v1</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Overall</th><td data-label="Examples">{e.n}</td>
                {VERSIONS.map((v) => <td key={v.id} data-label={v.label}>{pct1(e.accuracy[v.id])}</td>)}
                <td data-label="v2 minus v1" className={e.difference >= 0 ? 'med-up' : 'med-down'}>{e.difference >= 0 ? '+' : ''}{e.difference.toFixed(1)}</td>
              </tr>
              {SEGMENTS.map((s) => {
                const diff = (e.slice[s].accuracy.v2 - e.slice[s].accuracy.v1) * 100;
                return (
                  <tr key={s}>
                    <th scope="row" className={s === 'A' ? 'med-a' : 'med-b'}>{SEGMENT_LABEL[s]}</th><td data-label="Examples">{e.slice[s].n}</td>
                    {VERSIONS.map((v) => <td key={v.id} data-label={v.label}>{pct1(e.slice[s].accuracy[v.id])}</td>)}
                    <td data-label="v2 minus v1" className={diff >= 0 ? 'med-up' : 'med-down'}>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Hint tone="muted" block>{VERSIONS.map((v) => `${v.label}: ${v.note}`).join('. ')}. Both are toy logistic models. Evaluating an LLM (golden sets, a judge model) is named here only: no real LLM evaluation is shown.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">toy logistic regression on seeded blobs</Provenance>
          <Provenance kind="illustrative">invented user segments; the {SLICE_LIMIT_POINTS}-point slice limit is illustrative</Provenance>
          <Provenance kind="simulated">bootstrap: 1,000 seeded resamples of the paired difference</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
