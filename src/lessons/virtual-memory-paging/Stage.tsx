import { useMemo, useState } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { pct } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { accessFrames, idleFrames, thrashFrames, type VmFrame } from './frames';
import { ADDRESS_PRESETS, parseAddress, PROCS, replay, startMachine, usefulShare, type Access, type Policy, type Proc } from './model';
import { sceneGeometry } from './layout';
import { Scene } from './Scene';
import { TranslatePanel } from './TranslatePanel';
import './styles.css';

const STEP_MS = 1300;
/** Smallest text in the scene: the 10.5px addresses. */
const SMALLEST_TEXT_PX = 10.5;

type Run = { kind: 'history'; history: Access[] } | { kind: 'thrash' };

export function Stage() {
  const [run, setRun] = useState<Run>({ kind: 'history', history: [] });
  const [policy, setPolicy] = useState<Policy>('fifo');
  const [proc, setProc] = useState<Proc>('A');
  const [addr, setAddr] = useState('0x3010');
  const [error, setError] = useState<string | null>(null);

  const frames: VmFrame[] = useMemo(() => {
    if (run.kind === 'thrash') return thrashFrames(policy);
    const { history } = run;
    if (history.length === 0) return idleFrames(startMachine());
    return accessFrames(replay(history.slice(0, -1), policy), history[history.length - 1], policy);
  }, [run, policy]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const g = sceneGeometry(f);
  const history = run.kind === 'history' ? run.history : [];

  const go = (a: Access) => {
    setError(null);
    setRun({ kind: 'history', history: [...history, a] });
  };
  const fromField = (write: boolean) => {
    const r = parseAddress(addr);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    go({ proc, vaddr: r.value, write });
  };
  const m = f.m;

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Page faults" value={m.faults} color="var(--orange)" />
          <Stat label="Swap writes" value={m.swapWrites} sub={`${m.swapReads} swap reads`} />
          {run.kind === 'thrash' && (
            <Stat label="Useful work" value={pct(usefulShare(m.hits, m.faults), 2)} sub="illustrative costs">
              <Bar value={usefulShare(m.hits, m.faults)} max={1} tone="bad" height={6} />
            </Stat>
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'address being translated', shape: 'square' },
            { color: 'var(--violet)', label: 'page → frame (shared frame tinted)', shape: 'line' },
            { color: 'var(--dim)', label: 'not in RAM (dashed: in swap)', shape: 'square' },
            { color: 'var(--orange)', label: 'page fault', shape: 'square' },
            { color: 'var(--bad)', label: 'segfault', shape: 'square' },
          ]}
        />
      }
      controls={[
        <ControlGroup label="Try" inline key="presets">
          {ADDRESS_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" onClick={() => go(p.access)}>
              {p.label}
            </ChipButton>
          ))}
          <ChipButton tone="orange" size="md" on={run.kind === 'thrash'} onClick={() => setRun({ kind: 'thrash' })}>
            Thrashing
          </ChipButton>
        </ControlGroup>,
        <>
          <Segmented label="Process" value={proc} onChange={setProc} options={PROCS.map((p) => ({ value: p, label: p }))} />
          <TextField label="Address" value={addr} onChange={setAddr} onEnter={() => fromField(false)} width={90} spellCheck={false} />
          <Button onClick={() => fromField(false)}>Read</Button>
          <Button onClick={() => fromField(true)}>Write</Button>
          <Segmented label="Eviction" value={policy} onChange={setPolicy} options={[{ value: 'fifo', label: 'FIFO' }, { value: 'clock', label: 'Clock' }]} />
          <Button
            onClick={() => {
              setError(null);
              setRun({ kind: 'history', history: [] });
            }}
          >
            Reset RAM
          </Button>
          <span className="vm-error" role="status" aria-live="polite">
            {error}
          </span>
        </>,
      ]}
    >
      <div className="vm stage-pad">
        <WideRegion minWidth={minWidthForText(g.width + 12, SMALLEST_TEXT_PX)} label="Address spaces and RAM: scroll sideways to see all of it">
          <Scene f={f} g={g} />
        </WideRegion>
        <Hint block>
          Toy sizes: a real x86-64 process has 2⁴⁸ bytes of virtual address space, 4 KiB pages and a 4-level page table. Disk times are illustrative.
          {history.length > 1 && ` RAM carries over between accesses (${history.length} so far); Reset RAM starts clean.`}
        </Hint>
        <TranslatePanel f={f} proc={proc} />
      </div>
    </StageFrame>
  );
}
