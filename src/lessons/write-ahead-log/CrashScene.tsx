import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import type { Frame } from '../../core/types';
import { plural, recoveryCaption } from './captions';
import { ACK_EARLY_SEED, CRASH_OPEN, PAGE_NUMBERS, WAL_OFF_SEED, clampSecondCrash, imageRows } from './view';
import { MAX_OPS, PAGES, SEEDS, planFor, recoverySteps, recoveryTimeline, runSeed, type Policy, type RecoveryFrame } from './wal';

const RECOVERY_CODE = [
  'redo from the checkpoint\'s redo point:',
  '  for each update or undo record, oldest first:',
  '    if page.lsn < record.lsn: apply it, page.lsn = record.lsn',
  '    else: skip it (the page already has it)',
  'undo the losers (no commit record), newest record first:',
  '  write an undo record, put the before-image back',
  '  when a loser has nothing left: write its abort record',
];
const LINE_OF = { redo: 2, skip: 3, undo: 5, end: 6 } as const;
const STEP_MS = 450;
const CELL = { cell: 30 };

interface RFrame extends Frame {
  index: number;
  f: RecoveryFrame;
}

export function CrashScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState<number>(CRASH_OPEN.seed);
  const [enforceWal, setEnforceWal] = useState<boolean>(CRASH_OPEN.enforceWal);
  const [ackBefore, setAckBefore] = useState<boolean>(CRASH_OPEN.ackBeforeFsync);
  const [crashAt, setCrashAt] = useState<number | null>(null);
  const [torn, setTorn] = useState<boolean | null>(null);
  const [second, setSecond] = useState<boolean>(CRASH_OPEN.secondCrash);
  const [secondStep, setSecondStep] = useState<number>(CRASH_OPEN.secondCrashStep);

  const plan = useMemo(() => planFor(seed), [seed]);
  const policy: Partial<Policy> = useMemo(() => ({ enforceWal, ackBeforeFsync: ackBefore }), [enforceWal, ackBefore]);
  const crashAfter = crashAt ?? plan.crashAfter;
  const tornEnd = torn ?? plan.torn;
  // how many steps recovery takes on this crash: the second-crash slider ends there, since past it recovery has already finished
  const recoveryLength = useMemo(() => recoverySteps(runSeed(seed, policy, { crashAfter, torn: tornEnd, recrashAfter: null }).image).events.length, [seed, policy, crashAfter, tornEnd]);
  const recrashAfter = second ? clampSecondCrash(secondStep, recoveryLength) : null;
  const effective = { crashAfter, torn: tornEnd, recrashAfter };
  const run = useMemo(() => runSeed(seed, policy, { crashAfter, torn: tornEnd, recrashAfter }), [seed, policy, crashAfter, tornEnd, recrashAfter]);
  const timeline = useMemo(() => recoveryTimeline(run.image, recrashAfter), [run, recrashAfter]);
  const frames: RFrame[] = useMemo(
    () => timeline.map((f, index) => ({ index, f, say: recoveryCaption(f.event, f.crashed, index, timeline.length - 1) })),
    [timeline],
  );
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const cur = player.frame.f;
  const atEnd = player.frame.index === frames.length - 1;
  const idempotent = useMemo(() => {
    const again = recoverySteps({ ...run.recovered, torn: null }).image;
    return again.disk.every((v, p) => v === run.recovered.disk[p]);
  }, [run]);
  const ops = plan.ops.slice(0, effective.crashAfter);
  const lowest = (p: Partial<Policy>) => SEEDS.find((s) => runSeed(s, p).violations.length > 0);
  const walOffLowest = useMemo(() => lowest({ enforceWal: false }), []);
  const ackLowest = useMemo(() => lowest({ ackBeforeFsync: true }), []);
  const newSeed = (s: number) => {
    setSeed(s);
    setCrashAt(null);
    setTorn(null);
  };
  const replayed = run.firstEvents.filter((e) => e.kind === 'redo' || e.kind === 'skip').length;

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Operations before the crash" value={`${effective.crashAfter} of ${plan.ops.length}`} sub={`seed ${seed}`} />
          <Stat label="Log records durable" value={run.image.log.length} sub={`${run.before.log.length - run.image.log.length} lost with memory`} />
          <Stat label="Records scanned by redo" value={replayed} sub="from the redo point to the end" />
          <Stat label="Invariants after recovery" value={run.violations.length === 0 ? 'hold' : 'broken'} color={run.violations.length === 0 ? 'var(--ok)' : 'var(--bad)'} sub={run.violations.length === 0 ? 'equals serial replay' : `${plural(run.violations.length, 'violation')}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a committed transaction', shape: 'square' },
            { color: 'var(--bad)', label: 'a loser, or a page that disagrees with the replay', shape: 'square' },
            { color: 'var(--hi)', label: 'the recovery step now', shape: 'square' },
            { color: 'var(--orange)', label: 'a torn record, ignored', shape: 'square' },
            { color: 'var(--info)', label: 'a page LSN', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={newSeed} />
          <Button onClick={() => newSeed(WAL_OFF_SEED)}>Load seed {WAL_OFF_SEED}</Button>
          <Button onClick={() => newSeed(ACK_EARLY_SEED)}>Load seed {ACK_EARLY_SEED}</Button>
        </>,
        <>
          <Toggle label="WAL rule" value={enforceWal} onChange={setEnforceWal} off="Off (broken)" on="Enforced" />
          <Toggle label="Acknowledge commit" value={ackBefore} onChange={setAckBefore} off="After fsync" on="Before fsync (broken)" />
          <Toggle label="Last record" value={effective.torn} onChange={setTorn} off="Intact" on="Torn" />
        </>,
        <>
          <Slider label="Crash after operation" value={effective.crashAfter} min={1} max={plan.ops.length} onChange={setCrashAt} />
          <Toggle label="Second crash" value={second} onChange={setSecond} off="None" on="During recovery" />
          {second && (recoveryLength > 0 ? <Slider label="after recovery step" value={recrashAfter ?? 0} min={0} max={recoveryLength} onChange={setSecondStep} /> : <Hint tone="muted">Recovery has nothing to do on this crash, so there is nothing to interrupt.</Hint>)}
        </>,
      ]}
    >
      <div className="wal-stage stage-pad">
        <div className="wal-two">
          <Box>
            <SectionTitle hint="what the crash left: only the durable part survives">The log on disk</SectionTitle>
            <LogStream label="Durable log" rows={imageRows({ ...run.image, log: cur.log, torn: player.frame.index === 0 ? run.image.torn : null })} maxHeight={230} follow max={MAX_OPS * 3} live="off" empty="Nothing was durable." />
          </Box>
          <Box>
            <SectionTitle hint="the data file, with each page's LSN">Pages on disk</SectionTitle>
            <CellGrid
              rows={PAGES}
              cols={2}
              size={CELL}
              rowLabels={PAGE_NUMBERS}
              colLabels={['value', 'LSN']}
              cell={(r, c) => {
                const bad = atEnd && run.violations.some((x) => x.message.startsWith(`page ${r} `));
                return c === 0 ? { text: String(cur.disk[r]), tone: bad ? 'bad' : 'ok', fill: 'tint' } : { text: String(cur.diskLsn[r]), tone: 'info', fill: 'outline' };
              }}
              highlight={cur.event && cur.event.kind !== 'end' ? [{ r: cur.event.page, c: 0, tone: 'hi' }] : []}
              ariaLabel="Pages on disk during recovery"
            />
          </Box>
        </div>
        <Box>
          <SectionTitle hint="the highlighted line is the step shown">Recovery</SectionTitle>
          <CodePanel title="recovery" lines={RECOVERY_CODE} active={cur.event ? LINE_OF[cur.event.kind] : undefined} />
        </Box>
        <Box>
          <SectionTitle hint={`${plural(ops.length, 'operation')} ran before the crash`}>Verdict at the end of recovery</SectionTitle>
          {atEnd ? (
            <p className={`wal-verdict ${run.violations.length > 0 ? 'is-bad' : 'is-ok'}`} role="status">
              {run.violations.length === 0
                ? `Seed ${seed}: the recovered pages equal a serial replay of the committed transactions, every acknowledged commit is present and no uncommitted write survived. Running recovery again ${idempotent ? 'changes nothing' : 'changes the pages'}.`
                : run.violations.map((v) => `${v.rule === 'D' ? 'Durability broken' : v.rule === 'A' ? 'Atomicity broken' : 'Mismatch'}: ${v.message}.`).join(' ')}
            </p>
          ) : (
            <p className="wal-note">Step to the end of recovery to see the verdict.</p>
          )}
          <p className="wal-note">
            Over seeds 0 to {SEEDS.length - 1}: with the WAL rule off the lowest failing seed is {walOffLowest ?? 'none'} (atomicity); acknowledging before fsync, {ackLowest ?? 'none'} (durability); with both protections on, no seed fails.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a random mix of writes, commits, aborts, flushes, fsyncs and checkpoints, then a crash</Provenance>
          <Provenance kind="toy">recovery writes pages straight to disk and logs its undo records durably; real systems differ in the details</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
