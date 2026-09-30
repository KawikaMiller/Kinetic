import { useEffect, useState, type MouseEvent } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, PauseButton, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ms, NA, pct, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { useSimulation } from '../../core/useSimulation';
import { createRenderer, edgeAt } from './draw';
import { createWorld, DEFAULT_EDGE, EDGES, type Snapshot, type World } from './sim';
import './styles.css';

const STAGE_HEIGHT = 300;
const SNAPSHOT_EVERY_S = 0.25;
const SIDE_ITEMS = 11; // cached files listed in the side panel
const TTL_LOW = 0.25; // share of the TTL left that turns a bar amber
// The one-off captions: a few misses after the first second, then warm caches later on.
const FIRST_MISSES = 3;
const WARM_AFTER_S = 9;
const WARM_HIT_RATIO = 0.7;

export function Stage() {
  const setCaption = useSetCaption();
  const [cdn, setCdn] = useState(true);
  const [shield, setShield] = useState(false);
  const [ttl, setTtl] = useState(30);
  const [rate, setRate] = useState(18);
  const [drawScene] = useState(createRenderer);

  useIntroCaption(
    <>
      Users all over the world request images and scripts. With a CDN, each request goes to the <b>nearest edge</b>{' '}
      server instead of the origin in Virginia.
    </>,
  );

  const narrate = ({ cdn: s, told }: World, snap: Snapshot) => {
    if (!s.settings.cdn) return;
    if (!told.miss && s.misses > FIRST_MISSES && s.now > 1) {
      told.miss = true;
      setCaption(
        <>
          <span className="hl">Cache miss</span>: the edge doesn't have the file yet, so it fetches it from the origin (amber) and
          keeps a copy. The <i>next</i> nearby user gets it locally.
        </>,
      );
    } else if (told.miss && !told.warm && s.now > WARM_AFTER_S && (snap.hitRatio ?? 0) > WARM_HIT_RATIO) {
      told.warm = true;
      setCaption(
        <>
          Caches are warm: most requests now stop at the edge (<span className="hl ok">green</span>). The origin barely hears
          about them. Watch its load line.
        </>,
      );
    }
  };

  const { world, snap, paused, togglePause } = useSimulation({
    create: createWorld,
    step: (w, dt) => w.cdn.step(dt),
    snapshot: (w) => w.cdn.snapshot(),
    snapshotEvery: SNAPSHOT_EVERY_S,
    onSnapshot: narrate,
  });
  const { wrapRef, canvasRef, redraw, size } = useCanvas((ctx, w, h) => drawScene(ctx, w, h, world().cdn));
  useLoop(redraw, !paused);

  useEffect(() => {
    world().cdn.settings = { cdn, shield, ttl, rate };
  }, [world, cdn, shield, ttl, rate]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = edgeAt(e.clientX - box.left, e.clientY - box.top, size.width, size.height);
    if (i >= 0) world().cdn.selected = i;
  };

  const toggleCdn = (on: boolean) => {
    setCdn(on);
    setCaption(
      on ? (
        <>CDN back on. The edges kept their copies, so anything still inside its TTL is a hit straight away.</>
      ) : (
        <>
          <span className="hl bad">No CDN</span>: every request crosses oceans to Virginia. Watch p50 latency and the origin's
          load jump.
        </>
      ),
    );
  };

  const toggleShield = (on: boolean) => {
    setShield(on);
    setCaption(
      on ? (
        <>
          <span className="hl" style={{ color: 'var(--orange)' }}>Origin shield</span>: edges ask one mid-tier cache near the origin
          first, so the same miss in nine cities becomes <b>one</b> origin fetch.
        </>
      ) : (
        <>Shield off: every edge's miss goes straight to the origin.</>
      ),
    );
  };

  const purge = () => {
    world().cdn.purge();
    setCaption(
      <>
        <span className="hl bad">Purged!</span> Every edge is empty, so misses flood the origin until caches refill. Invalidate
        carefully, and ideally only the files that changed.
      </>,
    );
  };

  const items = snap?.edge.items ?? [];

  return (
    <StageFrame
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="p50 latency" value={snap ? ms(snap.p50) : NA} color={cdn ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="p95 latency" value={snap ? ms(snap.p95) : NA} color="var(--hi)" />
          <Stat label="Edge hit ratio" value={cdn ? (snap?.hitRatio != null ? pct(snap.hitRatio) : NA) : 'n/a'} color="var(--ok)" sub="last 10 s" />
          <Stat label="Origin load" value={snap ? perSec(snap.originLoad, 1) : NA} color="var(--violet)" sub={`of ${rate} req/s total`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request → edge', shape: 'dot' },
            { color: 'var(--ok)', label: 'served from edge (hit)', shape: 'dot' },
            { color: 'var(--hi)', label: 'miss → origin', shape: 'dot' },
            { color: 'var(--violet)', label: 'origin' },
            { color: 'var(--orange)', label: 'shield', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Toggle label="CDN" value={cdn} onChange={toggleCdn} off="No CDN" on="On" />
          <Toggle label="Origin shield" value={shield} onChange={toggleShield} />
          <Slider label="Cache TTL" value={ttl} min={3} max={120} onChange={setTtl} format={(v) => `${v}s`} />
          <Slider label="Traffic" value={rate} min={4} max={50} onChange={setRate} format={(v) => `${v} req/s`} />
          <Button variant="danger" onClick={purge} disabled={!cdn}>
            Purge all caches
          </Button>
          <PauseButton paused={paused} onToggle={togglePause} />
        </Controls>
      }
    >
      <div className="cdn">
        <div ref={wrapRef} className="cdn-map">
          <canvas ref={canvasRef} onClick={onClick} className="cdn-canvas" aria-label="World map of CDN edge servers and requests" />
        </div>
        <aside className="cdn-side">
          <h4>
            Edge cache: <span>{snap?.edge.name ?? EDGES[DEFAULT_EDGE].name}</span>
          </h4>
          <p className="cdn-hint">Click any edge on the map to inspect it.</p>
          {!cdn ? (
            <p className="muted">CDN is off. Nothing is cached anywhere.</p>
          ) : items.length ? (
            <ul className="cdn-items">
              {items.slice(0, SIDE_ITEMS).map((it) => (
                <li key={it.asset}>
                  <span className="cdn-asset">/img/{it.asset + 1}.jpg</span>
                  <Bar value={it.left} max={ttl} height={6} tone={it.left < ttl * TTL_LOW ? 'hi' : 'ok'} />
                  <span className="cdn-left">{Math.ceil(it.left)}s</span>
                </li>
              ))}
              {items.length > SIDE_ITEMS && <li className="muted">+{items.length - SIDE_ITEMS} more</li>}
            </ul>
          ) : (
            <p className="muted">Empty. The first request for each file will miss.</p>
          )}
        </aside>
      </div>
    </StageFrame>
  );
}
