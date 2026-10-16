import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { ALL_ORDERS, INSTANCES, NEW_COLUMN, OLD_COLUMN, PRESETS, ROWS, STEP_IDS, type StepId } from './model';
import { CODE_LINES, MIGRATION_OPEN, STEP_LABEL, cleanCount, codeState, eventsOf, fleetOf, frameCaption, presetOrder, requestRows, rowRail, runOf, tableCell, verdictText } from './view';

const ROW_NUMBERS = Array.from({ length: ROWS }, (_, i) => i + 1);
const STEP_MS = 1100;
const CELL = { cell: 36 };

interface MFrame extends Frame {
  index: number;
}

export function MigrationScene({ picker }: { picker: ReactNode }) {
  const [order, setOrder] = useState<StepId[]>([...MIGRATION_OPEN.order]);
  const [deploy, setDeploy] = useState<number>(MIGRATION_OPEN.deploy);
  const [seed, setSeed] = useState<number>(MIGRATION_OPEN.seed);
  const [preset, setPreset] = useState<string | null>(null);

  const run = useMemo(() => runOf(order, deploy, seed), [order, deploy, seed]);
  const frames: MFrame[] = useMemo(() => run.frames.map((_, index) => ({ index, say: frameCaption(run, index) })), [run]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const i = player.frame.index;
  const s = run.frames[i];
  const clean = useMemo(() => cleanCount(deploy, seed), [deploy, seed]);
  const events = useMemo(() => requestRows(eventsOf(run, i)), [run, i]);
  const atEnd = i === run.frames.length - 1;
  const press = (id: StepId) => {
    setOrder([...order, id]);
    setPreset(null);
  };

  return (
    <StageFrame
      player={player}
      height={640}
      stats={
        <Stats>
          <Stat label="Failed requests" value={run.errors} color={run.errors > 0 ? 'var(--bad)' : undefined} sub="named a column that is not there" />
          <Stat label="Stale reads" value={run.staleReads} color={run.staleReads > 0 ? 'var(--orange)' : undefined} sub="not the last value written" />
          <Stat label="Rows left wrong" value={run.lostRows.length} color={run.lostRows.length > 0 ? 'var(--bad)' : undefined} sub={`of ${ROWS}, at the end`} />
          <Stat label="Clean orderings" value={`${clean} of ${ALL_ORDERS.length}`} color="var(--ok)" sub={`at ${deploy}% of the fleet on v2 at the start, seed ${seed}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the old column; instances on v1', shape: 'square' },
            { color: 'var(--violet)', label: 'instances on v2', shape: 'square' },
            { color: 'var(--ok)', label: 'the new column, holding the last value written', shape: 'square' },
            { color: 'var(--orange)', label: 'a stale value in the new column, or a stale read', shape: 'square' },
            { color: 'var(--bad)', label: 'a failed request or statement', shape: 'square' },
            { color: 'var(--dim)', label: 'a column not there (not added yet, or dropped)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" on={preset === p.id} onClick={() => { setOrder(presetOrder(p.id)); setPreset(p.id); }}>{p.label}</ChipButton>
          ))}
        </>,
        <>
          {STEP_IDS.map((id) => (
            <Button key={id} softDisabled={order.includes(id)} onClick={() => press(id)}>{STEP_LABEL[id]}</Button>
          ))}
          <Button onClick={() => { setOrder([]); setPreset(null); }}>Clear</Button>
        </>,
        <>
          <Slider label="Fleet already on v2 at the start" value={deploy} min={0} max={100} step={10} onChange={setDeploy} format={(v) => `${v}%`} />
          <SeedField seed={seed} onSeed={setSeed} label="Seed (the request mix)" />
        </>,
      ]}
    >
      <div className="zdm-stage stage-pad">
        <div className="zdm-two">
          <Box>
            <SectionTitle hint={`${INSTANCES} instances, each running v1 or v2`}>Fleet and table</SectionTitle>
            <div className="zdm-fleet" role="img" aria-label={`${s.v2} instances on v2, ${INSTANCES - s.v2} on v1`}>
              {fleetOf(s).map((v, k) => <span key={k} className={`zdm-inst is-${v}`}>{v}</span>)}
            </div>
            <CellGrid
              rows={ROWS}
              cols={2}
              size={CELL}
              rowLabels={ROW_NUMBERS}
              colLabels={[OLD_COLUMN, 'new']}
              cell={(r, c) => tableCell(s, r, c as 0 | 1)}
              rowDecor={(r) => rowRail(s, r)}
              ariaLabel={`users table, ${ROWS} rows: ${OLD_COLUMN} and ${NEW_COLUMN}`}
            />
          </Box>
          <Box>
            <SectionTitle hint="the highlighted line is the step shown">The steps</SectionTitle>
            <CodePanel title="migration" lines={CODE_LINES} stateOf={(k) => codeState(run, i, STEP_IDS[k])} />
            <Hint tone="muted" block>{order.length === 0 ? 'No steps chosen yet.' : `Order: ${order.map((o) => STEP_IDS.indexOf(o) + 1).join(', ')}. Steps you leave out never run.`}</Hint>
          </Box>
        </div>
        <Box>
          <SectionTitle hint="the requests around this step">Requests</SectionTitle>
          <LogStream label="Requests" rows={events} maxHeight={170} live="off" empty="Nothing has run yet." />
        </Box>
        {atEnd && order.length > 0 && <p className={`zdm-verdict ${run.clean ? 'is-ok' : 'is-bad'}`} role="status">{verdictText(run)}</p>}
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>a 12-row table and ten app instances; every request is evaluated against the toy schema, requests simulated</Provenance>
          <Provenance kind="real">the toy's verdicts are checked in the lesson's tests against real SQLite for all 720 orderings</Provenance>
          <Provenance kind="illustrative">the SQL shown is generic; the fleet upgrades a fifth of itself at each step to stand for a rolling deploy</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
