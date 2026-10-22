import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, Segmented, Stat, Stats } from '../../components/ui';
import { clauseText } from '../../core/sat';
import { PRESET_A, PRESET_B, ROOT_RANGES, encodeRoot, glossOrigin, resolve, type Resolution, type RootRange } from './model';
import { Chips } from './parts';
import { statsLine } from './text';

interface Ask {
  lib: RootRange;
  util: RootRange;
  solved: Resolution | null;
}
const START: Ask = { ...PRESET_A, solved: null };

const resultCaption = (r: Resolution | null, lib: RootRange, util: RootRange): string => {
  if (!r) return `The project asks for lib ${lib === '*' ? 'any version' : lib} and util ${util === '*' ? 'any version' : util}. Press Solve to run DPLL on the clauses below.`;
  if (r.sat) return `Resolved: install ${r.installed.join(' and ')}. ${statsLine(r.stats)}.`;
  const core = r.core!.map((i) => glossOrigin(r.encoding.origins[i])).join('; ');
  return `Unsatisfiable. These ${r.core!.length} requirements cannot all hold: ${core}. Drop any one of them and the rest can be installed.`;
};

/** Scene 4: package resolution as SAT: the root's ranges become clauses, DPLL answers, and an unsatisfiable set shows its core. */
export function PackagesScene({ picker }: { picker: ReactNode }) {
  const [ask, setAsk] = useState<Ask>(START);
  const encoding = useMemo(() => encodeRoot(ask.lib, ask.util), [ask.lib, ask.util]);
  const core = new Set(ask.solved?.core ?? []);
  const caption = resultCaption(ask.solved, ask.lib, ask.util);
  const change = (next: Partial<Pick<Ask, 'lib' | 'util'>>) => setAsk((a) => ({ ...a, ...next, solved: null }));

  return (
    <StageFrame
      height={360}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Variables" value={encoding.cnf.vars} sub="one per package version" />
          <Stat label="Clauses" value={encoding.cnf.clauses.length} sub="requirements and exclusions" />
          {ask.solved && <Stat label="Verdict" value={ask.solved.sat ? 'resolves' : 'unsatisfiable'} color={ask.solved.sat ? 'var(--ok)' : 'var(--bad)'} sub={ask.solved.sat ? `${ask.solved.installed.length} packages installed` : `core of ${ask.solved.core!.length} clauses`} />}
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'a clause in the unsatisfiable core', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            <ChipButton on={ask.lib === PRESET_A.lib && ask.util === PRESET_A.util} onClick={() => change(PRESET_A)}>A: lib any, util ^1</ChipButton>
            <ChipButton on={ask.lib === PRESET_B.lib && ask.util === PRESET_B.util} onClick={() => change(PRESET_B)}>B: lib ^2, util ^1</ChipButton>
          </ControlGroup>
        </>,
        <>
          <Segmented label="Project asks lib" options={ROOT_RANGES.map((r) => ({ value: r.value, label: r.label }))} value={ask.lib} onChange={(lib) => change({ lib })} />
          <Segmented label="and util" options={ROOT_RANGES.map((r) => ({ value: r.value, label: r.label }))} value={ask.util} onChange={(util) => change({ util })} />
          <Button variant="primary" onClick={() => setAsk((a) => ({ ...a, solved: resolve(a.lib, a.util) }))}>Solve</Button>
        </>,
      ]}
    >
      <div className="stage-pad ss-stage">
        <Hint block>Packages: lib 1.0.0 needs any util; lib 2.0.0 needs util ^2; util has versions 1.0.0 and 2.0.0. Each version is a variable that is true when it is installed.</Hint>
        <ol className="ss-cnf" aria-label="The clauses, with what each one says">
          {encoding.cnf.clauses.map((c, i) => (
            <li key={i} className={`ss-cnf-row ${core.has(i) ? 'is-core' : ''}`}>
              <code>{clauseText(encoding.cnf, c)}</code>
              <span className="ss-gloss">{glossOrigin(encoding.origins[i])}</span>
            </li>
          ))}
        </ol>
        {ask.solved?.sat && <Hint tone="muted" block>Install set: {ask.solved.installed.join(', ')}.</Hint>}
      </div>
      <Chips>
        <Provenance kind="from-memory">dependency solvers in some package managers use SAT techniques; verify against a tool&apos;s own documentation before naming one</Provenance>
      </Chips>
    </StageFrame>
  );
}
