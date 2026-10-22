import { Plot2D, Steps, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { breakEvenLines, cheapest, costCaption, stageLabel } from './captions';
import {
  BENEFIT, COMPONENTS, CROSSOVER_SCAN, GROWTH, HORIZON, MAINTENANCE, OPTIONS, amount, benefitCounts, bestOnAllColumns, breakEven, componentOf, crossoverYear, placementOf, rows, series,
  type ComponentId, type OptionId,
} from './model';
import type { SceneProps } from './opening';

/** The narrowest width at which the seven-column table reads; narrower screens scroll it sideways. */
const TABLE_MIN_WIDTH = 560;
const PLOT = { width: 356, height: 250 } as const;
const COST_STEP = 100;
const TONE: Record<OptionId, 'orange' | 'sky' | 'pink'> = { build: 'orange', oss: 'sky', buy: 'pink' };
const TONE_VAR: Record<OptionId, string> = { build: 'var(--orange)', oss: 'var(--sky)', buy: 'var(--pink)' };
const COMPONENT_OPTIONS = COMPONENTS.map((c) => ({ value: c.id, label: c.label }));

/** Scene 2: the cost of each option over a horizon, with the benefit as an explicit assumption and its break-even beside it. */
export function CostScene({ picker, board, component, onComponent, assumptions: a, onAssumptions }: SceneProps) {
  const c = componentOf(component);
  const stage = placementOf(board.answers)[component];
  const rs = rows(c, stage, a);
  const cross = crossoverYear(c, a.growth, a.maintenance);
  const top = Math.ceil(Math.max(...OPTIONS.flatMap((o) => series(c, o.id, a).map(([, y]) => y))) / COST_STEP) * COST_STEP;
  const best = cheapest(rs);
  const buildVsBuy = breakEven(c, 'build', 'buy', a);
  const none = bestOnAllColumns(c, rs).length === 0;
  const set = (change: Partial<typeof a>) => onAssumptions({ ...a, ...change });
  const years = Array.from({ length: a.horizon + 1 }, (_, n) => n);

  return (
    <StageFrame
      height={900}
      intro={costCaption(c, stage, a)}
      introKey={`${component}|${stage}|${a.growth}|${a.maintenance}|${a.horizon}|${a.benefit[component]}|${a.includeReversal}`}
      stats={
        <Stats>
          <Stat label="Lowest net cost" value={best.map((o) => OPTIONS.find((x) => x.id === o)!.label.split(',')[0]).join(' / ')} color="var(--ok)" sub={`${amount(Math.min(...rs.map((r) => r.net)))} over ${a.horizon} years`} />
          <Stat label="Crossover year" value={cross === null ? 'none' : cross} sub={cross === null ? `buying has not cost more than building by year ${CROSSOVER_SCAN}` : `buying has cost more than building from year ${cross}${cross > a.horizon ? ' (beyond the horizon)' : ''}`} />
          <Stat label="Break-even benefit" value={buildVsBuy === null ? '–' : amount(buildVsBuy)} sub="a year, where build and buy swap places" />
          <Stat label="Benefit counted" value={benefitCounts(stage) ? `${amount(a.benefit[component])} a year` : '0'} color={benefitCounts(stage) ? 'var(--hi)' : undefined} sub={`placed ${stageLabel(stage)}`} />
        </Stats>
      }
      legend={<Legend items={OPTIONS.map((o) => ({ color: TONE_VAR[o.id], label: o.label, shape: 'line' as const }))} />}
      controls={[
        <>{picker}<Segmented ariaLabel="Component" value={component} options={COMPONENT_OPTIONS} onChange={(id: ComponentId) => onComponent(id)} /></>,
        <>
          <Slider label="Licence growth a year" value={a.growth} min={GROWTH.min} max={GROWTH.max} step={GROWTH.step} format={(v) => `${v}%`} onChange={(growth) => set({ growth })} />
          <Slider label="Maintenance a year" value={a.maintenance} min={MAINTENANCE.min} max={MAINTENANCE.max} step={MAINTENANCE.step} format={(v) => `${v}% of the build`} onChange={(maintenance) => set({ maintenance })} />
          <Slider label="Horizon" value={a.horizon} min={HORIZON.min} max={HORIZON.max} step={HORIZON.step} format={(v) => `${v} years`} onChange={(horizon) => set({ horizon })} />
        </>,
        <>
          <Slider label="Yearly benefit B" value={a.benefit[component]} min={BENEFIT.min} max={BENEFIT.max} step={BENEFIT.step} onChange={(v) => set({ benefit: { ...a.benefit, [component]: v } })} />
          <Toggle label="Reversal cost" value={a.includeReversal} onChange={(includeReversal) => set({ includeReversal })} off="Left out" on="Included" />
        </>,
      ]}
    >
      <div className="bb-stage stage-pad">
        <Plot2D x={{ domain: [0, a.horizon], label: 'year', tickValues: years }} y={{ domain: [0, top], label: 'cumulative cost', ticks: 5 }} width={PLOT.width} height={PLOT.height} ariaLabel={`Cumulative cost of building, self-hosting open source and buying ${c.label} by year`}>
          {OPTIONS.map((o) => <Steps key={o.id} data={series(c, o.id, a)} tone={TONE[o.id]} />)}
          {cross !== null && cross <= a.horizon && <VLine at={cross} label="crossover" />}
        </Plot2D>
        <WideRegion minWidth={TABLE_MIN_WIDTH}><table className="data-table bb-table">
          <caption>{c.label[0].toUpperCase() + c.label.slice(1)} over {a.horizon} years, in thousands of an invented currency</caption>
          <thead>
            <tr><th>Option</th><th>Cost</th><th>Benefit counted</th><th>Net cost</th><th>Months to value</th><th>Cost to reverse</th><th>Control points</th></tr>
          </thead>
          <tbody>
            {rs.map((r) => (
              <tr key={r.option}>
                <td>{OPTIONS.find((o) => o.id === r.option)!.label}</td>
                <td>{amount(r.cost)}</td>
                <td>{amount(r.benefit)}</td>
                <td style={best.includes(r.option) ? { color: 'var(--ok)' } : undefined}>{amount(r.net)}{a.includeReversal ? ` (with ${amount(c.reversal[r.option])} to reverse)` : ''}</td>
                <td>{r.months}</td>
                <td>{c.reversal[r.option]}</td>
                <td>{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table></WideRegion>
        <p className="bb-note">{none ? 'No option is best on all four of net cost, months to value, cost to reverse and control points.' : 'One option is best on all four columns here.'} Operations staff time beyond the open source constant is not counted.</p>
        <ul className="bb-breakeven">
          {breakEvenLines(c, a, BENEFIT.max).map((line) => <li key={line}>{line}</li>)}
        </ul>
        {!benefitCounts(stage) && <Hint tone="muted" block>{`This component is placed ${stageLabel(stage)}, so its benefit counts as 0 in the net cost above; the break-evens show where the ranking would flip if you placed it in Genesis or Custom-built.`}</Hint>}
        <ProvenanceRow>
          <Provenance kind="invented">every figure is made up; no real product, price or salary appears</Provenance>
          <Provenance kind="illustrative">a three-year view that includes upkeep, integration and operations</Provenance>
          <ClaimLabel kind="practice">a multi-year total cost of ownership is a common input to a build or buy decision, and self-hosting has costs beyond its licence</ClaimLabel>
          <ClaimLabel kind="view">&quot;build what differentiates you, buy what does not&quot; is one view, and the benefit it needs is yours to set</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
