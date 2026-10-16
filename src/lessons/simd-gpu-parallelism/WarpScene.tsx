import { useMemo, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { chunkGroups } from '../../core/bits';
import { pctText } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { branchFrames, loopFrames, type WarpFrame } from './frames';
import { BRANCH_PRESETS, PATH_A_COST, PATH_B_COST, TRIP_PRESETS, WARP_SIZE, branchReport, parseTrips, tripReport } from './model';
import { warpOpening, type WarpMode } from './openings';

const COLS = 4;
const ROWS = WARP_SIZE / COLS;
const MODES: { value: WarpMode; label: string }[] = [
  { value: 'branch', label: 'if / else' },
  { value: 'loop', label: 'loop trip counts' },
];
const GROUPS = chunkGroups(WARP_SIZE, 8, { tone: 'hi' });
const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function WarpScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(warpOpening);
  const [mode, setMode] = useState<WarpMode>(open.mode);
  const [pred, setPred] = useState(open.pred);
  const [trips, setTrips] = useState(open.trips);
  const [tripText, setTripText] = useState(open.trips.join(', '));
  const [tripError, setTripError] = useState<string | null>(null);

  const branch = useMemo(() => branchReport(pred), [pred]);
  const loop = useMemo(() => tripReport(trips), [trips]);
  const frames = useMemo<WarpFrame[]>(() => (mode === 'branch' ? branchFrames(pred) : loopFrames(trips)), [mode, pred, trips]);
  const player = usePlayer<WarpFrame>(frames, { interval: 550, autoplayOnChange: false });
  const frame = player.frame;

  const flip = (lane: number) => setPred((p) => p.map((v, i) => (i === lane ? !v : v)));
  const typeTrips = (text: string) => {
    setTripText(text);
    const parsed = parseTrips(text);
    if (parsed.ok) {
      setTripError(null);
      setTrips(parsed.trips);
    } else setTripError(`${parsed.error} The lanes keep their old counts.`);
  };
  const loadTrips = (list: readonly number[]) => {
    setTrips(list);
    setTripText(list.join(', '));
    setTripError(null);
  };

  const cell = (r: number, c: number) => {
    const lane = r * COLS + c;
    const text = mode === 'branch' ? `${lane}${pred[lane] ? 'A' : 'B'}` : trips[lane];
    if (frame.phase !== 'step') return { text, tone: 'muted' as const, fill: 'tint' as const };
    return frame.active[lane] ? { text, tone: 'hi' as const, fill: 'solid' as const } : { text, tone: 'dim' as const, fill: 'outline' as const };
  };

  const stats =
    mode === 'branch' ? (
      <Stats>
        <Stat label="Lanes on path A / B" value={`${branch.aLanes} / ${branch.bLanes}`} sub={[`A is ${PATH_A_COST} instructions, B is ${PATH_B_COST}`]} />
        <Stat label="Instructions issued" value={branch.issued} sub={[branch.aLanes > 0 && branch.bLanes > 0 ? `${PATH_A_COST} + ${PATH_B_COST}: both paths run` : 'one path only: nothing to diverge on']} />
        <Stat label="Lane utilisation" value={pctText(branch.utilisation, 0)} color="var(--info)" sub={['useful lane-slots over lane-slots issued']} />
      </Stats>
    ) : (
      <Stats>
        <Stat label="Longest lane" value={loop.longest} sub={['the warp runs this many steps']} />
        <Stat label="Useful lane-iterations" value={loop.total} sub={[`of ${WARP_SIZE * loop.longest} slots issued`]} />
        <Stat label="Lane utilisation" value={loop.utilisation === null ? '–' : pctText(loop.utilisation, 0)} color="var(--info)" sub={[loop.utilisation === null ? 'no lane has work' : `${loop.total} / (${WARP_SIZE} × ${loop.longest})`]} />
      </Stats>
    );

  return (
    <StageFrame
      player={player}
      height={420}
      stats={stats}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'active lane' },
            { color: 'var(--dim)', label: 'masked off' },
            { color: 'var(--muted)', label: 'not issuing yet or done' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Program" value={mode} onChange={setMode} options={MODES} />
        </>,
        mode === 'branch' ? (
          <>
            {BRANCH_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={sameList(p.pred, pred)} onClick={() => setPred(p.pred)}>
                {p.label}
              </ChipButton>
            ))}
          </>
        ) : (
          <>
            <TextField label={`Trip counts (${WARP_SIZE} lanes, 0 to 64)`} value={tripText} onChange={typeTrips} width={300} spellCheck={false} />
            {TRIP_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={sameList(p.trips, trips)} onClick={() => loadTrips(p.trips)}>
                {p.label}
              </ChipButton>
            ))}
          </>
        ),
      ]}
    >
      <div className="sg-stage stage-pad">
        {mode === 'branch' && (
          <div className="sg-predicate">
            <span className="section-title">Predicate: lane takes path A (1) or B (0), click a lane to flip it</span>
            <BitStrip
              bits={pred.map((p) => (p ? 1 : 0))}
              onToggle={flip}
              groups={GROUPS}
              size="sm"
              labelOf={(i) => i}
              ariaLabelOf={(i) => `lane ${i} takes path A`}
              ariaLabel="Which lanes take path A"
            />
          </div>
        )}
        {tripError && mode === 'loop' && <Hint tone="muted" block>{tripError}</Hint>}
        <CellGrid rows={ROWS} cols={COLS} size="md" cell={cell} ariaLabel={`The ${WARP_SIZE} lanes of a warp`} />
        <ProvenanceRow>
          <Provenance kind="toy">path A is {PATH_A_COST} instructions and path B {PATH_B_COST}; the warp issues one instruction per step to all {WARP_SIZE} lanes</Provenance>
          <Provenance kind="from-memory">an NVIDIA warp is 32 threads; AMD&apos;s wavefront is 32 or 64 depending on the architecture; verify against the CUDA Programming Guide and AMD&apos;s ISA documents</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
