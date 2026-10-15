import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { plainTone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { engineSum } from './engine';
import { decodeBody, frames as runFrames, listingOf } from './interp';
import { SUM_BYTES } from './modules';

const SUM_RANGE = { min: 0, max: 12 } as const;
const DEFAULT_N = 5;
const STEP_MS = 400;
const LOCAL_NAMES = ['n', 'i', 'acc'] as const;
const BODY = decodeBody(SUM_BYTES, 0);
const LINES = listingOf(BODY);

/** Scene 2: sum(n) stepped by the lesson's own interpreter, then the real engine's answer beside it. */
export function StackScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(DEFAULT_N);
  const run = useMemo(() => runFrames(BODY, [n]), [n]);
  const engine = useMemo(() => engineSum(n), [n]);
  const engineValue = engine.ok ? engine.value : undefined;
  const states = useMemo(
    () => run.map((f) => ({
      ...f,
      say: f.status === 'returned' ? <>The function returns {f.result}. The real engine says sum({n}) = {engine.ok ? String(engineValue) : engine.errorClass}: {f.result === engineValue ? 'they agree' : 'they differ'}.</> : f.steps === 0 ? <>sum({n}) adds 0 to {n - 1}. The parameter n is local 0; i is local 1 and acc local 2, both starting at 0. Step, or press play.</> : f.note,
      quiet: true,
    })),
    [run, n, engine, engineValue],
  );
  const player = usePlayer(states, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const done = f.status === 'returned';
  const top = f.stack.length - 1;
  return (
    <StageFrame
      player={player}
      height={620}
      stats={
        <Stats>
          <Stat label="Instructions run" value={f.steps} />
          <Stat label="Interpreter" value={done ? String(f.result) : 'running'} color={done ? 'var(--ok)' : undefined} sub={done ? `after ${f.steps} instructions` : undefined} />
          <Stat label={`The real engine, sum(${n})`} value={engine.ok ? String(engineValue) : engine.errorClass} color="var(--ok)" sub={done ? (f.result === engineValue ? 'the same answer' : 'a different answer') : 'called on the same bytes'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'the instruction about to run', shape: 'square' }, { color: 'var(--info)', label: 'the top of the stack', shape: 'square' }, { color: 'var(--ok)', label: 'the engine’s real answer', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="n" value={n} min={SUM_RANGE.min} max={SUM_RANGE.max} onChange={setN} />
        </>,
      ]}
    >
      <div className="wa stage-pad">
        <div className="wa-grid">
          <CodePanel title="sum, decoded from the 68 bytes" lines={LINES} active={f.pc < LINES.length ? f.pc : null} />
          <Box variant="sunken" className="wa-machine">
            <SectionTitle hint="top on the right">Operand stack</SectionTitle>
            {f.stack.length === 0 ? <span className="empty-note">empty</span> : <ArrayStrip values={f.stack} cellState={(i) => (i === top ? 'info' : 'idle')} cellMax={46} fontSize={12} />}
            <SectionTitle hint="parameter, then two locals">Locals</SectionTitle>
            <CellGrid rows={1} cols={3} size="md" colLabels={[...LOCAL_NAMES]} cell={(_, c) => ({ text: f.locals[c], tone: plainTone(c), fill: 'tint' })} ariaLabel="Locals n, i and acc" />
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">a small interpreter of the opcodes this module uses, run on the bytes decoded from it</Provenance>
          <Provenance kind="real">the engine’s answer is the real WebAssembly engine running the same 68 bytes</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
