import { ChipButton, ControlGroup, Hint, Segmented, Slider, Toggle } from '../../components/ui';
import { REPLICAS, STRATEGIES, resolveFenceposts, type Config, type Strategy } from './model';
import { PRESETS } from './presets';
import { STRATEGY_LABEL } from './view';


const sameConfig = (a: Config, b: Config) => (Object.keys(a) as (keyof Config)[]).every((k) => a[k] === b[k]);

const PCT = (v: number) => `${v}%`;
const MIN = (v: number) => `${v} min`;
const BUG_MIN = 1;
const BUG_MAX = 20;

export function Presets({ cfg, onPick }: { cfg: Config; onPick: (c: Config) => void }) {
  return (
    <ControlGroup label="Presets" inline>
      {PRESETS.map((p) => (
        <ChipButton key={p.id} tone="info" size="md" on={sameConfig(cfg, p.cfg)} onClick={() => onPick(p.cfg)}>
          {p.label}
        </ChipButton>
      ))}
    </ControlGroup>
  );
}

export function StrategyPicker({ value, onChange }: { value: Strategy; onChange: (s: Strategy) => void }) {
  return <Segmented label="Strategy" value={value} onChange={onChange} options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_LABEL[s] }))} />;
}

/** The knobs of one strategy; `only` shows just that strategy's, null shows all (the comparison runs all four). */
export function StrategyKnobs({ cfg, only, update }: { cfg: Config; only: Strategy | null; update: (patch: Partial<Config>) => void }) {
  const f = resolveFenceposts(REPLICAS, cfg.surgePct, cfg.unavailablePct);
  return (
    <>
      {(only === null || only === 'rolling') && (
        <>
          <Slider label="maxSurge" value={cfg.surgePct} min={0} max={100} step={5} onChange={(v) => update({ surgePct: v })} format={PCT} />
          <Slider label="maxUnavailable" value={cfg.unavailablePct} min={0} max={100} step={5} onChange={(v) => update({ unavailablePct: v })} format={PCT} />
          <Hint block>
            {cfg.surgePct}% of {REPLICAS} servers, rounded up, is {f.surge}; {cfg.unavailablePct}% rounded down is {f.unavailable}. At most {REPLICAS + f.surge} servers run and at least {REPLICAS - f.unavailable} serve.
            {f.apiRejects && ' Kubernetes rejects 0% and 0%, so this run uses maxUnavailable 1.'}
          </Hint>
        </>
      )}
      {(only === null || only === 'canary') && (
        <>
          <Slider label="Bake time" value={cfg.bakeTicks} min={1} max={12} onChange={(v) => update({ bakeTicks: v })} format={MIN} />
          <Toggle label="Automated analysis" value={cfg.analysis} onChange={(v) => update({ analysis: v })} off="Off" on="On" />
        </>
      )}
    </>
  );
}

/** The bug, the migration, draining and the traffic sample: what every strategy is run against. */
export function WorldKnobs({
  cfg, bugMemory, update,
}: {
  cfg: Config;
  /** The rate the slider comes back to when the bug is switched on again. */
  bugMemory: number;
  update: (patch: Partial<Config>, bugMemory?: number) => void;
}) {
  const bugOn = cfg.bugRate > 0;
  return (
    <>
      <Toggle label="Plant a bug in v2" value={bugOn} onChange={(on) => update({ bugRate: on ? bugMemory : 0 })} off="No bug" on="Bug" />
      {bugOn && (
        <Slider
          label="v2 extra error rate"
          value={Math.round(cfg.bugRate * 100)}
          min={BUG_MIN}
          max={BUG_MAX}
          onChange={(v) => update({ bugRate: v / 100 }, v / 100)}
          format={PCT}
        />
      )}
      <Toggle label="Database migration" value={cfg.schema === 'breaking'} onChange={(b) => update({ schema: b ? 'breaking' : 'compatible' })} off="Compatible" on="Breaking" />
      <Toggle label="Drain old servers" value={cfg.drain} onChange={(d) => update({ drain: d })} off="Kill at once" on="Drain" />
      {cfg.schema === 'breaking' && (
        <Hint block>
          The migration runs first, so v1 keeps running against a schema it cannot read. Splitting such a change into expand, deploy and contract steps is the fix; a lesson on zero-downtime migrations is coming later.
        </Hint>
      )}
    </>
  );
}
