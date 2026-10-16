import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { nullCaption } from './captions';
import { OPENING } from './opening';
import { NULL_OUTCOMES, POINTERS, withCheck, withoutCheck } from './ub';

const ORIGINAL = ['int f(int *p) {', '  int v = *p;', '  if (p == NULL) return -1;', '  return v;', '}'];
const REWRITTEN = ['int f(int *p) {', '  int v = *p;', '  return v;', '}'];

/** Scene 2: the null check that comes after the dereference. */
export function NullScene({ picker }: { picker: ReactNode }) {
  const [address, setAddress] = useState(OPENING.pointer.address);
  const isNull = address === 0;
  return (
    <StageFrame
      height={430}
      intro={nullCaption(address)}
      introKey={address}
      stats={
        <Stats>
          <Stat label="With the check" value={isNull ? 'no promise' : withCheck(address)} color="var(--info)" sub={isNull ? 'outside the contract' : 'the check is false'} />
          <Stat label="Check removed" value={isNull ? 'no promise' : withoutCheck(address)} color="var(--violet)" sub={isNull ? 'outside the contract' : 'same value'} />
          <Stat label="Pointers where they agree" value={`${POINTERS.filter((p) => p.address !== 0 && withCheck(p.address) === withoutCheck(p.address)).length} of ${POINTERS.length - 1}`} color="var(--ok)" sub="every non-null pointer in the picker" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'with the check', shape: 'square' }, { color: 'var(--violet)', label: 'check removed', shape: 'square' }, { color: 'var(--ok)', label: 'the versions agree', shape: 'square' }, { color: 'var(--orange)', label: 'null: the contract ends here', shape: 'square' }]} />}
      controls={[
        picker,
        <>
          <span className="ub-label">Pointer p</span>
          {POINTERS.map((p) => (
            <ChipButton key={p.address} tone={p.address === 0 ? 'orange' : 'info'} on={p.address === address} onClick={() => setAddress(p.address)}>{p.label}</ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="ub-stage stage-pad">
        <div className="ub-two">
          <CodePanel className="ub-code" title="As written (shown, not run)" lines={ORIGINAL} stateOf={(i) => (i === 2 ? 'del' : 'idle')} />
          <CodePanel className="ub-code" title="After the toy rewriter (shown, not run)" lines={REWRITTEN} />
        </div>
        <table className="data-table ub-table">
          <caption>The pointer picker: made-up addresses and cell contents</caption>
          <thead>
            <tr><th>p</th><th>With the check</th><th>Check removed</th><th>Agree</th></tr>
          </thead>
          <tbody>
            {POINTERS.map((p) => {
              const nullRow = p.address === 0;
              return (
                <tr key={p.address} className={p.address === address ? 'ub-current' : undefined}>
                  <td>{p.label}</td>
                  <td>{nullRow ? 'not defined' : withCheck(p.address)}</td>
                  <td>{nullRow ? 'not defined' : withoutCheck(p.address)}</td>
                  <td style={{ color: nullRow ? 'var(--orange)' : 'var(--ok)' }}>{nullRow ? 'outside the contract' : 'yes'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isNull && (
          <ul className="ub-outcomes" aria-label="Outcomes the standard allows for a null load">
            {NULL_OUTCOMES.map((o) => <li key={o}>{o}</li>)}
          </ul>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy rewriter; the addresses and cell contents are made up</Provenance>
        <Provenance kind="from-memory">compilers may remove a null check that follows a dereference; verify on Compiler Explorer. The three outcomes are examples, shown and not run</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
