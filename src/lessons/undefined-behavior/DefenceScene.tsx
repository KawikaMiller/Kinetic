import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { defenceCaption } from './captions';
import { OPENING } from './opening';
import { DEFENCES, defenceOutcome, type DefenceId } from './ub';

/** Scene 4: what each defence turns the silent bug into. */
export function DefenceScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<DefenceId>(OPENING.defence.id);
  const x = OPENING.defence.x;
  const current = defenceOutcome(id, x);
  return (
    <StageFrame
      height={430}
      intro={defenceCaption(id)}
      introKey={id}
      stats={
        <Stats>
          <Stat label="overflows(INT_MAX)" value={current.result === null ? 'stops' : current.result} color={current.defined ? 'var(--ok)' : 'var(--bad)'} sub={current.defined ? 'defined behaviour' : 'undefined behaviour, folded away'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a defence that restores defined behaviour', shape: 'square' }, { color: 'var(--bad)', label: 'the silent bug', shape: 'square' }]} />}
      controls={[
        picker,
        <>
          {DEFENCES.map((d) => (
            <ChipButton key={d.id} tone={d.id === 'none' ? 'bad' : 'ok'} on={d.id === id} onClick={() => setId(d.id)}>{d.label}</ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="ub-stage stage-pad">
        <table className="data-table ub-table">
          <caption>overflows(INT_MAX) with a 32-bit signed int, under each defence</caption>
          <thead>
            <tr><th>Defence</th><th>Returns</th><th>What happens</th></tr>
          </thead>
          <tbody>
            {DEFENCES.map((d) => {
              const o = defenceOutcome(d.id, x);
              return (
                <tr key={d.id} className={d.id === id ? 'ub-current' : undefined}>
                  <td style={{ color: o.defined ? 'var(--ok)' : 'var(--bad)' }}>{d.label}</td>
                  <td>{o.result === null ? 'stops' : o.result}</td>
                  <td>{o.outcome}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ProvenanceRow>
        <Provenance kind="from-memory">flag names, the sanitizer message format, __builtin_add_overflow and C23 ckd_add, and how Java, Go and Rust treat overflow; verify against each tool's and language's reference</Provenance>
        <Provenance kind="not-run">nothing here was compiled or run with a sanitizer; the rows are examples</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
