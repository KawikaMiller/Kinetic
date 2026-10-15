import { useEffect, useState, type MouseEvent } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import {
  Button, ChipButton, Controls, ControlGroup, Legend, PauseButton, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle,
} from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ms, NA, pct, perSec } from '../../core/format';
import { useCanvas, useLoop } from '../../core/hooks';
import { useSimulation } from '../../core/useSimulation';
import { cdnCaption, introCaption, missCaption, purgeCaption, shieldCaption, warmCaption } from './captions';
import { createRenderer, edgeAt } from './draw';
import {
  CDN_SEED, createWorld, DEFAULT_EDGE, DEFAULT_SETTINGS, EDGES, narrationDue, ORIGIN_WORK_MS, RATE_RANGE, ROUTE_STRETCH, TTL_RANGE, ttlBarMax, type Snapshot, type World,
} from './sim';
import './styles.css';

const STAGE_HEIGHT = 300;
const SNAPSHOT_EVERY_S = 0.25;
const SIDE_ITEMS = 11; // cached files listed in the side panel
const TTL_LOW = 0.25; // share of the TTL left that turns a bar amber

export function Stage() {
  const setCaption = useSetCaption();
  const [cdn, setCdn] = useState(DEFAULT_SETTINGS.cdn);
  const [shield, setShield] = useState(DEFAULT_SETTINGS.shield);
  const [ttl, setTtl] = useState(DEFAULT_SETTINGS.ttl);
  const [rate, setRate] = useState(DEFAULT_SETTINGS.rate);
  const [selected, setSelected] = useState(DEFAULT_EDGE);
  const [drawScene] = useState(createRenderer);

  useIntroCaption(introCaption());

  const narrate = (w: World, snap: Snapshot) => {
    const due = narrationDue(w.cdn, w.told, snap);
    if (due === 'miss') {
      w.told.miss = true;
      setCaption(missCaption());
    } else if (due === 'warm') {
      w.told.warm = true;
      setCaption(warmCaption(snap.hitRatio ?? 0));
    }
  };

  const { world, snap, paused, togglePause } = useSimulation({
    create: () => createWorld(),
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
  useEffect(() => {
    world().cdn.selected = selected;
  }, [world, selected]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = edgeAt(e.clientX - box.left, e.clientY - box.top, size.width, size.height);
    if (i >= 0) setSelected(i);
  };

  const toggleCdn = (on: boolean) => {
    setCdn(on);
    setCaption(cdnCaption(on));
  };

  const toggleShield = (on: boolean) => {
    setShield(on);
    setCaption(shieldCaption(on, cdn));
  };

  const purge = () => {
    world().cdn.purge();
    setCaption(purgeCaption());
  };

  const items = snap?.edge.items ?? [];
  const barMax = ttlBarMax(ttl, items);

  return (
    <StageFrame minWidth={620}
      height={STAGE_HEIGHT}
      stats={
        <Stats>
          <Stat label="p50 latency" value={snap ? ms(snap.p50) : NA} sub="last 10 s" />
          <Stat label="p95 latency" value={snap ? ms(snap.p95) : NA} sub="last 10 s" />
          <Stat label="Edge hit ratio" value={cdn ? (snap?.hitRatio != null ? pct(snap.hitRatio) : NA) : 'n/a'} sub="last 10 s" />
          <Stat label="Origin load" value={snap ? perSec(snap.originLoad, 1) : NA} color="var(--violet)" sub={`of ${rate} req/s total`} />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--info)', label: 'request → edge', shape: 'dot' },
              { color: 'var(--ok)', label: 'served from edge (hit)', shape: 'dot' },
              { color: 'var(--bad)', label: 'miss → origin', shape: 'dot' },
              { color: 'var(--violet)', label: 'origin' },
              { color: 'var(--orange)', label: 'shield', shape: 'dot' },
            ]}
          />
          <ProvenanceRow>
            <Provenance kind="simulated" seed={CDN_SEED}>seeded random users and files (a few popular files get most requests)</Provenance>
            <Provenance kind="illustrative">
              edge cities, where users live, the {ROUTE_STRETCH}× route stretch and the origin's {ORIGIN_WORK_MS} ms of work are made up; real traffic is routed by DNS or anycast and is
              not always the nearest edge
            </Provenance>
          </ProvenanceRow>
        </>
      }
      controls={
        <Controls>
          <Toggle label="CDN" value={cdn} onChange={toggleCdn} off="No CDN" on="On" />
          <Toggle label="Origin shield" value={shield} onChange={toggleShield} />
          <Slider label="Cache TTL" value={ttl} min={TTL_RANGE.min} max={TTL_RANGE.max} onChange={setTtl} format={(v) => `${v}s`} />
          <Slider label="Traffic" value={rate} min={RATE_RANGE.min} max={RATE_RANGE.max} onChange={setRate} format={(v) => `${v} req/s`} />
          <Button variant="danger" onClick={purge} disabled={!cdn}>
            Purge all caches
          </Button>
          <PauseButton paused={paused} onToggle={togglePause} />
          <ControlGroup label="Inspect edge">
            {EDGES.map((e, i) => (
              <ChipButton key={e.name} tone="info" on={i === selected} onClick={() => setSelected(i)}>
                {e.name}
              </ChipButton>
            ))}
          </ControlGroup>
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
          <p className="cdn-hint">Click an edge on the map, or pick one under the controls.</p>
          {items.length ? (
            <ul className="cdn-items">
              {items.slice(0, SIDE_ITEMS).map((it) => (
                <li key={it.asset}>
                  <span className="cdn-asset">/img/{it.asset + 1}.jpg</span>
                  <Bar value={it.left} max={barMax} height={6} tone={it.left < ttl * TTL_LOW ? 'amber' : 'ok'} />
                  <span className="cdn-left">{Math.ceil(it.left)}s</span>
                </li>
              ))}
              {items.length > SIDE_ITEMS && <li className="muted">+{items.length - SIDE_ITEMS} more</li>}
            </ul>
          ) : (
            <p className="muted">{cdn ? 'Empty. The first request for each file will miss.' : 'CDN is off. Requests skip the edges, so nothing new is cached here.'}</p>
          )}
        </aside>
      </div>
    </StageFrame>
  );
}
