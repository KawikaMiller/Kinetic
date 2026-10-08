import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { Pt } from '../../core/geometry';
import { toneVar } from '../../core/tone';
import { observerCaption } from './frames';
import { OBSERVER_CODE, SUBS, canAct, initialObserver, isDead, observerStep, retainedObjects, type ObserverAction, type SubId } from './model';

const W = 380;
const H = 250;
const FEED: Pt = { x: 70, y: H / 2 };
const AT: Record<SubId, Pt> = { chart: { x: 290, y: 46 }, alert: { x: 290, y: 125 }, log: { x: 290, y: 204 } };
const NODE = { w: 112, h: 56 };
/** Packets stop this fraction of the way, so the pill never covers the subscriber's own text. */
const PACKET_STOP = 0.72;

export function ObserverScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialObserver);
  const [last, setLast] = useState<ObserverAction | null>(null);
  const act = (a: ObserverAction) => {
    setSt((s) => observerStep(s, a));
    setLast(a);
  };
  const forgotten = () => {
    setSt(observerStep(initialObserver(), { type: 'unmount', id: 'chart' }));
    setLast({ type: 'unmount', id: 'chart' });
  };
  useIntroCaption(observerCaption(st, last), [st, last]);
  const leak = retainedObjects(st);
  const showDeliveries = last?.type === 'publish' && st.last;

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Notified last publish" value={st.last ? st.last.to.length : '–'} color="var(--info)" />
          <Stat label="Retained dead objects" value={leak} color={leak ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'notification travelling' },
            { color: 'var(--ok)', label: 'live subscriber' },
            { color: 'var(--bad)', label: 'unmounted but still subscribed' },
            { color: 'var(--dim)', label: 'detached' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => act({ type: 'publish' })}>
            Publish a price
          </Button>
          <ChipButton tone="bad" onClick={forgotten}>
            preset: forgotten unsubscribe
          </ChipButton>
          <ChipButton tone="muted" onClick={() => act({ type: 'reset' })}>
            reset
          </ChipButton>
        </>,
        <>
          <ControlGroup label="Subscribed">
            {SUBS.map((x) => (
              <ChipButton
                key={x.id}
                tone="ok"
                on={st.subs[x.id].attached}
                disabled={!st.subs[x.id].attached && !canAct(st, { type: 'attach', id: x.id })}
                onClick={() => act({ type: st.subs[x.id].attached ? 'detach' : 'attach', id: x.id })}
              >
                {x.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Unmount the component">
            {SUBS.map((x) => (
              <ChipButton key={x.id} tone="muted" disabled={!st.subs[x.id].mounted} onClick={() => act({ type: 'unmount', id: x.id })}>
                {x.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="bp stage-pad">
        <div className="bp-row">
          <svg viewBox={`0 0 ${W} ${H}`} className="bp-observer" role="img" aria-label={`Price feed notifying ${st.last ? st.last.to.join(', ') || 'nobody' : 'subscribers'}`}>
            {SUBS.map((x) => (st.subs[x.id].attached ? <line key={x.id} className="scene-edge" x1={FEED.x + 40} y1={FEED.y} x2={AT[x.id].x - NODE.w / 2} y2={AT[x.id].y} /> : null))}
            <SceneNode at={FEED} w={90} h={64} title="price feed" sub={st.last ? `last: ${st.last.price}` : 'subject'} tone="info" on />
            {SUBS.map((x) => {
              const s = st.subs[x.id];
              const dead = isDead(s);
              return (
                <SceneNode
                  key={x.id}
                  at={AT[x.id]}
                  {...NODE}
                  title={x.label}
                  sub={dead ? `unmounted · ${s.deadDeliveries} kept` : !s.mounted ? 'unmounted · freed' : s.attached ? `${x.does}` : 'detached'}
                  tone={dead ? 'bad' : 'ok'}
                  on={s.attached}
                  variant={dead ? 'bad' : s.attached ? 'default' : 'dim'}
                />
              );
            })}
            {showDeliveries &&
              st.last!.to.map((id) => (
                <Packet
                  key={`${st.tick}-${id}`}
                  path={[{ x: FEED.x + 45, y: FEED.y }, { x: AT[id].x - NODE.w / 2, y: AT[id].y }]}
                  label={String(st.last!.price)}
                  color={toneVar(st.last!.dead.includes(id) ? 'bad' : 'info')}
                  arrive="stay"
                  stopAt={PACKET_STOP}
                  duration={0.7}
                  height={18}
                  charW={6}
                  pad={12}
                />
              ))}
          </svg>
          <CodePanel title="the subject" lines={OBSERVER_CODE} className="bp-code" />
        </div>
        <Hint block>
          Scripted price feed. &quot;Retained&quot; counts the dead subscriber plus every price it has been handed since, assuming it keeps them: a simplified measure of what stays in memory. Subscribers are notified in the order they subscribed, like the Set above. It is the same pattern as{' '}
          <code>addEventListener</code> in <code>dom-events</code>, and a forgotten unsubscribe is a classic leak (see <code>memory-leaks</code>). When not to: for one listener, pass a callback;
          reach for observers when the number of listeners varies.
        </Hint>
      </div>
    </StageFrame>
  );
}
