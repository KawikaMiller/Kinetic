import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import { LAYERS, SCENARIOS, depthOf, detected, stoppedBy, type Cia, type LayerId, type Scenario } from './model';

// Scene geometry (SVG units): concentric rings, network outermost.
const W = 620;
const H = 360;
const INSET_X = 32;
const INSET_Y = 24;
const EDGE = 26;
const TOKEN_R = 9;
const TRAVEL_S = 1.5;
/** Narrowest width where the ring labels stay readable (≥ 8px). */
const RINGS_MIN_WIDTH = 560;
/** The attack travels along this line: through the middle of every ring and the data box. */
const LANE_Y = H / 2 + 14;

const ring = (depth: number) => {
  const x = EDGE + depth * INSET_X;
  const y = EDGE + depth * INSET_Y;
  return { x, y, w: W - 2 * x, h: H - 2 * y };
};
const CORE = ring(LAYERS.length);
/** Where a breaching attack ends: inside the data box, left of its label. */
const BREACH_X = CORE.x + 34;
const CIA: Cia[] = ['confidentiality', 'integrity', 'availability'];

interface Run {
  n: number;
  scenario: Scenario;
  stop: LayerId | null;
  detected: boolean;
}

export function LayersScene({ picker }: { picker: ReactNode }) {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [enabled, setEnabled] = useState<Set<LayerId>>(() => new Set(LAYERS.map((l) => l.id)));
  const [detection, setDetection] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const setCaption = useSetCaption();
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;

  useIntroCaption(
    <>Five layers of defence around the customer data. Pick an attack and press <b>Send the attack</b>, then switch layers off and try again.</>,
  );

  const toggleLayer = (id: LayerId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    forget(<>Layers changed. Press <b>Send the attack</b> to run it again.</>);
  };

  /** Any change invalidates the last run, and its caption with it. */
  const forget = (note: ReactNode) => {
    setRun(null);
    setCaption(note, { quiet: true });
  };

  const attack = () => {
    const stop = stoppedBy(scenario, enabled);
    const seen = detected(scenario, detection);
    setRun((prev) => ({ n: (prev?.n ?? 0) + 1, scenario, stop, detected: seen }));
    const layer = LAYERS.find((l) => l.id === stop);
    setCaption(
      layer ? (
        <>Stopped at <span className="hl ok">{layer.name}</span>: {scenario.stops[layer.id]}</>
      ) : (
        <><span className="hl bad">Breach.</span> {scenario.breach} {seen ? 'Logging raised an alert, so at least someone knows.' : detection ? 'Nothing reaches the logs: it happened offline, so detection can\'t help.' : 'With detection off, nobody notices.'}</>
      ),
      { quiet: true },
    );
  };

  const stopDepth = run?.stop ? depthOf(run.stop) : null;
  const target = run ? (stopDepth === null ? BREACH_X : ring(stopDepth).x - TOKEN_R - 2) : 0;
  const breached = run !== null && run.stop === null;
  // An attack that skips the outer layers (a stolen disk) appears at the first one it really meets.
  const start = run?.scenario.entersAt ? ring(depthOf(run.scenario.entersAt)).x - TOKEN_R : -TOKEN_R;

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Stopped by" value={run ? (run.stop ? LAYERS[depthOf(run.stop)].name : 'nothing') : NA} color={run ? (run.stop ? 'var(--ok)' : 'var(--bad)') : undefined} />
          <Stat label="Layers on" value={`${enabled.size} of ${LAYERS.length}`} color="var(--info)" />
          <Stat label="Detected" value={run ? (run.stop ? 'n/a' : run.detected ? 'yes' : 'no') : NA} sub="logging and alerting" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'attacker', shape: 'dot' },
            { color: 'var(--info)', label: 'layer on' },
            { color: 'var(--ok)', label: 'layer that stopped it' },
            { color: 'var(--dim)', label: 'layer switched off' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="attack" label="Attack">
          {SCENARIOS.map((s) => (
            <ChipButton key={s.id} tone="bad" size="md" on={s.id === scenarioId} onClick={() => { setScenarioId(s.id); forget(<><b>{s.label}</b> picked. Press <b>Send the attack</b>.</>); }}>{s.label}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <ControlGroup label="Layers (click to switch off)">
            {LAYERS.map((l) => (
              <ChipButton key={l.id} tone={enabled.has(l.id) ? 'info' : 'dim'} on={enabled.has(l.id)} onClick={() => toggleLayer(l.id)}>
                {enabled.has(l.id) ? '✓ ' : '✗ '}{l.name}
              </ChipButton>
            ))}
          </ControlGroup>
          <Toggle label="Detection" value={detection} onChange={(v) => { setDetection(v); forget(<>Detection {v ? 'on' : 'off'}. Press <b>Send the attack</b> to run it again.</>); }} off="off" on="logging + alerts" />
          <Button variant="danger" onClick={attack}>Send the attack</Button>
        </>,
      ]}
    >
      <div className="stage-pad sp">
        <p className="sp-setup"><b>{scenario.label}.</b> {scenario.setup}</p>
        <WideRegion minWidth={RINGS_MIN_WIDTH} label="Defence layers diagram: scroll sideways to see all of it">
          <svg viewBox={`0 0 ${W} ${H}`} className="sp-rings" role="img" aria-label="Concentric defensive layers around the customer data">
            <rect x={6} y={6} width={W - 12} height={H - 12} rx={22} className={`sp-detect ${detection ? 'is-on' : ''}`} />
            <text x={W - 14} y={20} textAnchor="end" className="sp-detect-label">detection: logging and alerting {detection ? 'on' : 'off'}</text>
            {LAYERS.map((l, depth) => {
              const r = ring(depth);
              const state = !enabled.has(l.id) ? 'is-off' : run && run.stop === l.id ? 'is-stop' : 'is-on';
              return (
                <g key={l.id} className={`sp-ring ${state}`}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={18} />
                  <text x={r.x + 12} y={r.y + 18}>{l.name} · {l.control}</text>
                </g>
              );
            })}
            <motion.rect
              key={`core-${run?.n ?? 0}`}
              x={CORE.x}
              y={CORE.y}
              width={CORE.w}
              height={CORE.h}
              rx={14}
              className="sp-core"
              initial={{ fillOpacity: 0.06 }}
              animate={{ fillOpacity: breached ? 0.4 : 0.06 }}
              transition={{ delay: breached ? TRAVEL_S : 0, duration: 0.4 }}
            />
            <text x={W / 2} y={CORE.y + 24} textAnchor="middle" className="sp-core-label">customer data</text>
            {run && (
              <motion.circle
                key={`token-${run.n}`}
                cy={LANE_Y}
                r={TOKEN_R}
                className="sp-token"
                initial={{ cx: start }}
                animate={{ cx: target }}
                transition={{ duration: TRAVEL_S, ease: 'easeInOut' }}
              />
            )}
            {run && !breached && (
              <motion.text
                key={`blocked-${run.n}`}
                x={target}
                y={LANE_Y - 18}
                textAnchor="middle"
                className="sp-blocked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: TRAVEL_S }}
              >
                blocked
              </motion.text>
            )}
          </svg>
        </WideRegion>
        <div className="sp-cia" aria-label="CIA properties at risk">
          {CIA.map((p) => {
            const threatened = scenario.threatens.includes(p);
            const tone = !threatened ? 'dim' : !run ? 'hi' : breached ? 'bad' : 'ok';
            const word = !threatened ? 'not the target' : !run ? 'at risk' : breached ? 'violated' : 'protected';
            return (
              <span key={p} className={`chip tone-${tone} ${threatened && run ? 'is-on' : ''}`}>{p}: {word}</span>
            );
          })}
        </div>
        <p className="sp-honest">Scripted scenarios: real attacks and defences are messier, but the layering idea holds.</p>
      </div>
    </StageFrame>
  );
}
