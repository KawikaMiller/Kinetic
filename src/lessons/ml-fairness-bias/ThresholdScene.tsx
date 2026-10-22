import { useMemo, useState, type ReactNode } from 'react';
import { ConfusionMatrix } from '../../components/ConfusionMatrix';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { NA } from '../../core/format';
import { pctText, thresholdCaption } from './captions';
import { DataControls } from './DataControls';
import { CRITERIA, GROUPS, HOLD_TOLERANCE, calibrationError, fitModel, gapsOf, generate, groupStats, holds, predict, reliability, type Group, type Params } from './model';
import { OPENING } from './opening';

const LABELS = { positive: 'repaid', negative: 'defaulted' };
const TONES = ['amber', 'sky'] as const;
const rate = (x: number) => (Number.isNaN(x) ? NA : pctText(x));

/** Scene 1: one threshold, two groups: every standard criterion computed live from the rows. */
export function ThresholdScene({ picker }: { picker: ReactNode }) {
  const [params, setParams] = useState<Params>(OPENING.threshold.params);
  const [t, setT] = useState(OPENING.threshold.t);
  const { rows, probs } = useMemo(() => {
    const data = generate(params);
    return { rows: data, probs: predict(fitModel(data, 'aware'), data) };
  }, [params]);
  const stats = [groupStats(rows, probs, t, 0), groupStats(rows, probs, t, 1)] as const;
  const gaps = gapsOf(stats[0], stats[1]);
  const cal = ([0, 1] as Group[]).map((g) => calibrationError(rows, probs, g));
  const calHolds = cal.every((c) => c <= HOLD_TOLERANCE);
  const bins = ([0, 1] as Group[]).map((g) => reliability(rows, probs, g));

  return (
    <StageFrame
      height={820}
      intro={thresholdCaption(t, stats[0], stats[1], gaps, calHolds)}
      introKey={[JSON.stringify(params), t]}
      stats={
        <Stats>
          <Stat label="Group A approved" value={rate(stats[0].selection)} color="var(--amber)" sub={`${stats[0].n.toLocaleString('en-US')} applicants`} />
          <Stat label="Group B approved" value={rate(stats[1].selection)} color="var(--sky)" sub={`${stats[1].n.toLocaleString('en-US')} applicants`} />
          <Stat label="Criteria that hold" value={`${CRITERIA.filter((c) => holds(gaps[c.id])).length + (calHolds ? 1 : 0)} of ${CRITERIA.length + 1}`} sub="within 3 points" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'group A (a plain tone)' },
            { color: 'var(--sky)', label: 'group B (a plain tone)' },
            { color: 'var(--ok)', label: 'a criterion that holds; right answers in the matrix' },
            { color: 'var(--bad)', label: 'a criterion that does not hold; false alarms' },
            { color: 'var(--orange)', label: 'misses in the matrix' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Threshold (approve at or above)" value={t} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={setT} />
        </>,
        <>
          <DataControls params={params} onChange={setParams} />
        </>,
      ]}
    >
      <div className="fb-stage stage-pad">
        <div className="fb-matrices">
          {GROUPS.map((name, g) => (
            <section key={name} className={`fb-group fb-${TONES[g]}`} aria-label={`Group ${name}`}>
              <h3>Group {name}</h3>
              <ConfusionMatrix {...stats[g].confusion} labels={LABELS} metrics={false} />
            </section>
          ))}
        </div>
        <table className="data-table fb-table">
          <caption>Each criterion, computed on the rows (equal means within 3 points)</caption>
          <thead><tr><th>Criterion</th><th>Group A</th><th>Group B</th><th>Gap</th><th>Holds?</th></tr></thead>
          <tbody>
            {CRITERIA.map((c) => (
              <tr key={c.id}>
                <td>{c.label} <span className="fb-name">({c.name})</span></td>
                <td>{rate(stats[0][c.id])}</td><td>{rate(stats[1][c.id])}</td><td>{Number.isNaN(gaps[c.id]) ? NA : `${(gaps[c.id] * 100).toFixed(1)} pts`}</td>
                <td className={holds(gaps[c.id]) ? 'fb-yes' : 'fb-no'}>{Number.isNaN(gaps[c.id]) ? 'undefined' : holds(gaps[c.id]) ? 'holds' : 'does not hold'}</td>
              </tr>
            ))}
            <tr>
              <td>Calibration within groups</td>
              <td>{(cal[0] * 100).toFixed(1)} pts off</td><td>{(cal[1] * 100).toFixed(1)} pts off</td><td>{NA}</td>
              <td className={calHolds ? 'fb-yes' : 'fb-no'}>{calHolds ? 'holds' : 'does not hold'}</td>
            </tr>
          </tbody>
        </table>
        <Plot2D
          x={{ domain: [0, 1], ticks: 5, label: 'predicted chance of repaying' }}
          y={{ domain: [0, 1], ticks: 5, label: 'share who repaid' }}
          aspect="equal"
          ariaLabel="Reliability: predicted chance against the share who repaid, for each group"
        >
          <Curve fn={(x) => x} tone="dim" dashed />
          {([0, 1] as Group[]).map((g) => {
            const pts = bins[g].filter((b) => b.n > 0).map((b) => [b.meanPredicted, b.observed] as [number, number]);
            return (
              <g key={g}>
                <Curve points={pts} tone={TONES[g]} />
                <Points data={pts.map(([x, y]) => ({ x, y, tone: TONES[g] }))} r={3.5} />
              </g>
            );
          })}
        </Plot2D>
        <ProvenanceRow>
          <ClaimLabel kind="standard">the criteria definitions: demographic parity, equal opportunity, equalised odds, predictive parity and calibration within groups</ClaimLabel>
          <Provenance kind="invented">synthetic applicants in two neutral groups; no real group or data set</Provenance>
          <Provenance kind="toy">a simple scorer: real audits need real data, domain judgement and often legal advice</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
