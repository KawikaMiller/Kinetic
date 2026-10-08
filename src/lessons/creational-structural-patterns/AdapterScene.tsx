import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Toggle } from '../../components/ui';
import type { Pt } from '../../core/geometry';
import { usePlayer } from '../../core/usePlayer';
import { NO_ADAPTER_ERROR, adapterFrames, type AdapterHop } from './frames';
import { ADAPTER_CODE, LEGACY_XML } from './model';
import { Recognise } from './Recognise';

const W = 360;
const H = 190;
const APP: Pt = { x: 60, y: 70 };
const ADAPTER: Pt = { x: 180, y: 70 };
const LEGACY: Pt = { x: 300, y: 70 };
const NODE = { w: 104, h: 64 };
const LANE = { in: -14, out: 14 };

const HOPS: Record<AdapterHop, { path: Pt[]; label: string; color: string }> = {
  appToAdapter: { path: [APP, ADAPTER].map((p) => ({ x: p.x, y: p.y + LANE.in })), label: 'current()', color: 'var(--info)' },
  adapterToLegacy: { path: [ADAPTER, LEGACY].map((p) => ({ x: p.x, y: p.y + LANE.in })), label: 'fetchReport()', color: 'var(--info)' },
  legacyToAdapter: { path: [LEGACY, ADAPTER].map((p) => ({ x: p.x, y: p.y + LANE.out })), label: '<report>…', color: 'var(--ok)' },
  adapterToApp: { path: [ADAPTER, APP].map((p) => ({ x: p.x, y: p.y + LANE.out })), label: '{ tempC: 20 }', color: 'var(--violet)' },
  appToLegacy: { path: [APP, { x: LEGACY.x - 70, y: LEGACY.y }], label: 'current()', color: 'var(--bad)' },
};

export function AdapterScene({ picker }: { picker: ReactNode }) {
  const [withAdapter, setWithAdapter] = useState(true);
  const frames = useMemo(() => adapterFrames(withAdapter), [withAdapter]);
  const player = usePlayer(frames, { interval: 1700 });
  const f = player.frame;
  const hop = f.hop ? HOPS[f.hop] : null;

  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the call travelling in' },
            { color: 'var(--ok)', label: 'the response travelling out' },
            { color: 'var(--violet)', label: 'the adapter and its converted shape' },
            { color: 'var(--bad)', label: 'a call that does not fit' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Between them" value={withAdapter} onChange={setWithAdapter} off="nothing (plug in directly)" on="an adapter" />
        </>,
      ]}
    >
      <div className="csp stage-pad">
        <svg viewBox={`0 0 ${W} ${H}`} className="csp-socket" role="img" aria-label={withAdapter ? 'App, adapter and legacy client in a row' : 'App wired straight to the legacy client'}>
          <SceneNode at={APP} {...NODE} title="App" sub="wants current()" tone="info" on={f.hop === 'appToAdapter' || f.hop === 'appToLegacy'} />
          {withAdapter && <SceneNode at={ADAPTER} {...NODE} title="Adapter" sub="converts" tone="violet" on className={f.converted ? 'csp-converting' : ''} />}
          <SceneNode at={LEGACY} {...NODE} title="XmlWeather" sub="has fetchReport()" tone="ok" on={f.hop === 'adapterToLegacy'} variant={f.failed ? 'bad' : 'default'} />
          <text className="csp-shape" x={APP.x} y={APP.y + 54} textAnchor="middle">
            {'{ tempC, sky }'}
          </text>
          <text className="csp-shape" x={LEGACY.x} y={LEGACY.y + 54} textAnchor="middle">
            XML, °F
          </text>
          {withAdapter && (
            <text className={`csp-shape ${f.converted || f.result ? 'is-converted' : ''}`} x={ADAPTER.x} y={ADAPTER.y + 54} textAnchor="middle">
              XML °F → {'{ tempC }'}
            </text>
          )}
          {hop && <Packet key={player.index} path={hop.path} label={hop.label} color={hop.color} arrive="stay" duration={0.9} height={20} charW={6.2} />}
          {f.failed && (
            <text className="csp-mismatch" x={(APP.x + LEGACY.x) / 2} y={H - 18} textAnchor="middle">
              ✕ no current() here: the shapes don&apos;t fit
            </text>
          )}
        </svg>
        <div className="csp-row">
          <div className="csp-col">
            <CodePanel title="the adapter (WeatherSource on top of XmlWeather)" lines={ADAPTER_CODE} active={f.converted ? [3, 4, 5] : null} className="csp-code" />
          </div>
          <div className="csp-col">
            <ConsolePanel
              lines={[...(f.hop === 'legacyToAdapter' || f.converted || f.result ? [{ text: `fetchReport() → ${LEGACY_XML}`, tone: 'muted' as const }] : []), ...(f.result ? [{ text: `current() → ${f.result}`, tone: 'violet' as const }] : [])]}
              error={f.failed ? NO_ADAPTER_ERROR : undefined}
              empty="(not called yet)"
            />
          </div>
        </div>
        <Hint block>
          When not to: if you own both sides, change the interface instead of wrapping it. An adapter earns its keep at a boundary you can&apos;t edit: a vendor SDK, a legacy service, an old
          library.
        </Hint>
        <Recognise current="adapter" />
      </div>
    </StageFrame>
  );
}
