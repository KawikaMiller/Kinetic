import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { stateCaption } from './captions';
import type { Instr } from './lang';
import { runFrames, startVm, STEP_BUDGET, type VmState } from './vm';
import { VmPanel } from './VmPanel';

const STEP_MS = 600;
const NO_PROGRAM: readonly Instr[] = [];

/**
 * Steps a program through the VM. The program comes from the compiler (scene 1) or the learner's
 * listing (scene 2); `controls` are the scene's own rows, `above` goes over the listing and
 * `below` can use the current state (the dispatch loop does).
 */
export function RunScene({ picker, program, controls, above, below, height = 640 }: {
  picker: ReactNode;
  program: readonly Instr[] | null;
  controls: ReactNode[];
  above?: ReactNode;
  below?: (state: VmState) => ReactNode;
  height?: number;
}) {
  const prog = program ?? NO_PROGRAM;
  const frames = useMemo(() => {
    const states = program ? runFrames(program) : [startVm()];
    return states.map((s) => ({ ...s, say: stateCaption(s, prog), quiet: true }));
  }, [program, prog]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const s = player.frame;
  return (
    <StageFrame
      player={player}
      height={height}
      stats={
        <Stats>
          <Stat label="Instructions run" value={s.steps} sub={`budget ${STEP_BUDGET.toLocaleString('en-US')}`} />
          <Stat label="Stack depth" value={s.stack.length} sub={`peak ${s.peak}`} color="var(--info)" />
          <Stat label="pc" value={s.pc} />
          <Stat
            label="Status"
            value={s.status === 'error' ? 'stopped by an error' : s.status === 'budget' ? 'no verdict' : s.status}
            color={s.status === 'error' ? 'var(--bad)' : s.status === 'halted' ? 'var(--ok)' : s.status === 'budget' ? 'var(--dim)' : undefined}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the instruction about to run', shape: 'square' },
            { color: 'var(--ok)', label: 'just pushed, or a slot just written', shape: 'square' },
            { color: 'var(--info)', label: 'the top of the stack', shape: 'square' },
            { color: 'var(--violet)', label: 'a jump taken', shape: 'square' },
            { color: 'var(--dim)', label: 'popped values; a budget stop', shape: 'square' },
            { color: 'var(--bad)', label: 'an error stops the machine', shape: 'square' },
          ]}
        />
      }
      controls={controls.map((row, i) => (i === 0 ? <>{picker}{row}</> : row))}
    >
      <div className="bv stage-pad">
        {above}
        {program && <VmPanel program={prog} state={s} />}
        {below?.(s)}
        <ProvenanceRow>
          <Provenance kind="toy">a teaching VM with its own twelve instructions; real instruction sets (JVM, CPython, WebAssembly) differ</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
