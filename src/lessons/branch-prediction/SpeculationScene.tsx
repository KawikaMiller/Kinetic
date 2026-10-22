import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { n } from './captions';
import { speculationFrames } from './frames';
import { DEPTH_RANGE, speculation, speculationOpening, stripAt, type SlotKind } from './scenarios';

const STEP_MS = 650;
const STRIP_CELL = { cell: 30, gap: 3, font: 11 } as const;
const STRIP_MIN_WIDTH = 440;
const GUESSES = [
  { value: true, label: 'Right' },
  { value: false, label: 'Wrong' },
];

const slotCell = (kind: SlotKind, age: number | null): GridCellSpec => {
  const text = age === 0 ? 'br' : age === null ? '' : `+${age}`;
  switch (kind) {
    case 'branch': return { text, tone: 'hi', fill: 'solid' };
    case 'speculative': return { text, tone: 'dim', fill: 'outline' };
    case 'kept': return { text, tone: 'ok', fill: 'tint', intensity: 0.32 };
    case 'flushed': return { text, tone: 'bad', fill: 'solid' };
    case 'empty': return { fill: 'none' };
  }
};

export function SpeculationScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(speculationOpening);
  const [depth, setDepth] = useState(open.depth);
  const [guessRight, setGuessRight] = useState(open.guessRight);
  const frames = useMemo(() => speculationFrames(depth, guessRight), [depth, guessRight]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const frame = player.frame;
  const result = speculation(depth, guessRight);
  const strip = stripAt(depth, guessRight, frame.cycle);
  const resolved = strip.resolved;
  const wrongNow = resolved ? result.flushed : 0;

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="Stage that resolves it" value={n(depth)} sub="of the pipeline, counting from fetch" />
          <Stat label="In flight behind the branch" value={n(result.inFlightYounger)} sub={`one instruction fetched per cycle, ${n(depth)} - 1`} />
          <Stat label="Flushed" value={n(wrongNow)} color={wrongNow > 0 ? 'var(--bad)' : undefined} sub={resolved ? (guessRight ? 'none: the guess was right' : 'discarded work') : 'known when the branch resolves'} />
          <Stat label="Cycles lost" value={n(resolved ? result.lostCycles : 0)} color={resolved && result.lostCycles > 0 ? 'var(--bad)' : undefined} sub={resolved ? 'fetch cycles spent on the wrong path' : 'known when the branch resolves'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the branch (br)', shape: 'square' },
            { color: 'var(--dim)', label: 'speculative: fetched on the guess', shape: 'square' },
            { color: 'var(--ok)', label: 'kept: the guess was right', shape: 'square' },
            { color: 'var(--bad)', label: 'flushed: the guess was wrong', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Branch resolves at stage" value={depth} min={DEPTH_RANGE.min} max={DEPTH_RANGE.max} onChange={setDepth} />
          <Segmented label="The predictor guessed" value={guessRight} onChange={setGuessRight} options={GUESSES} />
        </>,
      ]}
    >
      <div className="bp-stage stage-pad">
        <Box>
          <SectionTitle hint={`cycle ${n(Math.min(frame.cycle, depth))}${resolved ? ', resolved' : ''}`}>The pipeline, stage by stage</SectionTitle>
          <WideRegion minWidth={STRIP_MIN_WIDTH} label="Pipeline strip: scroll sideways to see every stage">
            <CellGrid
              className="bp-strip"
              rows={1}
              cols={depth}
              size={STRIP_CELL}
              cell={(_, c) => slotCell(strip.slots[c].kind, strip.slots[c].age)}
              colLabels={Array.from({ length: depth }, (_, c) => String(c + 1))}
              ariaLabel={`Pipeline of ${depth} stages: ${strip.slots.filter((s) => s.kind === 'speculative').length} speculative instructions behind the branch${resolved ? (guessRight ? ', all kept' : ', all flushed') : ''}`}
            />
          </WideRegion>
          <Hint tone="muted" block>
            Speculation: the CPU runs ahead on its guess and throws the work away if it was wrong. Thrown-away work can still leave traces in shared structures such as caches; that is a story for a lesson on timing channels, in words only here.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a scalar pipeline that fetches one instruction a cycle; real cores fetch several and run out of order</Provenance>
          <Provenance kind="illustrative">the resolve stage is a slider; real pipelines vary by design</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
