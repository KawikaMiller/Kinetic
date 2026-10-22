import { useMemo, useState } from 'react';
import { Bars, HLine, Plot2D } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { calibrateCaption, percent, twoDp } from './captions';
import {
  CANDIDATES_EACH, HIRE_BAR, INTERVIEWERS, LENIENT, SIGMA_B, SIGMA_B_ANCHORED, SIGMA_Q, SINGLE_CANDIDATE_SKILL,
  correlationFormula, expectedSpread, interviewerRows, makeInterviewerDraws, passChance, spreadOf, totalSigma,
} from './model';
import type { SceneProps } from './opening';

const PLOT = { width: 356, height: 240 } as const;
const MEAN_DOMAIN = 3;
const TABLE_MIN_WIDTH = 440;
const INTERVIEWER_TICKS = Array.from({ length: INTERVIEWERS }, (_, i) => i + 1);
const DRAWS: readonly { label: string; leniency: number }[] = [
  { label: 'A lenient interviewer', leniency: LENIENT },
  { label: 'A neutral interviewer', leniency: 0 },
  { label: 'A strict interviewer', leniency: -LENIENT },
];

/** Scene 3: eight interviewers with their own leniency, the same candidate under three of them, and the rubric as an input. */
export function CalibrateScene({ picker, seed, onSeed }: SceneProps) {
  const [anchored, setAnchored] = useState(false);
  const sigmaB = anchored ? SIGMA_B_ANCHORED : SIGMA_B;
  const draws = useMemo(() => makeInterviewerDraws(seed), [seed]);
  const rows = useMemo(() => interviewerRows(draws, sigmaB), [draws, sigmaB]);
  const spread = spreadOf(rows);
  const poolMean = rows.reduce((s, r) => s + r.mean, 0) / rows.length;

  return (
    <StageFrame
      height={640}
      intro={calibrateCaption(rows, spread, anchored)}
      introKey={`${seed}|${anchored}`}
      stats={
        <Stats>
          <Stat label="Spread of interviewer means" value={twoDp(spread)} sub={`this seed; expected ${twoDp(expectedSpread(sigmaB))} at leniency spread ${sigmaB}`} />
          <Stat label="Leniency spread" value={sigmaB} sub={anchored ? 'anchored rubric: an input you set' : 'no rubric: an input you set'} />
          <Stat label="Bar" value={HIRE_BAR} sub={`the same for everyone; question noise ${SIGMA_Q}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: "an interviewer's mean score", shape: 'square' }, { color: 'var(--dim)', label: 'the average of the eight', shape: 'line' }]} />}
      controls={[
        <>{picker}<SeedField seed={seed} onSeed={onSeed} /></>,
        <>
          <Toggle label="Anchored rubric" value={anchored} onChange={setAnchored} off="No rubric" on="Anchored rubric" />
        </>,
      ]}
    >
      <div className="hi-stage stage-pad">
        <Hint tone="muted" block>
          {`Each of ${INTERVIEWERS} interviewers scores ${CANDIDATES_EACH} random candidates against the same bar of ${HIRE_BAR}. An anchored rubric is modelled as a smaller leniency spread (${SIGMA_B_ANCHORED} instead of ${SIGMA_B}). That is an input you set, not something the toy discovered: the toy cannot test whether rubrics work.`}
        </Hint>
        <Plot2D x={{ domain: [0.4, INTERVIEWERS + 0.6], label: 'interviewer', tickValues: INTERVIEWER_TICKS }} y={{ domain: [-MEAN_DOMAIN, MEAN_DOMAIN], label: 'mean score', ticks: 6 }} width={PLOT.width} height={PLOT.height} ariaLabel={`Mean score given by each of ${INTERVIEWERS} interviewers`}>
          <Bars bars={rows.map((r) => ({ x0: r.index - 0.4, x1: r.index + 0.4, y: r.mean }))} tone="info" base={0} />
          <HLine at={poolMean} label="average" tone="dim" />
        </Plot2D>
        <WideRegion minWidth={TABLE_MIN_WIDTH} noun="table">
          <table className="data-table hi-table">
            <caption>The {INTERVIEWERS} interviewers on {CANDIDATES_EACH} candidates each (seed {seed})</caption>
            <thead><tr><th>Interviewer</th><th>Leniency</th><th>Mean score</th><th>Share passed</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.index}><td>{r.index}</td><td>{r.leniency > 0 ? '+' : r.leniency < 0 ? '−' : ''}{twoDp(Math.abs(r.leniency))}</td><td>{twoDp(r.mean)}</td><td>{percent(r.passed)}</td></tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <WideRegion minWidth={TABLE_MIN_WIDTH} noun="table">
          <table className="data-table hi-table">
            <caption>The same candidate (true skill {SINGLE_CANDIDATE_SKILL}) under three draws of interviewer</caption>
            <thead><tr><th>Who they draw</th><th>Leniency</th><th>Chance of clearing the bar</th></tr></thead>
            <tbody>
              {DRAWS.map((d) => (
                <tr key={d.label}><td>{d.label}</td><td>{d.leniency > 0 ? '+' : d.leniency < 0 ? '−' : ''}{Math.abs(d.leniency)}</td><td>{percent(passChance(SINGLE_CANDIDATE_SKILL, d.leniency))}</td></tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <WideRegion minWidth={TABLE_MIN_WIDTH} noun="table">
          <table className="data-table hi-table">
            <caption>What the rubric input does to the correlation of scene 1 (it is arithmetic, not a finding)</caption>
            <thead><tr><th>Leniency spread</th><th>Error per interview</th><th>r, one interviewer</th><th>r, three</th></tr></thead>
            <tbody>
              {[SIGMA_B, SIGMA_B_ANCHORED].map((b) => (
                <tr key={b}><td>{b}</td><td>{twoDp(totalSigma(b))}</td><td>{twoDp(correlationFormula({ k: 1, sigma: totalSigma(b), rho: 0 }))}</td><td>{twoDp(correlationFormula({ k: 3, sigma: totalSigma(b), rho: 0 }))}</td></tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <ProvenanceRow>
          <Provenance kind="toy">a leniency per interviewer plus question noise; real interviewers differ in more ways than one number</Provenance>
          <Provenance kind="invented">the leniency spreads, the bar and the noise are made up</Provenance>
          <Provenance kind="simulated" seed={seed}>seeded draws of eight interviewers and {INTERVIEWERS * CANDIDATES_EACH} candidates</Provenance>
          <ClaimLabel kind="research">interviewers are reported to differ in how lenient they are, a commonly described rater effect</ClaimLabel>
          <Provenance kind="from-memory">no study is named; verify against a published review of rater effects in selection interviews</Provenance>
          <ClaimLabel kind="research">structured interviews, with the same questions for every candidate scored against a rubric, are reported to predict later job performance better than unstructured ones; this toy cannot test that</ClaimLabel>
          <Provenance kind="from-memory">no study is named; verify against a published meta-analysis of selection methods</Provenance>
          <ClaimLabel kind="view">writing the rubric before the first interview is advice many teams give, and one view</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
