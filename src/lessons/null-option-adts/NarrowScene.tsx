import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { narrowCaption } from './frames';
import { GUARDS, assertCrashes, PARAM_TYPES, checkLength, members, narrowSource, narrowed, type Guard, type ParamType } from './model';

function TypeChips({ all, kept, label }: { all: string[]; kept: string[]; label: ReactNode }) {
  return (
    <div className="noa-types">
      <SectionTitle weight="regular">{label}</SectionTitle>
      <div className="noa-type-row">
        {all.map((m) => {
          const out = !kept.includes(m);
          return (
            <span key={m} className={`noa-type tone-${out ? 'dim' : m === 'string' ? 'info' : 'bad'} ${out ? 'is-out' : ''}`}>
              {m}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function NarrowScene({ picker }: { picker: ReactNode }) {
  const [param, setParam] = useState<ParamType>('sn');
  const [guard, setGuard] = useState<Guard>('none');
  const v = checkLength(param, guard);
  const src = narrowSource(param, guard);
  const all = members(param);
  const kept = narrowed(param, guard);
  useIntroCaption(narrowCaption(param, guard), [param, guard]);

  const consoleLines: ConsoleLine[] = v.unchecked
    ? [{ text: 'no errors', tone: 'ok' }, ...assertCrashes(param).map((c) => ({ text: `len(${c.arg}) → ${c.message}`, tone: 'bad' as const }))]
    : v.ok
      ? [{ text: 'no errors', tone: 'ok' }]
      : [{ text: v.message!, tone: 'orange' }];

  return (
    <StageFrame
      height={380}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'string: safe to read .length' },
            { color: 'var(--bad)', label: 'null / undefined still possible' },
            { color: 'var(--dim)', label: 'ruled out by the guard' },
            { color: 'var(--orange)', label: 'rejected by the checker' },
            { color: 'var(--ok)', label: 'accepted' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="x is" value={param} onChange={setParam} options={PARAM_TYPES.map((p) => ({ value: p.value, label: p.label }))} />
        </>,
        <>
          <Segmented label="Guard" value={guard} onChange={setGuard} options={GUARDS.map((g) => ({ value: g.value, label: g.label }))} />
        </>,
      ]}
    >
      <div className="noa stage-pad">
        <div className="noa-row">
          <div className="noa-col">
            <CodePanel
              title="TypeScript, strictNullChecks on"
              lines={src.lines}
              stateOf={(i) => (i === src.useLine ? (v.ok ? (v.unchecked ? 'bad' : 'done') : 'bad') : 'idle')}
              className={`noa-code ${v.ok ? '' : 'is-compile'}`}
            />
            <ConsolePanel title={v.unchecked ? 'tsc --strict, then run the calls' : 'tsc --strict'} lines={consoleLines} />
          </div>
          <div className="noa-col">
            <TypeChips all={all} kept={all} label={<>declared type of <code className="keep-case">x</code></>} />
            <TypeChips all={all} kept={kept} label={<>type of <code className="keep-case">x</code> where <code className="keep-case">x.length</code> is read</>} />
          </div>
        </div>
        <Hint block>
          The checker here is a small model of TypeScript&apos;s narrowing, for these snippets only; every verdict and message is pinned to real tsc --strict output in the lesson&apos;s tests.
        </Hint>
      </div>
    </StageFrame>
  );
}
