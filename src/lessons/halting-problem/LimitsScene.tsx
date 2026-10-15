import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { ANALYSER_RANGE, analyseAll, DEFAULT_ANALYSER_LIMIT, type AnalyserRow } from './analyser';
import { limitsCaption } from './captions';
import { cutoffPhrase, truthPhrase } from './phrases';

const VERDICT_TONE = { yes: 'ok', no: 'bad', maybe: 'dim' } as const;
const VERDICT_TEXT = { yes: 'yes: it halts', no: 'no: it loops', maybe: 'maybe' } as const;

const why = (r: AnalyserRow, limit: number) =>
  r.verdict === 'yes' ? 'a run reached a halting state' : r.verdict === 'no' ? 'a run repeated a configuration' : `it ${cutoffPhrase(limit)}`;

/** Scene 4: what the theorem does not say. A bounded check always answers; a sound analyser answers yes, no or maybe. */
export function LimitsScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [limit, setLimit] = useState(DEFAULT_ANALYSER_LIMIT);
  const rows = useMemo(() => analyseAll(limit), [limit]);
  const count = (v: AnalyserRow['verdict']) => rows.filter((r) => r.verdict === v).length;

  useEffect(() => {
    setCaption(limitsCaption(rows, limit), { quiet: true });
  }, [setCaption, rows, limit]);

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Yes: halts" value={count('yes')} color="var(--ok)" />
          <Stat label="No: loops" value={count('no')} color="var(--bad)" />
          <Stat label="Maybe" value={count('maybe')} color="var(--dim)" sub="did not settle within the limit" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'yes, because a run halted', shape: 'square' },
            { color: 'var(--bad)', label: 'no, because a configuration repeated (certified)', shape: 'square' },
            { color: 'var(--dim)', label: 'maybe: not proved either way', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Analyser limit, steps" value={limit} min={ANALYSER_RANGE.min} max={ANALYSER_RANGE.max} onChange={setLimit} />
        </>,
      ]}
    >
      <div className="hp stage-pad">
        <div className="hp-scroll" role="region" aria-label="Analyser results" tabIndex={0}>
          <table className="hp-table">
            <thead>
              <tr><th scope="col">Machine</th><th scope="col">The analyser says</th><th scope="col">What it really does</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td data-label="The analyser says"><span className={`hp-verdict tone-${VERDICT_TONE[r.verdict]}`}>{VERDICT_TEXT[r.verdict]}</span> {why(r, limit)}</td>
                  <td data-label="What it really does">{truthPhrase(r.truth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint tone="muted">Raise the limit and the maybes turn into answers. The walk-right machine stays a maybe at every limit: its recorded argument settles it, and this analyser does not read arguments.</Hint>
        <div className="hp-cards-row">
          <Box>
            <SectionTitle>What the theorem says</SectionTitle>
            <p className="hp-note">No single program decides, for every program and every input, whether the run halts. That is a statement about one program having to be right on all of them.</p>
          </Box>
          <Box>
            <SectionTitle>What it does not say</SectionTitle>
            <p className="hp-note">It does not say that you cannot analyse many programs, or that a particular program’s halting can’t be shown. Linters and static analysers answer yes, no or maybe: sound, but incomplete. A bounded question, such as halting within 1,000 steps, is always decidable by running.</p>
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">a toy analyser over the eight library machines, not a real static analyser</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
