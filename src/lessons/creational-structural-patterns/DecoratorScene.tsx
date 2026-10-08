import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { Packet } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import type { Pt } from '../../core/geometry';
import { usePlayer } from '../../core/usePlayer';
import { stackFrames } from './frames';
import { DECORATOR_PRESETS, TIME, runStack, type LayerId } from './model';
import { Recognise } from './Recognise';

const W = 460;
const H = 236;
const INSET_X = 40;
const INSET_Y = 24;

interface Slot {
  id: LayerId;
  on: boolean;
}

const rectAt = (d: number) => ({ x: d * INSET_X + 2, y: d * INSET_Y + 2, w: W - 2 * d * INSET_X - 4, h: H - 2 * d * INSET_Y - 4 });

export function DecoratorScene({ picker }: { picker: ReactNode }) {
  const [slots, setSlots] = useState<Slot[]>(DECORATOR_PRESETS[0].order.map((id) => ({ id, on: true })));
  const key = slots.filter((s) => s.on).map((s) => s.id).join(',');
  const order = useMemo(() => (key ? (key.split(',') as LayerId[]) : []), [key]);
  const frames = useMemo(() => stackFrames(order), [order]);
  const run = useMemo(() => runStack(order), [order]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;
  const prev = player.index > 0 ? frames[player.index - 1] : null;

  const depthOf = (l: LayerId | 'core' | null) => (l === null ? -1 : l === 'core' ? order.length : order.indexOf(l));
  const pos = (d: number): Pt => (d >= order.length ? { x: W / 2, y: H / 2 + 4 } : { x: rectAt(d).x + 20, y: H / 2 + 4 });
  const d = depthOf(f.active);
  const from = prev && prev.active ? depthOf(prev.active) : -1;
  const packetPath = d < 0 ? null : from < 0 || from === d ? [pos(Math.max(0, d - 1)), pos(d)] : [pos(from), pos(d)];
  const packetColor = f.direction === 'in' ? 'var(--info)' : f.ok ? 'var(--ok)' : 'var(--bad)';

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[i], next[j]] = [next[j], next[i]];
    setSlots(next);
  };
  const toggle = (id: LayerId) => setSlots(slots.map((s) => (s.id === id ? { ...s, on: !s.on } : s)));
  const tone = (l: LayerId | 'core') => (f.hit && l === 'caching' ? 'ok' : l === f.active ? 'hi' : f.reached.includes(l) ? 'info' : 'dim');
  // Layer reports in plain sky; the core's own lines muted.
  const lines: ConsoleLine[] = f.printed.map((text) => ({ text, tone: text.startsWith('core:') ? 'muted' : 'sky' }));

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Real fetchUser calls" value={run.coreCalls} color="var(--muted)" />
          <Stat label="Results" value={run.results.join(', ')} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'call travelling in; layers it has reached' },
            { color: 'var(--ok)', label: 'response travelling out; cache hit' },
            { color: 'var(--bad)', label: 'error travelling out' },
            { color: 'var(--hi)', label: 'the layer handling it now' },
            { color: 'var(--dim)', label: 'not reached' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            {DECORATOR_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={slots.every((s) => s.on) && order.join() === p.order.join()} onClick={() => setSlots(p.order.map((id) => ({ id, on: true })))}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <ol className="csp-layers" aria-label="Layers, outermost first">
            {slots.map((s, i) => (
              <li key={s.id}>
                <ChipButton tone="info" on={s.on} onClick={() => toggle(s.id)}>
                  {s.id}
                </ChipButton>
                <Button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${s.id} outward`}>
                  ↑
                </Button>
                <Button onClick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label={`Move ${s.id} inward`}>
                  ↓
                </Button>
              </li>
            ))}
          </ol>
        </>,
      ]}
    >
      <div className="csp stage-pad">
        <WideRegion minWidth={460} label="The layers around fetchUser: scroll sideways to see all of them">
          <svg viewBox={`0 0 ${W} ${H}`} className="csp-onion" role="img" aria-label={`fetchUser wrapped in ${order.join(', ') || 'nothing'}, outermost first`}>
            {order.map((l, i) => {
              const r = rectAt(i);
              return (
                <g key={l} className={`csp-layer tone-${tone(l)}`}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={14} />
                  <text x={r.x + 10} y={r.y + 16}>
                    {l}
                  </text>
                </g>
              );
            })}
            <g className={`csp-layer is-core tone-${tone('core')}`}>
              <rect x={W / 2 - 70} y={H / 2 - 22} width={140} height={52} rx={12} />
              <text x={W / 2} y={H / 2 - 4} textAnchor="middle">
                fetchUser(42)
              </text>
            </g>
            {packetPath && f.active !== null && !f.hit && (
              <Packet key={player.index} path={packetPath} label={f.direction === 'in' ? `call ${f.call}` : f.ok ? 'Ada' : 'timeout'} color={packetColor} arrive="stay" duration={0.5} height={18} charW={6} pad={14} />
            )}
          </svg>
        </WideRegion>
        <ConsolePanel title="each layer reports" lines={lines} empty="(nothing yet)" />
        <Hint block>
          Scripted: the core&apos;s first call times out, every later one answers in {TIME.coreOk} ms (a timeout costs {TIME.coreFail} ms, a retry waits {TIME.backoff} ms; illustrative
          times). The layers are real JavaScript wrappers, replayed step by step. When not to: every layer is one more frame in a stack trace, and the order is easy to get wrong.
        </Hint>
        <Recognise current="decorator" />
      </div>
    </StageFrame>
  );
}
