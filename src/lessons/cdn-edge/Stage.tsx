import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useCanvas, useLoop } from '../../core/hooks';
import {
  ASSETS, Cdn, EDGES, LAT0, LAT1, LON0, LON1, ORIGIN, SHIELD, getLandDots, type LegKind, type Snapshot,
} from './sim';
import './styles.css';

// Canvas can't read CSS variables cheaply every frame, so mirror the tokens.
const C = {
  info: '#4cc9f0', ok: '#3ddc97', hi: '#ffd166', bad: '#ff5d6c', violet: '#a78bfa', shield: '#ff8c5a',
  text: '#e8eaf0', muted: '#8a93a8', faint: '#5b6378', land: '#2a3246', panel: '#121622',
};
const LEG_COLOR: Record<LegKind, string> = { req: C.info, hit: C.ok, miss: C.hi };

type Pt = { lon: number; lat: number };

export function Stage() {
  const setCaption = useSetCaption();
  const [cdn, setCdn] = useState(true);
  const [shield, setShield] = useState(false);
  const [ttl, setTtl] = useState(30);
  const [rate, setRate] = useState(18);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  const simRef = useRef<Cdn | null>(null);
  // lazily created; only touched from effects, the loop and handlers
  const sim = () => (simRef.current ??= new Cdn());
  const mapRef = useRef<{ w: number; h: number; img: HTMLCanvasElement } | null>(null);
  const said = useRef({ miss: false, warm: false, lastStats: 0 });

  useEffect(() => {
    sim().settings = { cdn, shield, ttl, rate };
  }, [cdn, shield, ttl, rate]);

  useEffect(() => {
    setCaption(
      <>
        Users all over the world request images and scripts. With a CDN, each request goes to the <b>nearest edge</b>{' '}
        server instead of the origin in Virginia.
      </>,
    );
  }, [setCaption]);

  const project = (p: Pt, w: number, h: number) => ({
    x: ((p.lon - LON0) / (LON1 - LON0)) * w,
    y: ((LAT0 - p.lat) / (LAT0 - LAT1)) * h,
  });

  function mapImage(w: number, h: number) {
    const m = mapRef.current;
    if (m && m.w === w && m.h === h) return m.img;
    const img = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    img.width = Math.round(w * dpr);
    img.height = Math.round(h * dpr);
    const g = img.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = C.land;
    const r = Math.max(1.1, w / 520);
    for (const [lon, lat] of getLandDots()) {
      const { x, y } = project({ lon, lat }, w, h);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    mapRef.current = { w, h, img };
    return img;
  }

  function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const s = sim();
    ctx.drawImage(mapImage(w, h), 0, 0, w, h);
    const now = s.now;
    const P = (p: Pt) => project(p, w, h);

    // requests in flight
    for (const part of s.particles) {
      const leg = part.legs.find((l) => now >= l.start && now < l.start + l.dur);
      if (!leg) continue;
      const k = (now - leg.start) / leg.dur;
      const a = P(leg.from);
      const b = P(leg.to);
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const col = LEG_COLOR[leg.kind];
      ctx.strokeStyle = col + '44';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';

    // origin
    const o = P(ORIGIN);
    const oPulse = Math.max(0, 1 - (now - s.originFlash) * 3);
    ctx.fillStyle = C.violet;
    ctx.shadowColor = C.violet;
    ctx.shadowBlur = 10 + oPulse * 18;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y - 10);
    ctx.lineTo(o.x + 10, o.y);
    ctx.lineTo(o.x, o.y + 10);
    ctx.lineTo(o.x - 10, o.y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.violet;
    ctx.textAlign = 'left';
    ctx.fillText('ORIGIN', o.x + 13, o.y + 4);
    ctx.textAlign = 'center';

    if (s.settings.cdn && s.settings.shield) {
      const sp = P(SHIELD);
      ctx.fillStyle = C.shield;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('shield', sp.x, sp.y + 18);
    }

    // edges with cache-fill rings
    EDGES.forEach((e, i) => {
      const p = P(e);
      const on = s.settings.cdn;
      const fill = s.cachedCount(i) / ASSETS;
      const glow = Math.max(0, 1 - (now - s.flash[i]) * 4);
      ctx.globalAlpha = on ? 1 : 0.3;
      ctx.fillStyle = C.panel;
      ctx.strokeStyle = i === s.selected ? C.text : C.info;
      ctx.lineWidth = i === s.selected ? 2 : 1.5;
      ctx.shadowColor = C.ok;
      ctx.shadowBlur = glow * 16;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (on && fill > 0) {
        ctx.strokeStyle = C.ok;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = i === s.selected ? C.text : C.muted;
      ctx.fillText(e.name, p.x, p.y - 17);
      ctx.globalAlpha = 1;
    });

    // origin load sparkline
    const hist = s.originHistory;
    const bx = 14;
    const bw = Math.min(220, w * 0.26);
    const bh = 46;
    const by = h - bh - 12;
    ctx.fillStyle = 'rgba(10,12,17,0.82)';
    ctx.strokeStyle = '#242a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.fillText('ORIGIN LOAD (req/s)', bx + 8, by + 14);
    const max = Math.max(5, ...hist);
    ctx.strokeStyle = C.violet;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = bx + 8 + (i / 79) * (bw - 16);
      const y = by + bh - 6 - (v / max) * (bh - 24);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  const { wrapRef, canvasRef, redraw, size } = useCanvas(draw);

  useLoop((dt) => {
    const s = sim();
    s.step(dt);
    redraw();
    const st = said.current;
    if (s.now - st.lastStats > 0.25) {
      st.lastStats = s.now;
      const snapNow = s.snapshot();
      setSnap(snapNow);
      if (s.settings.cdn && !st.miss && s.misses > 3 && s.now > 1) {
        st.miss = true;
        setCaption(
          <>
            <span className="hl">Cache miss</span>: the edge doesn't have the file yet, so it fetches it from the origin (amber) and
            keeps a copy. The <i>next</i> nearby user gets it locally.
          </>,
        );
      } else if (s.settings.cdn && st.miss && !st.warm && s.now > 9 && (snapNow.hitRatio ?? 0) > 0.7) {
        st.warm = true;
        setCaption(
          <>
            Caches are warm: most requests now stop at the edge (<span className="hl ok">green</span>). The origin barely hears
            about them. Watch its load line.
          </>,
        );
      }
    }
  }, !paused);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = -1;
    let bestD = 26;
    EDGES.forEach((edge, i) => {
      const p = project(edge, size.width, size.height);
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) sim().selected = best;
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
          <span className="hl" style={{ color: C.shield }}>Origin shield</span>: edges ask one mid-tier cache near the origin
          first, so the same miss in nine cities becomes <b>one</b> origin fetch.
        </>
      ) : (
        <>Shield off: every edge's miss goes straight to the origin.</>
      ),
    );
  };

  const purge = () => {
    sim().purge();
    setCaption(
      <>
        <span className="hl bad">Purged!</span> Every edge is empty, so misses flood the origin until caches refill. Invalidate
        carefully, and ideally only the files that changed.
      </>,
    );
  };

  const pct = (v: number | null) => (v === null ? '·' : `${Math.round(v * 100)}%`);

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="p50 latency" value={snap ? `${Math.round(snap.p50)} ms` : '·'} color={cdn ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="p95 latency" value={snap ? `${Math.round(snap.p95)} ms` : '·'} color="var(--hi)" />
          <Stat label="Edge hit ratio" value={cdn ? pct(snap?.hitRatio ?? null) : 'n/a'} color="var(--ok)" sub="last 10 s" />
          <Stat label="Origin load" value={snap ? `${snap.originLoad.toFixed(1)}/s` : '·'} color="var(--violet)" sub={`of ${rate} req/s total`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: C.info, label: 'request → edge', shape: 'dot' },
            { color: C.ok, label: 'served from edge (hit)', shape: 'dot' },
            { color: C.hi, label: 'miss → origin', shape: 'dot' },
            { color: C.violet, label: 'origin' },
            { color: C.shield, label: 'shield', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="CDN"
            value={cdn ? 'on' : 'off'}
            onChange={(v) => toggleCdn(v === 'on')}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'No CDN' },
            ]}
          />
          <Segmented
            label="Origin shield"
            value={shield ? 'on' : 'off'}
            onChange={(v) => toggleShield(v === 'on')}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
            ]}
          />
          <Slider label="Cache TTL" value={ttl} min={3} max={120} onChange={setTtl} format={(v) => `${v}s`} />
          <Slider label="Traffic" value={rate} min={4} max={50} onChange={setRate} format={(v) => `${v} req/s`} />
          <Button variant="danger" onClick={purge} disabled={!cdn}>
            Purge all caches
          </Button>
          <Button onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</Button>
        </Controls>
      }
    >
      <div className="cdn">
        <div ref={wrapRef} className="cdn-map">
          <canvas ref={canvasRef} onClick={onClick} className="cdn-canvas" aria-label="World map of CDN edge servers and requests" />
        </div>
        <aside className="cdn-side">
          <h4>
            Edge cache: <span>{snap?.edge.name ?? EDGES[3].name}</span>
          </h4>
          <p className="cdn-hint">Click any edge on the map to inspect it.</p>
          {!cdn ? (
            <p className="muted">CDN is off. Nothing is cached anywhere.</p>
          ) : snap && snap.edge.items.length ? (
            <ul className="cdn-items">
              {snap.edge.items.slice(0, 11).map((it) => (
                <li key={it.asset}>
                  <span className="cdn-asset">/img/{it.asset + 1}.jpg</span>
                  <span className="cdn-ttl">
                    <i style={{ width: `${Math.min(100, (it.left / ttl) * 100)}%` }} className={it.left < ttl * 0.25 ? 'low' : ''} />
                  </span>
                  <span className="cdn-left">{Math.ceil(it.left)}s</span>
                </li>
              ))}
              {snap.edge.items.length > 11 && <li className="muted">+{snap.edge.items.length - 11} more</li>}
            </ul>
          ) : (
            <p className="muted">Empty. The first request for each file will miss.</p>
          )}
        </aside>
      </div>
    </StageFrame>
  );
}
