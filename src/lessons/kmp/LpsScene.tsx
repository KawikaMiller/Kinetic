import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { lpsFrames } from './frames';
import { LPS_PRESETS, OPENING } from './presets';
import { PairControls } from './PairControls';
import { WideRegion } from '../../components/WideRegion';
import { usePair } from './usePair';

const STEP_MS = 800;
const CELL_PX = 36;

/** Scene 2: the failure table built live, by matching the pattern against its own prefixes. */
export function LpsScene({ picker }: { picker: ReactNode }) {
  const state = usePair({ text: '', pattern: OPENING.lps.pattern });
  const { pattern } = state.pair;
  const frames = useMemo(() => lpsFrames(pattern), [pattern]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const [pinned, setPinned] = useState<number | null>(null);
  const pin = pinned !== null && pinned < pattern.length ? pinned : null;
  const known = pin !== null ? f.table[pin] : null;
  const prefix = known ? pattern.slice(0, known) : '';
  const done = f.kind === 'done';
  const inBorder = (k: number): 'ok' | 'violet' | null => {
    if (pin === null || known === null || known === 0) return null;
    if (k < known) return 'ok';
    if (k > pin - known && k <= pin) return 'violet';
    return null;
  };

  return (
    <StageFrame
      player={player}
      height={360}
      stats={
        <Stats>
          <Stat label="Pattern length" value={pattern.length} />
          <Stat label="Filled in" value={f.table.filter((v) => v !== null).length} color="var(--ok)" sub={`of ${pattern.length} table entries`} />
          <Stat label="Comparisons so far" value={Math.min(player.index, frames.length - 2)} color="var(--hi)" sub="of the pattern against itself" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'i: the position being filled', shape: 'dot' },
            { color: 'var(--violet)', label: 'len: the border matched so far', shape: 'dot' },
            { color: 'var(--ok)', label: 'the prefix a clicked entry names', shape: 'square' },
            { color: 'var(--violet)', label: 'the suffix it equals', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PairControls state={state} presets={LPS_PRESETS} showText={false} />
        </>,
      ]}
    >
      <div className="km-stage stage-pad">
        <WideRegion minWidth={Math.max(320, pattern.length * CELL_PX)} label="Pattern and table: scroll sideways to see all of it" gutter={{ top: 8, bottom: 30, x: 4 }}>
          <div className="km-strips">
            <div className="km-row"><span className="km-rowlabel">pattern</span></div>
            <ArrayStrip
              values={pattern.split('')}
              showIndex
              cellState={(k) => (f.kind === 'start' || done ? 'idle' : k === f.i ? 'active' : 'idle')}
              cellTone={(k) => inBorder(k) ?? (!done && f.kind !== 'start' && k === f.len ? 'violet' : null)}
              pointers={f.kind === 'start' || done ? [] : [{ i: f.i, label: 'i', tone: 'info' }, { i: f.len, label: 'len', tone: 'violet' }]}
              mergePointers
              fontSize={14}
              cellMax={CELL_PX + 14}
            />
            <div className="km-row"><span className="km-rowlabel">lps (click an entry)</span></div>
            <ArrayStrip
              values={f.table.map((v) => (v === null ? '' : v))}
              cellState={(k) => (k === pin ? 'violet' : !done && f.kind !== 'start' && k === f.i ? 'active' : 'idle')}
              showIndex
              onCellClick={(k) => setPinned(k === pin ? null : k)}
              cellTitle={(k) => `lps[${k}]`}
              fontSize={14}
              cellMax={CELL_PX + 14}
            />
          </div>
        </WideRegion>
        <p className="km-note" role="status">
          {pin === null
            ? 'Click an lps entry to see the prefix and the suffix it says are equal.'
            : known === null
              ? `lps[${pin}] is not filled in yet: step forward.`
              : known === 0
                ? `lps[${pin}] = 0: no proper prefix of "${pattern.slice(0, pin + 1)}" is also its suffix.`
                : `lps[${pin}] = ${known}: the prefix "${prefix}" equals the suffix "${pattern.slice(pin + 1 - known, pin + 1)}" of "${pattern.slice(0, pin + 1)}".`}
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: the table is built by the loop shown, and checked against the definition in the tests</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
