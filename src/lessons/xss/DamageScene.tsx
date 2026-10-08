import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SceneNode, TravelDot } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Pt } from '../../core/geometry';
import { minWidthForText } from '../../core/scale';
import { damageCaption } from './captions';
import {
  ALL_OFF, LAYER_IDS, LAYER_LABELS, OUTCOME_LABELS, SHORT_SESSION_MIN, LONG_SESSION_MIN, activeStoppers, reach, reachedCount, windowText,
  type LayerId, type Layers, type OutcomeId,
} from './defence';

const W = 560;
const H = 300;
const SMALLEST_TEXT_PX = 11;
const TOKEN: Pt = { x: 62, y: 150 };
const CSP_X = 150;
const FORK_X = 215;
const GATE_X = 300;
const TARGET_X = 470;
const LANE_Y: Record<'page' | 'cookie' | 'act', number> = { page: 60, cookie: 150, act: 240 };
const TARGET_W = 150;
const DOT_SECONDS = 2.6;

type Lane = keyof typeof LANE_Y;
const LANE_OUTCOME: Record<Lane, OutcomeId> = { page: 'readsPage', cookie: 'readsCookie', act: 'actsAsUser' };
const LANE_GATE: Partial<Record<Lane, LayerId>> = { cookie: 'httpOnly', act: 'sameSite' };

export function DamageScene({ picker }: { picker: ReactNode }) {
  const [layers, setLayers] = useState<Layers>(ALL_OFF);
  const setCaption = useSetCaption();
  const outcomes = reach(layers);
  const reached = reachedCount(layers);
  const stoppers = activeStoppers(layers);

  useIntroCaption(<>Suppose an unwanted script got into the page anyway. With every layer off, the placeholder reaches everything. Switch layers on and watch which lanes close.</>);

  const set = (id: LayerId, on: boolean) => {
    const next = { ...layers, [id]: on };
    setLayers(next);
    setCaption(damageCaption(next), { quiet: true });
  };

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Reached" value={`${reached} of ${outcomes.length}`} color={reached === 0 ? 'var(--ok)' : 'var(--bad)'} sub="things the placeholder gets to" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'untrusted script (placeholder)' },
            { color: 'var(--violet)', label: 'layer on' },
            { color: 'var(--ok)', label: 'layer that stopped something' },
            { color: 'var(--bad)', label: 'reached' },
            { color: 'var(--dim)', label: 'not reached, layer off' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {LAYER_IDS.map((id) => (
            <Toggle key={id} label={LAYER_LABELS[id]} value={layers[id]} onChange={(v) => set(id, v)} />
          ))}
        </>,
      ]}
    >
      <div className="stage-pad xss">
        <WideRegion minWidth={minWidthForText(W, SMALLEST_TEXT_PX)} label="Defence layers diagram: scroll sideways to see all of it">
        <svg viewBox={`0 0 ${W} ${H}`} className="xss-svg" role="img" aria-label={`Placeholder script against ${stoppers.length} active layers: ${reached} of ${outcomes.length} things reached`}>
          <Scene layers={layers} stoppers={stoppers} />
        </svg>
        </WideRegion>
        <Box className="xss-reach">
          <SectionTitle hint="from the toggles above">What the placeholder can reach</SectionTitle>
          <table className="data-table">
            <thead>
              <tr><th scope="col">Outcome</th><th scope="col">Result</th><th scope="col">Stopped by</th></tr>
            </thead>
            <tbody>
              {outcomes.map((o) => (
                <tr key={o.id}>
                  <th scope="row">{OUTCOME_LABELS[o.id]}</th>
                  <td className={o.reached ? 'xss-reached' : 'xss-blocked'}>
                    {o.reached ? 'reached' : 'out of reach'}
                    {o.windowMin ? ` · works for ${windowText(o.windowMin)}` : ''}
                  </td>
                  <td>{o.stoppedBy ? LAYER_LABELS[o.stoppedBy] : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Hint block>
          Simulated browser: the unwanted script is a labelled placeholder and nothing runs. Real policies have many more directives, and a CSP with &apos;unsafe-inline&apos; would not stop it.
        </Hint>
      </div>
    </StageFrame>
  );
}

function Scene({ layers, stoppers }: { layers: Layers; stoppers: LayerId[] }) {
  const outcomes = reach(layers);
  const by = (id: OutcomeId) => outcomes.find((o) => o.id === id)!;
  const runs = by('runs').reached;
  const gateTone = (id: LayerId) => (stoppers.includes(id) ? 'ok' : layers[id] ? 'violet' : 'off');
  const key = LAYER_IDS.map((id) => (layers[id] ? 1 : 0)).join('');
  const cookie = by('reuse');

  return (
    <>
      <SceneNode at={TOKEN} w={116} h={50} title="untrusted script" sub="placeholder" tone="orange" on />
      <Gate x={CSP_X} y={150} h={190} label="CSP" tone={gateTone('csp')} />
      {runs ? <line className="scene-edge xss-lane" x1={TOKEN.x + 58} y1={TOKEN.y} x2={FORK_X} y2={TOKEN.y} /> : <line className="scene-edge xss-lane is-cut" x1={TOKEN.x + 58} y1={TOKEN.y} x2={CSP_X - 8} y2={TOKEN.y} />}
      {!runs && <text className="xss-stop" x={CSP_X - 16} y={TOKEN.y - 10} textAnchor="end">✕</text>}
      {!runs && <TravelDot key={`t${key}`} path={[{ x: TOKEN.x + 58, y: TOKEN.y }, { x: CSP_X - 10, y: TOKEN.y }]} color="var(--orange)" r={5} duration={1.2} />}
      {(Object.keys(LANE_Y) as Lane[]).map((lane) => {
        const o = by(LANE_OUTCOME[lane]);
        const y = LANE_Y[lane];
        const gate = LANE_GATE[lane];
        const dead = !runs;
        const path: Pt[] = [{ x: TOKEN.x + 58, y: TOKEN.y }, { x: FORK_X, y: TOKEN.y }, { x: FORK_X + 40, y }, { x: TARGET_X - TARGET_W / 2, y }];
        const blockedAtGate = !o.reached && !dead && gate && layers[gate];
        const stopAt: Pt[] = [...path.slice(0, 3), { x: GATE_X - 12, y }];
        return (
          <g key={lane}>
            {!dead && <polyline className={`scene-edge xss-lane ${o.reached ? 'is-open' : 'is-cut'}`} points={path.map((p) => `${p.x},${p.y}`).join(' ')} />}
            {gate && <Gate x={GATE_X} y={y} h={46} label={gate === 'httpOnly' ? 'HttpOnly' : 'SameSite'} tone={gateTone(gate)} />}
            {!dead && o.reached && <TravelDot key={`${lane}${key}`} path={path} color="var(--orange)" r={5} duration={DOT_SECONDS} repeat />}
            {blockedAtGate && <TravelDot key={`${lane}${key}b`} path={stopAt} color="var(--orange)" r={5} duration={1.6} />}
            {blockedAtGate && <text className="xss-stop" x={GATE_X - 22} y={y - 10} textAnchor="end">✕</text>}
            <SceneNode
              at={{ x: TARGET_X, y }}
              w={TARGET_W}
              h={50}
              title={lane === 'page' ? 'page content' : lane === 'cookie' ? 'session cookie' : 'act as the user'}
              sub={lane === 'page' ? 'what the page shows' : lane === 'cookie' ? (cookie.reached ? `a copy works ${windowText(cookie.windowMin ?? 0)}` : 'out of reach') : 'same-site requests'}
              color={o.reached ? 'var(--bad)' : 'var(--dim)'}
              variant={o.reached ? 'bad' : 'dim'}
              on={o.reached}
            />
          </g>
        );
      })}
      <ShortSession on={layers.shortSession} />
    </>
  );
}

function Gate({ x, y, h, label, tone }: { x: number; y: number; h: number; label: string; tone: 'ok' | 'violet' | 'off' }) {
  return (
    <g className={`xss-gate is-${tone}`}>
      <rect x={x - 7} y={y - h / 2} width={14} height={h} rx={4} />
      <text x={x} y={y - h / 2 - 7} textAnchor="middle">{label}</text>
    </g>
  );
}

/** The session-lifetime layer is a clock beside the cookie, since it changes how long a copy works. */
function ShortSession({ on }: { on: boolean }) {
  return (
    <g className={`xss-gate is-${on ? 'violet' : 'off'}`}>
      <rect x={TARGET_X - TARGET_W / 2} y={LANE_Y.cookie + 34} width={TARGET_W} height={22} rx={6} />
      <text x={TARGET_X} y={LANE_Y.cookie + 49} textAnchor="middle" className="xss-clock">
        {on ? `short sessions: ${SHORT_SESSION_MIN} min` : `sessions last ${windowText(LONG_SESSION_MIN)}`}
      </text>
    </g>
  );
}
