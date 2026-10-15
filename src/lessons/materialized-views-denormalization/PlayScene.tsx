import { useMemo, type ReactNode } from 'react';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, SortTh, Stat, Stats } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { useIntroCaption } from '../../core/caption';
import { ratioText, sig } from '../../core/format';
import type { Tone } from '../../core/tone';
import { crossoverCaption, playCaption } from './captions';
import { DashboardTable } from './DashboardTable';
import { STRATEGIES, Counter, liveDashboard, seededWorld, shown, type CopyFix, type Strategy } from './shop';
import { usePlayground } from './usePlayground';
import { RATIO, STALENESS_REFRESH, WORKLOAD_CONFIG, WORLD_SEED, crossover, cycleCost, workloadTotal } from './workload';

export type PlaySceneId = 'workload' | 'staleness' | 'anomaly';

const STRATEGY_TONE: Record<Strategy, Tone> = { live: 'sky', full: 'amber', incremental: 'pink', copy: 'orange' };
const FIXES: { value: CopyFix; label: string }[] = [{ value: 'none', label: 'no fix' }, { value: 'update', label: 'update every copy' }, { value: 'recompute', label: 'recompute on read' }];
/** The seeded shop the totals, the plot and the crossover are about: they do not follow the operations you press. */
const BASE_WORLD = seededWorld(WORLD_SEED);
const RATIO_STEPS_PER_DECADE = 10;
const RATIO_DECADES = Math.log10(RATIO.max / RATIO.min);

/** The slider's position of a reads-per-write ratio on a log scale, and back. */
const ratioAt = (position: number): number => Number((RATIO.min * 10 ** (position / RATIO_STEPS_PER_DECADE)).toPrecision(2));
const positionOf = (ratio: number): number => Math.round(Math.log10(ratio / RATIO.min) * RATIO_STEPS_PER_DECADE);

interface TotalRow { strategy: Strategy; label: string; total: number; reads: number; writes: number; times: number }
type TotalKey = 'label' | 'total' | 'times';

export function PlayScene({ scene, picker, ratio, setRatio }: { scene: PlaySceneId; picker: ReactNode; ratio: number; setRatio: (r: number) => void }) {
  const pinned: Strategy = scene === 'staleness' ? 'full' : scene === 'anomaly' ? 'copy' : 'live';
  const pg = usePlayground(pinned, scene === 'workload' ? WORKLOAD_CONFIG : { refreshEvery: STALENESS_REFRESH.initial, fix: 'none' });
  const live = liveDashboard(pg.state.world, new Counter());
  const view = shown(pg.strategy, pg.cfg, pg.state);

  const totals = useMemo<TotalRow[]>(() => {
    const raw = STRATEGIES.map((s) => ({ strategy: s.value, label: s.label, ...workloadTotal(s.value, WORKLOAD_CONFIG, ratio) }));
    const best = Math.min(...raw.map((r) => r.total));
    return raw.map((r) => ({ ...r, times: r.total / best }));
  }, [ratio]);
  const { sorted, headerProps } = useSortedRows<TotalRow, TotalKey>(totals, { label: (r) => r.label, total: (r) => r.total, times: (r) => r.times }, { key: 'total' });
  const cross = crossover('incremental', 'live', WORKLOAD_CONFIG, BASE_WORLD);

  useIntroCaption(
    scene === 'workload' ? <>{crossoverCaption(BASE_WORLD, WORKLOAD_CONFIG, ratio, totals)} {playCaption(pg)}</> : playCaption(pg),
    [scene, ratio, pg.state, pg.cfg, pg.last, pg.strategy],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Last operation" value={pg.last ? `${pg.last.touched} rows` : '–'} color="var(--info)" sub={pg.last ? pg.last.label : 'press one below'} />
          <Stat label="Tables" value={`${pg.state.world.items.length} items`} sub={`${pg.state.world.orders.length} orders, ${pg.state.world.products.length} products`} />
          {scene === 'staleness' && <Stat label="Behind" value={`${pg.state.writesSince} ${pg.state.writesSince === 1 ? 'write' : 'writes'}`} color={pg.differences.length ? 'var(--bad)' : 'var(--ok)'} sub={pg.differences.length ? `${pg.differences.length} rows differ` : 'equals the live query'} />}
          {scene === 'anomaly' && <Stat label="Old-name copies" value={pg.state.world.items.filter((i) => pg.state.world.products.find((p) => p.id === i.productId)!.name !== i.nameCopy).length} color={pg.differences.length ? 'var(--bad)' : 'var(--ok)'} sub={pg.cfg.fix === 'none' ? 'no fix on' : FIXES.find((f) => f.value === pg.cfg.fix)!.label} />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'live answer' },
            { color: 'var(--bad)', label: 'stale or inconsistent' },
            { color: 'var(--hi)', label: 'row just written' },
            { color: 'var(--info)', label: 'precomputed data' },
            { color: 'var(--violet)', label: 'crossover' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {scene === 'workload' && <Segmented label="Read strategy" value={pg.strategy} onChange={pg.setStrategy} options={STRATEGIES} />}
          {scene !== 'workload' && <span className="mv-pinned">Strategy in this scene: {STRATEGIES.find((s) => s.value === pinned)!.label}</span>}
        </>,
        <>
          <Button variant="primary" onClick={pg.place}>Place an order</Button>
          <Button onClick={pg.refund} disabled={pg.state.world.items.length === 0}>Refund an item</Button>
          <Button onClick={pg.rename}>Rename a product</Button>
          <Button onClick={pg.readDashboard}>Read the dashboard</Button>
          <Button onClick={pg.reset}>Reset</Button>
        </>,
        ...(scene === 'workload'
          ? [<><Slider label="Reads per write" value={positionOf(ratio)} min={0} max={Math.round(RATIO_DECADES * RATIO_STEPS_PER_DECADE)} onChange={(p) => setRatio(ratioAt(p))} format={() => `${sig(ratio, 2)} reads per write`} /></>]
          : []),
        ...(scene === 'staleness'
          ? [<><Slider label="Refresh every" value={pg.cfg.refreshEvery} min={STALENESS_REFRESH.min} max={STALENESS_REFRESH.max} onChange={(refreshEvery) => pg.setCfg({ refreshEvery })} format={(v) => `${v} ${v === 1 ? 'operation' : 'operations'}`} /></>]
          : []),
        ...(scene === 'anomaly' ? [<><Segmented label="Rename fix" value={pg.cfg.fix} onChange={(fix) => pg.setCfg({ fix })} options={FIXES} /></>] : []),
      ]}
    >
      <div className="mv-stage stage-pad">
        <DashboardTable world={pg.state.world} shown={view} live={live} strategy={pg.strategy} changed={pg.changed} refreshed={pg.refreshed} />
        {scene === 'workload' && (
          <>
            <div className="mv-table-wrap" tabIndex={0} role="region" aria-label="Total rows touched per strategy, sortable by column">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortTh {...headerProps('label')}>Strategy</SortTh>
                    <SortTh {...headerProps('total')}>Rows touched</SortTh>
                    <SortTh {...headerProps('times')}>vs cheapest</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.strategy} className={r.times === 1 ? 'is-ok' : r.total === Math.max(...totals.map((t) => t.total)) ? 'is-bad' : ''}>
                      <td>{r.label}</td>
                      <td>{r.total.toLocaleString('en-US')} ({r.reads.toLocaleString('en-US')} read, {r.writes.toLocaleString('en-US')} written)</td>
                      <td>{ratioText(r.times)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Plot2D
              x={{ domain: [RATIO.min, RATIO.max], log: true, label: 'reads per write', tickValues: [0.1, 1, 10, 100, 1000] }}
              y={{ domain: [1, 100000], log: true, label: 'rows per write and its reads' }}
              width={356}
              height={240}
              ariaLabel="Rows touched per write and its reads against reads per write, for the four strategies"
            >
              {STRATEGIES.map((s) => <Curve key={s.value} fn={(r) => cycleCost(s.value, WORKLOAD_CONFIG, BASE_WORLD, r)} tone={STRATEGY_TONE[s.value]} />)}
              {cross !== null && cross >= RATIO.min && <VLine at={cross} tone="violet" label="crossover" />}
              <VLine at={ratio} tone="hi" />
            </Plot2D>
          </>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">a toy engine: counts are rows touched, not milliseconds; real refresh and trigger costs differ</Provenance>
          {scene === 'workload' && <Provenance kind="simulated" seed={3}>a seeded workload of 20 writes; the full-refresh view rebuilds every {WORKLOAD_CONFIG.refreshEvery} operations</Provenance>}
          {scene !== 'workload' && <Provenance kind="simulated" seed={3}>a seeded shop of 5 customers, 6 products and 12 orders</Provenance>}
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
