import { useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { combineCaption } from './captions';
import { ALGORITHMS, RESULTS, RESULT_LABEL, combine, type Algorithm, type RuleResult } from './combine';
import { OPENING } from './opening';

/** Scene 4: one permit rule and one deny rule match; what each combining rule decides. */
export function CombineScene({ picker }: { picker: ReactNode }) {
  const [alg, setAlg] = useState<Algorithm>(OPENING.combine.algorithm);
  const [rules, setRules] = useState<[RuleResult, RuleResult]>(OPENING.combine.rules);
  const out = combine(alg, rules);
  const setRule = (i: 0 | 1, v: RuleResult) => setRules((r) => (i === 0 ? [v, r[1]] : [r[0], v]));
  const options = RESULTS.map((r) => ({ value: r, label: RESULT_LABEL[r] }));

  return (
    <StageFrame
      height={520}
      intro={combineCaption(alg, rules)}
      introKey={`${alg}|${rules.join()}`}
      stats={
        <Stats>
          <Stat label="Decision" value={out} color={out === 'permit' ? 'var(--ok)' : 'var(--bad)'} sub={ALGORITHMS.find((a) => a.id === alg)!.text} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'permit', shape: 'square' }, { color: 'var(--bad)', label: 'deny', shape: 'square' }, { color: 'var(--hi)', label: 'the row for your rules', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Combining rule" value={alg} options={ALGORITHMS.map((a) => ({ value: a.id, label: a.label }))} onChange={setAlg} />
        </>,
        <>
          <Segmented label="Rule 1 (listed first)" value={rules[0]} options={options} onChange={(v) => setRule(0, v)} />
          <Segmented label="Rule 2 (listed second)" value={rules[1]} options={options} onChange={(v) => setRule(1, v)} />
          <Button onClick={() => setRules((r) => [r[1], r[0]])}>Swap the order</Button>
        </>,
      ]}
    >
      <div className="az-stage stage-pad">
        <Box className="az-panel">
          <table className="data-table az-table">
            <caption>Every outcome of two rules under "{ALGORITHMS.find((a) => a.id === alg)!.label.toLowerCase()}"</caption>
            <thead><tr><th>Rule 1</th><th>Rule 2</th><th>Decision</th></tr></thead>
            <tbody>
              {RESULTS.flatMap((a) => RESULTS.map((b) => {
                const d = combine(alg, [a, b]);
                const current = a === rules[0] && b === rules[1];
                return (
                  <tr key={`${a}-${b}`} className={current ? 'az-current' : undefined}>
                    <td>{RESULT_LABEL[a]}</td>
                    <td>{RESULT_LABEL[b]}</td>
                    <td style={{ color: d === 'permit' ? 'var(--ok)' : 'var(--bad)' }}>{d}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </Box>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">two rules and three outcomes; a real engine evaluates many rules over many attributes</Provenance>
        <Provenance kind="from-memory">some standards (XACML is the usual example) distinguish "not applicable" from "deny"; here no match is a deny, as in cloud policy engines; check XACML and your provider's documentation</Provenance>
        <ClaimLabel kind="practice">the three combining rules are common ones; engines differ in names and defaults</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
