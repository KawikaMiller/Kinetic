import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal } from '../../core/format';
import { combinerCaption } from './captions';
import { COMBINER_MAPPERS, COMBINER_REDUCERS, COMBINER_WORDS } from './facts';
import { initialCombinerScene, switchJob } from './init';
import { JOBS, plan, reference, sameResult, type CombinerId, type JobId } from './job';

const COMBINER_OPTIONS: Record<JobId, { value: CombinerId; label: string }[]> = {
  wordcount: [{ value: 'off', label: 'No combiner' }, { value: 'sum', label: 'Add the counts' }],
  avglen: [{ value: 'off', label: 'No combiner' }, { value: 'naive', label: 'Average on the mapper' }, { value: 'sum', label: 'Carry (sum, count)' }],
};

const planFor = (job: JobId, combiner: CombinerId) => plan({ words: COMBINER_WORDS, mappers: COMBINER_MAPPERS, reducers: COMBINER_REDUCERS, job, combiner });

export function CombinerScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCombinerScene);
  const { job, combiner } = state;

  const without = useMemo(() => planFor(job, 'off'), [job]);
  const chosen = useMemo(() => planFor(job, combiner), [job, combiner]);
  const truth = useMemo(() => reference(job, COMBINER_WORDS), [job]);
  const rows = [...truth].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const wrong = rows.filter(([k, v]) => Math.abs((chosen.result.get(k) ?? NaN) - v) > 1e-9).map(([k]) => k);
  const first = wrong.length > 0 ? { key: wrong[0], truth: truth.get(wrong[0])!, naive: chosen.result.get(wrong[0])! } : null;
  const saved = without.shuffled - chosen.shuffled;
  const exact = sameResult(chosen.result, truth);

  useIntroCaption(combinerCaption(job, combiner, without.shuffled, chosen.shuffled, wrong, first), [job, combiner]);

  const setJob = (j: JobId) => setState(switchJob(j));
  const partials = first ? chosen.mapOut.map((out) => out.find((r) => r.key === first.key)) : [];
  const truePartials = first ? planFor(job, 'sum').mapOut.map((out) => out.find((r) => r.key === first.key)) : [];

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Records shuffled" value={chosen.shuffled} color="var(--info)" sub={combiner === 'off' ? 'every map output record' : `${without.shuffled} without a combiner`} />
          <Stat label="Saved" value={saved} color={saved > 0 ? 'var(--ok)' : undefined} sub="records that never cross the shuffle" />
          <Stat label="Answer" value={exact ? 'exact' : `${wrong.length} wrong`} color={exact ? 'var(--ok)' : 'var(--bad)'} sub="against a plain computation" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'records still shuffled', shape: 'square' },
            { color: 'var(--ok)', label: 'records saved by the combiner', shape: 'square' },
            { color: 'var(--bad)', label: 'a wrong answer', shape: 'square' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Segmented label="Job" value={job} onChange={setJob} options={JOBS.map((j) => ({ value: j.id, label: j.label }))} />
          <Segmented label="Combiner" value={combiner} onChange={(c) => setState((s) => ({ ...s, combiner: c }))} options={COMBINER_OPTIONS[job]} />
        </>
      }
    >
      <div className="mr-stage stage-pad">
        <Box>
          <SectionTitle hint={`${COMBINER_WORDS.length} words, ${COMBINER_MAPPERS} mappers, ${COMBINER_REDUCERS} reducers`}>Records crossing the shuffle</SectionTitle>
          <Bar
            segments={[{ value: chosen.shuffled, tone: 'info' }, { value: saved, tone: 'ok' }]}
            max={without.shuffled}
            height={14}
            label={`${chosen.shuffled} of ${without.shuffled} records still shuffled`}
            ariaLabel={`${chosen.shuffled} records shuffled, ${saved} saved`}
          />
          <p className="mr-note">A combiner is a local reduce on each mapper before the shuffle. It is valid only when the reduce is associative and commutative: adding is, and averaging is not unless each record carries (sum, count).</p>
        </Box>
        <Box>
          <SectionTitle hint="every key, from the reducers and from a plain loop">The answer</SectionTitle>
          <div className="mr-scroll" role="region" aria-label="Job result against the plain answer" tabIndex={0}>
            <table className="data-table mr-table">
              <thead>
                <tr><th scope="col">Key</th><th scope="col">MapReduce</th><th scope="col">Plain</th><th scope="col">Equal</th></tr>
              </thead>
              <tbody>
                {rows.map(([k, v]) => {
                  const got = chosen.result.get(k);
                  const ok = got !== undefined && Math.abs(got - v) < 1e-9;
                  return (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td className={ok ? '' : 'mr-bad'}>{got === undefined ? '–' : decimal(got, 3)}</td>
                      <td>{decimal(v, 3)}</td>
                      <td className={ok ? 'mr-ok' : 'mr-bad'}>{ok ? '✓' : '✗'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Box>
        {first && job === 'avglen' && (
          <Box>
            <SectionTitle hint={`key "${first.key}", the first that goes wrong`}>What each mapper sent</SectionTitle>
            <ul className="mr-partials">
              {partials.map((rec, i) => (
                <li key={i}>
                  map {i + 1} sends <b>{rec ? decimal(rec.sum, 3) : 'nothing'}</b> as one value, but it averaged <b>{truePartials[i] ? truePartials[i]!.count : 0}</b> words
                </li>
              ))}
            </ul>
            <p className="mr-note">The reducer treats those averages as equal votes: {decimal(first.naive, 3)} instead of {decimal(first.truth, 3)}.</p>
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="real">the records, the combiners and both answers are computed from the paragraph, not typed</Provenance>
          <Provenance kind="toy">one fixed paragraph and two mappers of unequal size: when every mapper holds the same number of values for a key the averaging mistake cancels out</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
