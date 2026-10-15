import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { HLine, Plot2D, Steps, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { ecdf } from '../../core/stats';
import { pLabel, ruleCaption } from './frames';
import {
  P_RANGE, RULES, RULE_DEFAULT, RULE_NAME, STREAM_SIZES, clampPct, countAbove, ecdfAt, ruleDetail, ruleValue, scene1Data, type DataSource, type Rule,
} from './model';
import { pctText, sig } from '../../core/format';
import { SeedField } from '../../components/SeedField';

const SOURCE_OPTIONS: Option<DataSource>[] = [
  { value: 'stream', label: 'Latency stream' },
  { value: 'hundred', label: 'The values 1…100' },
  { value: 'twenty', label: 'The values 1…20' },
];
const RULE_OPTIONS: Option<Rule>[] = RULES.map((r) => ({ value: r, label: RULE_NAME[r] }));
const QUICK_P = [50, 90, 99, 99.9, 99.99] as const;
const COARSE_STEP = 1;
const FINE_STEP = 0.1;
const FINE_FROM = 99;
const X_ROOM = 1.04;

export function RuleScene({ picker }: { picker: ReactNode }) {
  const [source, setSource] = useState<DataSource>(RULE_DEFAULT.source);
  const [rule, setRule] = useState<Rule>(RULE_DEFAULT.rule);
  const [pct, setPct] = useState(RULE_DEFAULT.pct);
  const [n, setN] = useState<number>(RULE_DEFAULT.n);
  const [seed, setSeed] = useState(RULE_DEFAULT.seed);

  const sorted = useMemo(() => scene1Data(source, seed, n), [source, seed, n]);
  const steps = useMemo(() => ecdf(sorted), [sorted]);
  const value = ruleValue(rule, sorted, pct);
  const view = { sorted, pct, rule };
  const above = value === null ? 0 : countAbove(sorted, value);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const domain: [number, number] = [Math.min(0, lo), hi * X_ROOM];

  useIntroCaption(ruleCaption(view), [sorted, pct, rule]);

  const dragTo = (x: number) => setPct(clampPct(Number((ecdfAt(sorted, x) * 100).toFixed(2))));
  const step = (dir: 1 | -1) => setPct((p) => clampPct(Number((p + dir * (p >= FINE_FROM ? FINE_STEP : COARSE_STEP)).toFixed(2))));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Percentile" value={pLabel(pct)} sub={[`by ${RULE_NAME[rule]}`]} />
          <Stat
            label="Value"
            value={value === null ? '–' : sig(value, 5)}
            sub={value === null ? ['no samples yet'] : [`F(x) = ${pctText(ecdfAt(sorted, value), 2)} of samples at or below`, `${above} of ${sorted.length.toLocaleString('en-US')} above`]}
          />
          <Stat label="Samples" value={sorted.length.toLocaleString('en-US')} sub={[source === 'stream' ? `seed ${seed}` : 'hand-made values']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'share of samples at or below x', shape: 'line' },
            { color: 'var(--hi)', label: 'chosen percentile and its value', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Data" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
          <Segmented label="Percentile rule" value={rule} onChange={setRule} options={RULE_OPTIONS} />
        </>,
        <>
          <Slider label="Percentile p" value={pct} min={P_RANGE.min} max={P_RANGE.max} step={P_RANGE.step} format={(v) => `${Number(v.toFixed(2))}%`} onChange={setPct} />
          <ControlGroup label="Jump to" inline>
            {QUICK_P.map((p) => (
              <ChipButton key={p} tone="info" on={pct === p} onClick={() => setPct(p)}>{pLabel(p)}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          {source === 'stream' ? (
            <>
              <Segmented label="Samples n" value={n} onChange={setN} options={STREAM_SIZES.map((v) => ({ value: v as number, label: v.toLocaleString('en-US') }))} />
              <SeedField seed={seed} onSeed={setSeed} />
            </>
          ) : (
            <Hint>The 1…{sorted.length} presets are hand-made, so there is no seed and no sample size to set.</Hint>
          )}
        </>,
      ]}
    >
      <div className="ps-stage stage-pad">
        <Plot2D
          x={{ domain, label: 'value', ticks: 5 }}
          y={{ domain: [0, 1], label: 'share at or below x', format: (v) => `${Math.round(v * 100)}%`, ticks: 4 }}
          ariaLabel={`Empirical cumulative distribution of ${sorted.length} samples; ${pLabel(pct)} reads ${value === null ? 'nothing' : sig(value, 5)}`}
        >
          <Steps data={steps} startY={0} tone="info" />
          <HLine at={pct / 100} tone="hi" dashed={false} label={pLabel(pct)} />
          {value !== null && (
            <VLine
              at={value}
              tone="hi"
              onDrag={dragTo}
              onStep={step}
              ariaLabel="Read the percentile back from a value"
              valueText={`${sig(value, 5)} is at ${pLabel(pct)}; arrow keys move the percentile`}
              label={sig(value, 4)}
            />
          )}
        </Plot2D>
        <Box className="ps-table">
          <SectionTitle hint="the same data and p, three definitions">Three rules, three answers</SectionTitle>
          <table className="data-table">
            <thead>
              <tr><th>rule</th><th>value</th><th>how it picked</th></tr>
            </thead>
            <tbody>
              {RULES.map((r) => {
                const v = ruleValue(r, sorted, pct);
                return (
                  <tr key={r} className={r === rule ? 'ps-chosen' : ''}>
                    <td>{RULE_NAME[r]}</td>
                    <td>{v === null ? '–' : sig(v, 5)}</td>
                    <td>{ruleDetail(r, sorted.length, pct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Hint tone="muted" block>
            Tools disagree on small samples. Floor(n·p) is the rule this app&apos;s own percentile helper uses. Linear interpolation is the common
            library default (Hyndman and Fan&apos;s &quot;type 7&quot;).
          </Hint>
        </Box>
        <div className="ps-chips">
          <Provenance kind="simulated" seed={source === 'stream' ? seed : undefined}>{source === 'stream' ? 'a seeded log-normal latency stream (illustrative)' : 'hand-made values, no randomness'}</Provenance>
          <Provenance kind="from-memory">&quot;type 7&quot; as the common default: verify against Hyndman and Fan, 1996</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
