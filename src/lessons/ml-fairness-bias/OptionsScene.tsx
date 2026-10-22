import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { NA } from '../../core/format';
import { optionCaption, pctText } from './captions';
import { DataControls } from './DataControls';
import { CRITERIA, RANGES, holds, type Params } from './model';
import { OPENING } from './opening';
import { runOptions, whoLine, type OptionId } from './options';

const pts = (x: number) => (Number.isNaN(x) ? NA : (x * 100).toFixed(1));
const SHORT: Record<OptionId, string> = { one: 'One threshold', tpr: 'Equal true-positive rate', selection: 'Equal approval rate', reweigh: 'Reweigh', unaware: 'Drop the group column' };

/** Scene 3: five responses to a gap, each computed on the same data, every trade-off shown. */
export function OptionsScene({ picker }: { picker: ReactNode }) {
  const [params, setParams] = useState<Params>(OPENING.options.params);
  const [picked, setPicked] = useState<OptionId>(OPENING.options.picked);
  const { options } = useMemo(() => runOptions(params), [params]);
  const base = options[0];
  const chosen = options.find((o) => o.id === picked)!;

  return (
    <StageFrame
      height={760}
      intro={optionCaption(base, chosen)}
      introKey={[JSON.stringify(params), picked]}
      stats={
        <Stats>
          <Stat label="Accuracy" value={pctText(chosen.accuracy)} sub={`the plain scorer ${pctText(base.accuracy)}`} />
          <Stat label="Approval gap" value={`${pts(chosen.gaps.selection)} pts`} color={holds(chosen.gaps.selection) ? 'var(--ok)' : 'var(--bad)'} sub={`group A ${pctText(chosen.a.selection)}, group B ${pctText(chosen.b.selection)}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a gap within 3 points' }, { color: 'var(--bad)', label: 'a gap above 3 points' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Option" options={options.map((o) => ({ value: o.id, label: SHORT[o.id] }))} value={picked} onChange={setPicked} />
        </>,
        <>
          <DataControls params={params} onChange={setParams} />
          <Slider label="Proxy strength (a second feature that reveals the group)" value={params.proxy} {...RANGES.proxy} format={(v) => v.toFixed(1)} onChange={(proxy) => setParams({ ...params, proxy })} />
        </>,
      ]}
    >
      <div className="fb-stage stage-pad">
        <div className="fb-scroll">
          <table className="data-table fb-table fb-options">
            <caption>Every option on the same data, none marked as the default (gaps in percentage points)</caption>
            <thead>
              <tr><th>Option</th><th>Accuracy</th><th>Approved A / B</th>{CRITERIA.map((c) => <th key={c.id}>{c.label} gap</th>)}</tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr key={o.id} className={o.id === picked ? 'fb-picked' : undefined}>
                  <td>{o.label}</td><td>{pctText(o.accuracy)}</td><td>{pctText(o.a.selection)} / {pctText(o.b.selection)}</td>
                  {CRITERIA.map((c) => <td key={c.id} className={holds(o.gaps[c.id]) ? 'fb-yes' : 'fb-no'}>{pts(o.gaps[c.id])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fb-who">
          <b>{chosen.label}</b>
          <span>How it works: {chosen.how}.</span>
          <span>Who gains and who pays, against the plain scorer: {whoLine(base, chosen)}</span>
        </div>
        {picked === 'unaware' && (
          <Hint tone="muted" block>
            With the proxy at {params.proxy.toFixed(1)}, the model that never sees the group has an approval gap of {pts(chosen.gaps.selection)} points; the plain scorer, which does see it, has {pts(base.gaps.selection)}.
          </Hint>
        )}
        <Hint tone="muted" block>
          Disparate treatment and disparate impact are legal concepts of one jurisdiction, not engineering definitions, and nothing here is legal advice.
        </Hint>
        <ProvenanceRow>
          <ClaimLabel kind="research">post-processing to equal true-positive rates is from Hardt, Price and Srebro (2016); reweighing is from Kamiran and Calders: both from memory, verify before naming them</ClaimLabel>
          <ClaimLabel kind="view">no option is recommended as a default: each shows who gains and who pays, and the choice is a values and legal question</ClaimLabel>
          <Provenance kind="invented">synthetic applicants in two neutral groups</Provenance>
          <Provenance kind="toy">simple logistic scorers on one seeded data set</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
