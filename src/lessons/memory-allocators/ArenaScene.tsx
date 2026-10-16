import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { pct } from '../../core/format';
import { plainTone } from '../../core/tone';
import { ALLOC_CHIPS, ARENA_UNITS, POLICIES, POLICY_LABELS, SCRIPT, SCRIPT_SEED, UNIT_BYTES, metrics, runScript, type Policy } from './arena';
import { arenaCaption, n } from './captions';
import { ROWS, UNITS_PER_ROW, allocate, freeBlock, playScript, reset, sessionOpening, setCoalesce, unitOf } from './session';

const CELL = { cell: 20, gap: 2, font: 10 } as const;
const POLICY_OPTIONS = POLICIES.map((p) => ({ value: p, label: POLICY_LABELS[p] }));

export function ArenaScene({ picker }: { picker: ReactNode }) {
  const [session, setSession] = useState(sessionOpening);
  const { arena, policy, coalesce, last } = session;
  const m = metrics(arena);
  const caption = arenaCaption(last, arena);
  const placed = last?.kind === 'alloc' ? last.result.placed : null;
  const failed = last?.kind === 'alloc' && last.result.outcome !== 'placed' ? last.result.outcome : null;

  const unitSeg = useMemo(() => {
    const byUnit = Array.from({ length: ARENA_UNITS }, () => arena.segs[0]);
    for (const s of arena.segs) for (let u = s.start; u < s.start + s.size; u++) byUnit[u] = s;
    return byUnit;
  }, [arena]);

  const cell = (r: number, c: number): GridCellSpec => {
    const u = unitOf(r, c);
    const s = unitSeg[u];
    if (s.id === null) return { tone: 'dim', fill: 'outline' };
    return { text: u === s.start ? s.id : undefined, tone: plainTone(s.id), fill: 'tint', intensity: 0.4 };
  };
  const onCell = (r: number, c: number) => {
    const s = unitSeg[unitOf(r, c)];
    if (s.id !== null) setSession((cur) => freeBlock(cur, s.id!));
  };

  const table = useMemo(() => POLICIES.map((p) => ({ policy: p, run: runScript(p, coalesce) })), [coalesce]);

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Free in total" value={`${n(m.freeTotal)} units`} sub={`${n(m.holes)} ${m.holes === 1 ? 'hole' : 'holes'}, ${n(m.blocks)} ${m.blocks === 1 ? 'block' : 'blocks'}`} />
          <Stat label="Largest free block" value={`${n(m.largestFree)} units`} color={m.largestFree < m.freeTotal ? 'var(--bad)' : undefined} />
          <Stat label="External fragmentation" value={pct(m.fragmentation, 1)} color={m.fragmentation > 0 ? 'var(--bad)' : 'var(--ok)'} sub="1 - largest free / total free" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a live block, one hue per block id', shape: 'square' },
            { color: 'var(--dim)', label: 'free hole (outlined)', shape: 'square' },
            { color: 'var(--hi)', label: 'the block just placed', shape: 'square' },
            { color: 'var(--bad)', label: 'fragmented: enough bytes, no hole', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Placement policy" value={policy} onChange={(p: Policy) => setSession((s) => ({ ...s, policy: p }))} options={POLICY_OPTIONS} />
          <Toggle label="Coalescing on free" value={coalesce} onChange={(on) => setSession((s) => setCoalesce(s, on))} off="Off" on="On" />
        </>,
        <>
          <ControlGroup label="alloc(n), in units" inline>
            {ALLOC_CHIPS.map((size) => (
              <ChipButton key={size} tone="info" onClick={() => setSession((s) => allocate(s, size))}>{size}</ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setSession((s) => playScript(s))}>Run the 200-operation script</Button>
          <Button onClick={() => setSession((s) => reset(s))}>Reset</Button>
        </>,
      ]}
    >
      <div className="ma-stage stage-pad">
        <Box>
          <SectionTitle hint={`${n(ARENA_UNITS)} units of ${UNIT_BYTES} bytes = ${n(ARENA_UNITS * UNIT_BYTES)} bytes; click a block to free it`}>The arena</SectionTitle>
          <CellGrid
            className="ma-arena"
            rows={ROWS}
            cols={UNITS_PER_ROW}
            size={CELL}
            cell={cell}
            onCellClick={onCell}
            cellAriaLabel={(r, c) => {
              const s = unitSeg[unitOf(r, c)];
              return s.id === null ? `unit ${unitOf(r, c)}, free` : `unit ${unitOf(r, c)}, block ${s.id} of ${s.size} units, press to free it`;
            }}
            highlight={placed ? Array.from({ length: placed.size }, (_, i) => ({ r: Math.floor((placed.start + i) / UNITS_PER_ROW), c: (placed.start + i) % UNITS_PER_ROW, tone: 'hi' as const })) : []}
            ariaLabel={`Arena of ${ARENA_UNITS} units, ${m.freeTotal} free in ${m.holes} holes`}
          />
          {failed === 'fragmented' && <p className="ma-failed" role="status">fragmented: enough bytes, no hole big enough</p>}
          {failed === 'full' && <p className="ma-failed is-full" role="status">out of memory: not enough free units</p>}
        </Box>
        <Box>
          <SectionTitle hint={`the same ${n(SCRIPT.length)}-operation seeded script, coalescing ${coalesce ? 'on' : 'off'}`}>Four policies, one workload</SectionTitle>
          <table className="data-table table-cards ma-table">
            <thead>
              <tr><th>Policy</th><th>Failed: fragmented</th><th>Failed: out of memory</th><th>Final fragmentation</th><th>Peak holes</th></tr>
            </thead>
            <tbody>
              {table.map(({ policy: p, run }) => (
                <tr key={p} className={p === policy ? 'ma-row-on' : undefined}>
                  <td data-label="Policy">{POLICY_LABELS[p]}</td>
                  <td data-label="Failed: fragmented">{n(run.failedFragmented)}</td>
                  <td data-label="Failed: out of memory">{n(run.failedFull)}</td>
                  <td data-label="Final fragmentation">{pct(metrics(run.arena).fragmentation, 1)}</td>
                  <td data-label="Peak holes">{n(run.peakHoles)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint tone="muted" block>
            Frees name objects, not addresses, so the script is valid under every policy; a free of an object whose allocation failed is skipped. This is one seeded script: another seed can reorder the rows, so read it as an example, not a ranking.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">an arena with four placement policies and a made-up size-class table; real allocators are far more elaborate, and nothing here models their metadata</Provenance>
          <Provenance kind="simulated" seed={SCRIPT_SEED}>the 200-operation script is seeded</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
