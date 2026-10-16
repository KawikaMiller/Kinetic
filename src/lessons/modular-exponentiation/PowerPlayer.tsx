import { useMemo, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { chunkGroups } from '../../core/bits';
import { usePlayer } from '../../core/usePlayer';
import { currentOf, heldAt, powFrames } from './frames';
import { bitsOf, naiveMultiplications, operationCount, powRun, type Direction } from './modpow';
import type { Triple } from './presets';

const STEP_MS = 700;
const BYTE = 8;

/** The strip, the step list and the counters for one run of square-and-multiply, with the player under it. */
export function PowerPlayer({ picker, triple, direction, controls, note }: { picker: ReactNode; triple: Triple; direction: Direction; controls: ReactNode; note?: ReactNode }) {
  const { base, exponent, modulus } = triple;
  const run = useMemo(() => powRun(base, exponent, modulus, direction), [base, exponent, modulus, direction]);
  const bits = useMemo(() => bitsOf(exponent), [exponent]);
  const frames = useMemo(() => powFrames(run, bits, exponent, modulus), [run, bits, exponent, modulus]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const ops = player.frame.ops;
  const held = heldAt(run, ops, exponent, modulus);
  const step = currentOf(run, ops);
  const total = operationCount(run);
  const naive = naiveMultiplications(exponent);
  const done = player.atEnd;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Square-and-multiply" value={ops} color="var(--ok)" sub={`of ${total} modular multiplications: ${run.squarings} squarings + ${run.multiplications} multiplications`} />
          <Stat label="Repeated multiplication" value={naive.toLocaleString('en-US')} color="var(--bad)" sub={`after ${ops} steps it would be ${ops} of ${naive.toLocaleString('en-US')} done`} />
          <Stat label={direction === 'ltr' ? 'Running value' : 'Result so far'} value={held.result.toString()} color="var(--ok)" sub={direction === 'ltr' ? 'one number, reduced mod n every step' : 'held beside the running power'} />
          {held.power !== null && <Stat label="Running power" value={held.power.toString()} color="var(--info)" sub="base^(2^i) mod n" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a bit that is 1', shape: 'square' },
            { color: 'var(--dim)', label: 'a bit that is 0', shape: 'square' },
            { color: 'var(--info)', label: 'squaring step', shape: 'square' },
            { color: 'var(--violet)', label: 'multiply step', shape: 'square' },
            { color: 'var(--ok)', label: 'running value / result', shape: 'dot' },
            { color: 'var(--bad)', label: 'naive count', shape: 'dot' },
          ]}
        />
      }
      controls={[picker, controls]}
    >
      <div className="me-stage stage-pad">
        <div className="me-expr" aria-label="The computation">
          {base.toString()}^{exponent.toString()} mod {modulus.toString()} = <b className={done ? 'is-done' : ''}>{done ? run.result.toString() : '?'}</b>
        </div>
        <BitStrip
          bits={bits}
          groups={chunkGroups(bits.length, BYTE, { align: 'right', tone: 'violet' })}
          highlight={step ? [step.bit] : []}
          highlightTone={step?.kind === 'multiply' ? 'violet' : 'info'}
          ariaLabel="The exponent's bits, most significant first"
        />
        <ol className="me-steps" aria-label="Operations so far">
          {run.steps.slice(Math.max(0, ops - 6), ops).map((s, i) => (
            <li key={ops - Math.min(ops, 6) + i} className={`me-step is-${s.kind}`}>
              {s.kind === 'square' ? 'square' : 'multiply'}: {s.before.toString()} x {s.factor.toString()} = {s.after.toString()}
            </li>
          ))}
        </ol>
        {note}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes, not cryptography: no key is made or used here</Provenance>
        <Provenance kind="real">the operation counts are exact for this algorithm; real big-integer multiplication is not constant cost</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
