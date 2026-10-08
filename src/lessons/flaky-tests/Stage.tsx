import { useMemo, useState } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { useInterval } from '../../core/useInterval';
import { batchCaption, introCaption, runCaption, runLines, toggleCaption } from './frames';
import {
  FIRST_TRY_RATE, MAX_RETRIES, SLEEP_MS, SOURCES, TEST_OF, TESTS, exactGreen, finalRate, runSeed, runSuite, summarise, timeOfDay,
  type Config, type Run, type SourceId,
} from './sim';
import './styles.css';

const GRID = 10;
const RUNS = GRID * GRID;
/** Cells filled per tick while a batch plays in, and the tick length. */
const FILL_PER_TICK = 2;
const FILL_MS = 24;

interface SourceRow {
  what: string;
  fix: string;
  owner: string;
}
const ROWS: Record<SourceId, SourceRow> = {
  sleep: { what: `sleep(${SLEEP_MS}) and hope the receipt job is done`, fix: 'await the job', owner: '@notifications' },
  order: { what: 'shares one cart with applyCoupon; the runner shuffles test order', fix: 'fresh cart per test', owner: '@cart' },
  clock: { what: 'reads the real clock: "issued + 1 h is still today"', fix: 'inject a fake clock (12:00)', owner: '@auth' },
  random: { what: 'picks a random quantity 0-9, unseeded', fix: 'seed the data', owner: '@cart' },
  race: { what: 'two reservations race in reserveStock: a real product bug', fix: 'lock the update (fix the code)', owner: '@inventory' },
};
const STEADY = TESTS.filter((t) => !t.source).length;

const batchRuns = (batch: number, cfg: Config): Run[] => (batch ? Array.from({ length: RUNS }, (_, i) => runSuite(runSeed(batch, i), cfg)) : []);
const toggled = <T,>(set: ReadonlySet<T>, v: T) => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

export function Stage() {
  const [fixed, setFixed] = useState<ReadonlySet<SourceId>>(new Set());
  const [quarantined, setQuarantined] = useState<ReadonlySet<string>>(new Set());
  const [retry, setRetry] = useState(false);
  const [batch, setBatch] = useState(0);
  const [shown, setShown] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(introCaption());

  const cfg: Config = useMemo(() => ({ fixed, quarantined, retries: retry ? MAX_RETRIES : 0 }), [fixed, quarantined, retry]);
  const runs = useMemo(() => batchRuns(batch, cfg), [batch, cfg]);
  const visible = runs.slice(0, shown);
  const s = summarise(visible);
  const green = s.pass + s.retried;
  const exact = exactGreen(cfg);
  const filling = batch > 0 && shown < RUNS;
  const sel = selected !== null && selected < shown ? runs[selected] : null;

  useInterval(() => {
    const next = Math.min(RUNS, shown + FILL_PER_TICK);
    setShown(next);
    if (next === RUNS) setCaption(batchCaption(summarise(runs), cfg));
  }, FILL_MS, filling);

  const runBatch = () => {
    setBatch(batch + 1);
    setShown(0);
    setSelected(null);
    setCaption(<>Running 100 more seeded runs ({runSeed(batch + 1, 0)} to {runSeed(batch + 1, RUNS - 1)})…</>);
  };

  /** A changed config re-runs the same seeds, so the cells that flip are exactly the ones that fix touched. */
  const apply = (next: Config, what: string, on: boolean) => {
    if (batch && !filling) setCaption(batchCaption(summarise(batchRuns(batch, next)), next));
    else setCaption(toggleCaption(what, on, exactGreen(next)));
  };
  const toggleFix = (src: SourceId) => {
    const next = toggled(fixed, src);
    setFixed(next);
    apply({ ...cfg, fixed: next }, `Fix "${ROWS[src].fix}"`, next.has(src));
  };
  const toggleQuarantine = (src: SourceId) => {
    const next = toggled(quarantined, TEST_OF[src]);
    setQuarantined(next);
    apply({ ...cfg, quarantined: next }, `Quarantine of ${TEST_OF[src]}`, next.has(TEST_OF[src]));
  };
  const toggleRetry = (on: boolean) => {
    setRetry(on);
    apply({ ...cfg, retries: on ? MAX_RETRIES : 0 }, 'Retry until green', on);
  };
  const pick = (r: number, c: number) => {
    const i = r * GRID + c;
    if (i >= shown) return;
    setSelected(i);
    setCaption(runCaption(runs[i]));
  };
  const replay = (run: Run) => {
    const again = runSuite(run.seed, cfg);
    const same = JSON.stringify(again) === JSON.stringify(run);
    setCaption(same
      ? <>Replayed seed <b>{run.seed}</b>: the identical order, draws and {run.status === 'pass' ? 'pass' : 'failure'}. A seed turns &quot;it failed once on CI&quot; into a bug you can rerun.</>
      : <>Replayed seed <b>{run.seed}</b>: a different result. That would mean the run isn&apos;t a function of its seed.</>);
  };

  const cell = (r: number, c: number): GridCellSpec => {
    const i = r * GRID + c;
    if (i >= shown) return { tone: 'muted', fill: 'outline' };
    const run = runs[i];
    const tone = run.status === 'pass' ? 'ok' : run.status === 'retried' ? 'orange' : 'bad';
    return { tone, fill: 'solid', text: run.realBugHidden ? '!' : undefined };
  };
  const cellLabel = (r: number, c: number) => {
    const i = r * GRID + c;
    if (i >= shown) return `Run ${i + 1}, not run yet`;
    const run = runs[i];
    const status = run.status === 'pass' ? 'passed' : run.status === 'retried' ? 'green after a retry' : 'failed';
    return `Run ${i + 1}, seed ${run.seed}, ${status}${run.realBugHidden ? ', real race hidden' : ''}`;
  };

  return (
    <StageFrame
      height={440}
      stats={
        <Stats>
          <Stat label="Green runs" value={shown ? `${green} / ${shown}` : '–'} color="var(--ok)" sub={`exact chance per run: ${pct(exact, 1)}`}>
            <Bar value={shown ? green / shown : 0} tone="ok" />
          </Stat>
          <Stat label="Green only after a retry" value={shown ? s.retried : '–'} color="var(--orange)" sub={retry ? `up to ${MAX_RETRIES} retries` : 'retries off'} />
          <Stat label="Real bugs hidden" value={shown ? s.realBugsHidden : '–'} color={s.realBugsHidden ? 'var(--bad)' : 'var(--muted)'} sub="race tripped, not reported" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'run passed' },
            { color: 'var(--orange)', label: 'green only after a retry' },
            { color: 'var(--bad)', label: 'run failed' },
            { color: 'var(--hi)', label: 'selected run (ring)', shape: 'line' },
            { color: 'var(--dim)', label: 'quarantined test' },
          ]}
        />
      }
      controls={[
        <>
          <Button variant="primary" onClick={runBatch} disabled={filling}>
            Run ×100
          </Button>
          <Toggle label="Retry failed tests" value={retry} onChange={toggleRetry} off="No" on={`Up to ${MAX_RETRIES}×`} />
          <Hint>Fix and quarantine each flaky test in the suite list. Click a run to see why it failed.</Hint>
        </>,
      ]}
    >
      <div className="ft stage-pad">
        <div className="ft-runs">
          <SectionTitle hint={batch ? `seeds ${runSeed(batch, 0)}-${runSeed(batch, RUNS - 1)}` : 'not run yet'}>100 runs of the suite</SectionTitle>
          <CellGrid
            rows={GRID}
            cols={GRID}
            size="sm"
            cell={cell}
            onCellClick={pick}
            cellAriaLabel={cellLabel}
            highlight={selected !== null && selected < shown ? [{ r: Math.floor(selected / GRID), c: selected % GRID, tone: 'hi' }] : []}
            ariaLabel={shown ? `100 runs: ${green} green, ${s.retried} after a retry, ${s.fail} failed` : '100 runs, not run yet'}
            className="ft-grid"
          />
          <Hint tone="muted" block>
            A <b>!</b> marks a run where the real race tripped but nothing reported it.
          </Hint>
        </div>
        <div className="ft-side">
          <SectionTitle hint={`+ ${STEADY} steady tests`}>Flaky tests in the suite</SectionTitle>
          <ul className="ft-list">
            {SOURCES.map((src) => {
              const id = TEST_OF[src];
              const isFixed = fixed.has(src);
              const isQ = quarantined.has(id);
              const rate = isFixed ? 0 : FIRST_TRY_RATE[src];
              const after = isFixed ? 0 : finalRate(src, MAX_RETRIES);
              return (
                <li key={src} className={`ft-row ${isQ ? 'is-quarantined' : ''}`}>
                  <div className="ft-row-head">
                    <code>{id}</code>
                    <span className="ft-rate">{isFixed ? 'fixed: never fails' : `fails ${pct(rate, 1)} of runs${retry ? `, ${pct(after, 1)} after retries` : ''}`}</span>
                  </div>
                  <span className="ft-what">{ROWS[src].what}</span>
                  <div className="ft-row-actions">
                    <ChipButton tone="ok" on={isFixed} onClick={() => toggleFix(src)}>
                      {ROWS[src].fix}
                    </ChipButton>
                    <ChipButton tone="muted" on={isQ} onClick={() => toggleQuarantine(src)}>
                      Quarantine
                    </ChipButton>
                    {isQ && <span className="chip tone-dim ft-owner">owner {ROWS[src].owner}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="ft-detail">
            <ConsolePanel
              title={sel ? `run ${selected! + 1} · seed ${sel.seed} · started ${timeOfDay(sel.startS)}` : 'test runner'}
              lines={sel ? runLines(sel) : []}
              empty="click a run to see its tests"
            />
            {sel && (
              <Button onClick={() => replay(sel)}>
                Replay seed {sel.seed}
              </Button>
            )}
          </div>
          <Hint block>
            Simulated test runs; failure rates are illustrative. Here even the clock, the job timing and the test order come from the
            run&apos;s seed, so a replay is exact. On a real CI machine only the order and seeded data replay exactly; timing and the clock don&apos;t.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}
