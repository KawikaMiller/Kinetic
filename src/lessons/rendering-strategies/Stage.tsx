import { useMemo, useState } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Segmented, Slider } from '../../components/ui';
import { ms } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, type TapMode } from './frames';
import {
  DEFAULT_PRESET, PRESETS, RANGES, STRATEGY_IDS, STRATEGY_SHORT, best, tableRows, timeline, type Inputs, type PresetId, type StrategyId,
} from './model';
import { StrategyPanel } from './StrategyPanel';
import './styles.css';

const STEP_MS = 900;
const AXIS_STEP = 500;
const AXIS_PAD = 100;
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const TAP_OPTIONS: { value: TapMode; label: string }[] = [
  { value: 'ignored', label: 'is ignored' },
  { value: 'replayed', label: 'is replayed later' },
];

/** The shared time axis: far enough for the slowest lane, whichever are shown. */
function axisEnd(inputs: Inputs): number {
  const last = Math.max(...STRATEGY_IDS.map((id) => timeline(id, inputs).interactiveAt));
  return Math.ceil((last + AXIS_PAD) / AXIS_STEP) * AXIS_STEP;
}

export function Stage() {
  const [inputs, setInputs] = useState<Inputs>(PRESETS[DEFAULT_PRESET].inputs);
  const [shown, setShown] = useState<StrategyId[]>([...STRATEGY_IDS]);
  const [tap, setTap] = useState<TapMode>('ignored');
  const frames = useMemo(() => buildFrames(inputs, shown, tap), [inputs, shown, tap]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const now = player.frame.now;
  const end = axisEnd(inputs);
  const rows = useMemo(() => tableRows(inputs), [inputs]);
  const bestContent = best(rows, 'contentMs');
  const bestLive = best(rows, 'interactiveMs');

  const toggle = (id: StrategyId) => {
    const next = shown.includes(id) ? shown.filter((s) => s !== id) : STRATEGY_IDS.filter((s) => s === id || shown.includes(s));
    if (next.length) setShown(next);
  };
  const set = (patch: Partial<Inputs>) => setInputs({ ...inputs, ...patch });

  return (
    <StageFrame
      player={player}
      height={560}
      controls={[
        <ControlGroup key="presets" label="Presets" inline>
          {PRESET_IDS.map((id) => (
            <ChipButton key={id} tone="info" size="md" on={JSON.stringify(inputs) === JSON.stringify(PRESETS[id].inputs)} onClick={() => setInputs(PRESETS[id].inputs)}>
              {PRESETS[id].label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Slider label="Data fetch" value={inputs.dataMs} {...RANGES.dataMs} onChange={(dataMs) => set({ dataMs })} format={ms} />
          <Slider label="JS bundle" value={inputs.bundleKb} {...RANGES.bundleKb} onChange={(bundleKb) => set({ bundleKb })} format={(v) => `${v} KB`} />
          <Slider label="Device" value={inputs.cpu} {...RANGES.cpu} onChange={(cpu) => set({ cpu })} format={(v) => (v === 1 ? 'reference' : `${v}× slower`)} />
        </>,
        <>
          <ControlGroup label="Show" inline>
            {STRATEGY_IDS.map((id) => (
              <ChipButton key={id} tone="info" size="md" on={shown.includes(id)} onClick={() => toggle(id)}>
                {STRATEGY_SHORT[id]}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="A tap before it is interactive" value={tap} onChange={setTap} options={TAP_OPTIONS} />
        </>,
      ]}
    >
      <div className="stage-pad rs">
        <div className="rs-panels">
          {STRATEGY_IDS.filter((id) => shown.includes(id)).map((id) => (
            <StrategyPanel key={id} id={id} inputs={inputs} end={end} now={now} />
          ))}
        </div>
        <SectionTitle weight="regular" hint="every cell comes from the model above; the fastest content on screen and the fastest interactive are marked (ties all marked)">Trade-offs</SectionTitle>
        <div className="rs-table-wrap">
          <table className="data-table rs-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>SEO: the first HTML has</th>
                <th>First paint (streaming: the shell)</th>
                <th>Content on screen</th>
                <th>Interactive</th>
                <th>Server work per request</th>
                <th>Data is from</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{STRATEGY_SHORT[r.id]}</td>
                  <td>{r.seo}</td>
                  <td>{ms(r.firstPaintMs)}</td>
                  <td className={bestContent.includes(r.id) ? 'is-best' : ''}>{ms(r.contentMs)}</td>
                  <td className={bestLive.includes(r.id) ? 'is-best' : ''}>{ms(r.interactiveMs)}</td>
                  <td>{r.serverCost}</td>
                  <td>{r.freshness}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Hint block>
          Illustrative timings on a modelled network and device (a fixed round trip, 4 Mbit/s, JavaScript that costs time per KB); real frameworks add their own steps. The static page is built
          once, earlier, so it has no server work on this clock. Streaming is simplified: it hydrates once its HTML is complete, where real frameworks can hydrate parts earlier. Its first paint
          is the shell, not the content. Every download gets the full bandwidth and the data takes the same time to fetch whether the server or the browser asks for it; a server usually reaches its data faster than a phone does, which would make the server-rendered lanes look better still. On-demand revalidation can refresh a static page without a full rebuild.
        </Hint>
      </div>
    </StageFrame>
  );
}
