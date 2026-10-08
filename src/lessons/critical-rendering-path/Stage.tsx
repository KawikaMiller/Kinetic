import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { ms } from '../../core/format';
import { barLabelPx } from '../../core/gantt';
import { usePlayer } from '../../core/usePlayer';
import { Filmstrip } from './Filmstrip';
import { buildFrames, gateText } from './frames';
import { HeadEditor } from './HeadEditor';
import { DEFAULT_PRESET, PRESETS, RESOURCES, RTTS, cssExcerpt, headLines, sameConfig, solve, type Config, type PresetId } from './model';
import { LONGEST_LABEL, barsAt, domainEnd, lanesFor, markersOf } from './waterfall';
import './styles.css';

const STEP_MS = 750;
/** Narrowest width where the ten lanes and their labels stay readable. */
const WATERFALL_MIN_W = 560;
const LABEL_W = 128;
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function Stage() {
  const [config, setConfig] = useState<Config>(PRESETS[DEFAULT_PRESET].config);
  const tl = useMemo(() => solve(config), [config]);
  const frames = useMemo(() => buildFrames(tl), [tl]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const now = player.frame.now;
  const lines = useMemo(() => headLines(config), [config]);
  const end = domainEnd(tl);
  const at = (t: number) => (now >= t ? ms(t) : '…');

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="First paint" value={at(tl.firstPaintAt)} color={now >= tl.firstPaintAt ? 'var(--ok)' : undefined} />
          <Stat label="DOMContentLoaded" value={at(tl.dclAt)} color={now >= tl.dclAt ? 'var(--violet)' : undefined} />
          <Stat label="load" value={at(tl.loadAt)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'download' },
            { color: 'var(--hi)', label: 'script runs' },
            { color: 'var(--bad)', label: 'parser blocked (hatched), render-blocking CSS (outline)' },
            { color: 'var(--dim)', label: 'non-blocking: dim outline' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="presets" label="Presets" inline>
          {PRESET_IDS.map((id) => (
            <ChipButton key={id} tone="info" size="md" on={sameConfig(config, PRESETS[id].config)} onClick={() => setConfig(PRESETS[id].config)}>
              {PRESETS[id].label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          <Segmented label="Round trip" value={config.rtt} onChange={(rtt) => setConfig({ ...config, rtt })} options={RTTS.map((r) => ({ value: r as number, label: ms(r) }))} />
          <Toggle label="Preload scanner" value={config.scanner} onChange={(scanner) => setConfig({ ...config, scanner })} off="Off (what-if)" on="On (real browsers)" />
        </>,
      ]}
    >
      <div className="stage-pad crp">
        <div className="crp-top">
          <HeadEditor config={config} onChange={setConfig} />
          <div className="crp-code">
            <CodePanel
              title="Generated <head>"
              lines={lines.map((l) => l.text)}
              gutter="none"
              stateOf={(i) => (lines[i].blocks ? 'bad' : 'idle')}
              trailing={(i) => (lines[i].blocks === 'parser' ? 'blocks the parser' : lines[i].blocks === 'render' ? 'blocks rendering' : null)}
            />
            <CodePanel title={RESOURCES.main.file} lines={cssExcerpt(config)} gutter="none" />
          </div>
        </div>
        <div className="crp-gate">
          <b>First paint at {ms(tl.firstPaintAt)}</b> waited for {gateText(tl)}.
        </div>
        {tl.broken.length > 0 && (
          <div className="log-row tone-bad crp-broken" role="status">
            ✕ {tl.broken.map((b) => `${RESOURCES[b.script].file} ran before ${RESOURCES[b.needs].file}`).join('; ')}: it needs that script&apos;s code first, and async gives no
            order.
          </div>
        )}
        <SectionTitle weight="regular" hint="a scripted page load: fixed sizes, fixed round trip">Waterfall</SectionTitle>
        <WideRegion minWidth={WATERFALL_MIN_W} label="Waterfall: scroll sideways to see all of it">
          <GanttLanes
            lanes={lanesFor(config)}
            bars={barsAt(tl, now)}
            domain={[0, end]}
            now={now}
            markers={markersOf(tl)}
            unit=" ms"
            axis
            size="md"
            labelWidth={LABEL_W}
            labelMinPx={barLabelPx(LONGEST_LABEL)}
            ariaLabel={`Page load waterfall: first paint at ${ms(tl.firstPaintAt)}`}
          />
        </WideRegion>
        <SectionTitle weight="regular" hint="the page at each moment (a mock, drawn from the model)">Filmstrip</SectionTitle>
        <Filmstrip tl={tl} now={now} />
        <Hint block>
          Scripted page load on an illustrative network: every download takes one round trip plus 1 ms per KB, on its own bandwidth; the HTML is parsed once it has fully
          arrived. The ordering rules are the real ones. Priorities, connection limits and real parse costs are left out. Inlining a stylesheet here adds its whole size to the HTML
          (real critical CSS is a small subset), and <code>media=&quot;print&quot;</code> shows the swap-on-load pattern.
        </Hint>
      </div>
    </StageFrame>
  );
}
