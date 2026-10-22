import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { JOIN_LABEL, LABEL_TIMES, LOG, type JoinKind } from './join';
import { JOIN_OPENING, joinCaption, joinView, sameAuc } from './view';

const KINDS: { value: JoinKind; label: string }[] = [
  { value: 'point-in-time', label: 'point-in-time' },
  { value: 'latest', label: 'latest in the log' },
  { value: 'next', label: 'nearest after the label' },
];

const aucText = (x: number | null) => (x === null ? 'one class only' : x.toFixed(3));

/** Scene 2: a point-in-time-correct join against two leaky ones, and what the leak does to an offline metric. */
export function JoinScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState<number>(JOIN_OPENING.seed);
  const [kind, setKind] = useState<JoinKind>(JOIN_OPENING.kind);
  const view = useMemo(() => joinView(seed, kind), [seed, kind]);
  const correct = useMemo(() => joinView(seed, 'point-in-time').rows, [seed]);
  const { leak } = view;

  return (
    <StageFrame
      height={620}
      intro={joinCaption(view, kind)}
      introKey={`join|${seed}|${kind}`}
      stats={
        <Stats>
          <Stat label="AUC, leaky feature, offline" value={aucText(leak.leakyOffline)} color="var(--bad)" sub="counts purchases up to 7 days after the label">
            <Bar value={leak.leakyOffline ?? 0} max={1} tone="bad" height={8} ariaLabel={`AUC with the leaky feature ${aucText(leak.leakyOffline)}`} />
          </Stat>
          <Stat label="AUC, honest feature, offline" value={aucText(leak.correctOffline)} color="var(--ok)" sub="counts purchases up to the label time only">
            <Bar value={leak.correctOffline ?? 0} max={1} tone="ok" height={8} ariaLabel={`AUC with the honest feature ${aucText(leak.correctOffline)}`} />
          </Stat>
          <Stat label="AUC, online" value={aucText(leak.online)} sub={sameAuc(leak) ? 'the honest feature again: a positive-weight model keeps its ranking, so this is the same number, not a second check' : 'the leaky-trained model served with features that exist online'}>
            <Bar value={leak.online ?? 0} max={1} tone="info" height={8} ariaLabel={`Online AUC ${aucText(leak.online)}`} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the same as the point-in-time value', shape: 'square' },
            { color: 'var(--bad)', label: 'a value stamped after its label time (a leak)', shape: 'square' },
            { color: 'var(--hi)', label: 'the same row joined differently', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Join" value={kind} onChange={setKind} options={KINDS} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="fss-stage stage-pad">
        <div className="fss-panel">
          <h3 className="section-title">One user&apos;s feature log</h3>
          <table className="fss-table">
            <thead><tr><th scope="col">time</th><th scope="col">value from then</th></tr></thead>
            <tbody>{LOG.map((e) => <tr key={e.at}><td>{e.at}</td><td>{e.value}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="fss-panel">
          <h3 className="section-title">{JOIN_LABEL[kind]}</h3>
          <table className="fss-table">
            <thead><tr><th scope="col">label</th><th scope="col">joined</th><th scope="col">stamped</th><th scope="col">correct</th></tr></thead>
            <tbody>
              {view.rows.map((r, i) => {
                const right = correct[i].entry;
                const differs = (r.entry?.value ?? null) !== (right?.value ?? null);
                return (
                  <tr key={r.label} className={differs ? 'is-diff' : ''}>
                    <td>{LABEL_TIMES[i]}</td>
                    <td className={r.leaks ? 'fss-bad' : differs ? '' : 'fss-ok'}>{r.entry === null ? 'none' : r.entry.value}</td>
                    <td>{r.entry === null ? '-' : r.entry.at}</td>
                    <td>{right === null ? 'none' : right.value}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Hint tone="muted" className="fss-note">
          The join table above is a three-row illustration; the three AUC meters use a separate dataset and do not follow the Join buttons. The AUC experiment: each row is a user on a day, the label is "buys in the next 7 days", the honest feature counts purchases in the 7 days before, and the leaky feature counts purchases from 7 days before to 7 days after, so it contains the label window.
          A one-feature logistic regression is fitted to each, {leak.rows.toLocaleString('en-US')} rows with {leak.positives.toLocaleString('en-US')} positive. The leaky feature cannot exist when serving, so the served model sees the honest one: an offline metric that cannot be reproduced online, on this dataset.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative" seed={seed}>a made-up event stream and a made-up feature log</Provenance>
          <Provenance kind="toy">one-feature logistic regression by gradient descent, scored by AUC on its own training rows</Provenance>
          <ClaimLabel kind="standard">point-in-time correctness: a training row may use only what was known at its label time</ClaimLabel>
          <Provenance kind="from-memory">a feature store usually keeps one feature definition for training and serving with point-in-time retrieval; named generically, no product claimed; to verify against your own feature store&apos;s documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
