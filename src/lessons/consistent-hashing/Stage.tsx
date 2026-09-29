import { motion } from 'motion/react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { hash32, modOwner, ringOwner, ringPoints, type Point } from './hash';
import './styles.css';

const ALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const COLORS: Record<string, string> = {
  A: '#4cc9f0', B: '#a78bfa', C: '#3ddc97', D: '#ffd166', E: '#ff8c5a', F: '#ff5d8f', G: '#8fb8ff', H: '#f7b538',
};
const KEY_COUNT = 100;
const KEYS = Array.from({ length: KEY_COUNT }, (_, i) => {
  const name = `user:${i + 1}`;
  const h = hash32(name);
  return { i, name, h, pos: h / 2 ** 32 };
});

type Mode = 'ring' | 'mod';

interface Change {
  ring: number;
  mod: number;
  moved: Set<number>; // key indexes that moved in the scheme being shown
  version: number;
  label: string;
}

function owners(servers: string[], vnodes: number) {
  const pts = ringPoints(servers, vnodes);
  return {
    pts,
    ring: KEYS.map((k) => ringOwner(pts, k.pos).server),
    mod: KEYS.map((k) => modOwner(servers, k.h)),
  };
}

// ring geometry (SVG units)
const CX = 220;
const CY = 215;
const R = 172;
const angle = (pos: number) => pos * Math.PI * 2 - Math.PI / 2;
const at = (pos: number, r: number) => ({ x: CX + Math.cos(angle(pos)) * r, y: CY + Math.sin(angle(pos)) * r });

function arcPath(from: number, to: number, r: number) {
  let span = to - from;
  if (span <= 0) span += 1;
  const a = at(from, r);
  const b = at(from + span, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function Stage() {
  const setCaption = useSetCaption();
  const [servers, setServers] = useState(['A', 'B', 'C', 'D']);
  const [vnodes, setVnodes] = useState(1);
  const [mode, setMode] = useState<Mode>('ring');
  const [hover, setHover] = useState<number | null>(null);
  const [change, setChange] = useState<Change | null>(null);

  const now = useMemo(() => owners(servers, vnodes), [servers, vnodes]);
  const own = mode === 'ring' ? now.ring : now.mod;

  useEffect(() => {
    setCaption(
      <>
        {KEY_COUNT} keys, 4 servers. On the ring, each key walks <b>clockwise</b> to the first server it
        meets. Hover a key to see its path.
      </>,
    );
  }, [setCaption]);

  const applyChange = (next: string[], label: string) => {
    const after = owners(next, vnodes);
    const ringMoved = new Set(KEYS.filter((k) => after.ring[k.i] !== now.ring[k.i]).map((k) => k.i));
    const modMoved = new Set(KEYS.filter((k) => after.mod[k.i] !== now.mod[k.i]).map((k) => k.i));
    setChange((c) => ({
      ring: ringMoved.size,
      mod: modMoved.size,
      moved: mode === 'ring' ? ringMoved : modMoved,
      version: (c?.version ?? 0) + 1,
      label,
    }));
    setServers(next);
    const r = ringMoved.size;
    const m = modMoved.size;
    setCaption(
      mode === 'ring' ? (
        <>
          {label}. On the ring only <span className="hl ok">{r} keys</span> moved: just the arc next to it. With{' '}
          <code>% N</code> it would have been <span className="hl bad">{m}</span>.
        </>
      ) : (
        <>
          {label}. <code>hash % N</code> changed for <span className="hl bad">{m} of {KEY_COUNT} keys</span>. Almost
          everything reshuffled. A ring would have moved just <span className="hl ok">{r}</span>.
        </>
      ),
    );
  };

  const add = () => {
    const nextName = ALL.find((s) => !servers.includes(s));
    if (!nextName) return;
    applyChange([...servers, nextName], `Server ${nextName} joined`);
  };
  const remove = (s: string) => {
    if (servers.length <= 2) return;
    applyChange(servers.filter((x) => x !== s), `Server ${s} left`);
  };

  const counts = servers.map((s) => own.filter((o) => o === s).length);
  const fair = KEY_COUNT / servers.length;
  const busiest = Math.max(...counts);
  const moved = change?.moved ?? new Set<number>();

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Servers" value={servers.length} />
          <Stat
            label="Keys moved"
            value={change ? `${mode === 'ring' ? change.ring : change.mod}/${KEY_COUNT}` : '–'}
            color={mode === 'ring' ? 'var(--ok)' : 'var(--bad)'}
            sub={change ? `last change · ${mode === 'ring' ? 'ring' : '% N'}` : 'add or remove a server'}
          />
          <Stat
            label="The other scheme"
            value={change ? `${mode === 'ring' ? change.mod : change.ring}/${KEY_COUNT}` : '–'}
            color={mode === 'ring' ? 'var(--bad)' : 'var(--ok)'}
            sub={mode === 'ring' ? 'with hash % N' : 'with a ring'}
          />
          <Stat
            label="Busiest server"
            value={`${(busiest / fair).toFixed(2)}×`}
            color={busiest / fair > 1.5 ? 'var(--bad)' : busiest / fair > 1.2 ? 'var(--hi)' : 'var(--ok)'}
            sub="its fair share"
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--text)', label: 'key (coloured by owner)', shape: 'dot' },
            { color: 'var(--hi)', label: 'just moved', shape: 'dot' },
            { color: 'var(--violet)', label: 'server point', shape: 'square' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented
            label="Scheme"
            options={[
              { value: 'ring', label: 'Hash ring' },
              { value: 'mod', label: 'hash(key) % N' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setChange(null);
              setCaption(
                m === 'ring' ? (
                  <>The ring: servers and keys hashed onto the same circle. Ownership only changes <b>locally</b>.</>
                ) : (
                  <><code>hash(key) % N</code>: dead simple, perfectly fine… until N changes. Try adding a server.</>
                ),
              );
            }}
          />
          <Button variant="primary" onClick={add} disabled={servers.length >= ALL.length}>
            + Add server
          </Button>
          <Button
            onClick={() => remove(servers[Math.floor(Math.random() * servers.length)])}
            disabled={servers.length <= 2}
          >
            − Remove a server
          </Button>
          {mode === 'ring' && (
            <Slider
              label="Virtual nodes per server"
              value={vnodes}
              min={1}
              max={50}
              onChange={(v) => {
                setVnodes(v);
                setChange(null);
                setCaption(
                  v === 1 ? (
                    <>One point per server: the arcs are random sizes, so some servers own far more of the ring.</>
                  ) : (
                    <>
                      <span className="hl violet">{v} points</span> per server: many small arcs average out, so the load
                      evens up. Watch the bars.
                    </>
                  ),
                );
              }}
            />
          )}
        </Controls>
      }
    >
      <div className="ch">
        <div className="ch-main">
          {mode === 'ring' ? (
            <Ring
              pts={now.pts}
              owners={now.ring}
              vnodes={vnodes}
              hover={hover}
              setHover={setHover}
              moved={moved}
              version={change?.version ?? 0}
              onServer={remove}
            />
          ) : (
            <Buckets servers={servers} owners={now.mod} hover={hover} setHover={setHover} moved={moved} version={change?.version ?? 0} />
          )}
        </div>

        <aside className="ch-side">
          <h4>Keys per server</h4>
          <div className="ch-bars">
            {servers.map((s, i) => (
              <button key={s} type="button" className="ch-bar" onClick={() => remove(s)} title={`Remove server ${s}`}>
                <span className="ch-bar-name" style={{ color: COLORS[s] }}>
                  {s}
                </span>
                <span className="ch-bar-track">
                  <motion.i
                    style={{ background: COLORS[s] }}
                    initial={false}
                    animate={{ width: `${Math.min(100, (counts[i] / (fair * 2.5)) * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 180, damping: 22 }}
                  />
                  <span className="ch-fair" style={{ left: `${100 / 2.5}%` }} />
                </span>
                <span className="ch-bar-count">{counts[i]}</span>
              </button>
            ))}
          </div>
          <p className="ch-note">
            <span className="ch-fair-key" /> fair share ({fair.toFixed(0)}) · click a bar to remove that server
          </p>

          <div className="ch-inspect">
            {hover !== null ? (
              <>
                <b>{KEYS[hover].name}</b>
                <span>
                  hash <code>0x{KEYS[hover].h.toString(16).padStart(8, '0')}</code>
                </span>
                {mode === 'ring' ? (
                  <span>{(KEYS[hover].pos * 100).toFixed(1)}% round the ring</span>
                ) : (
                  <span>
                    {KEYS[hover].h} % {servers.length} = {KEYS[hover].h % servers.length}
                  </span>
                )}
                <span>
                  → server <b style={{ color: COLORS[own[hover]] }}>{own[hover]}</b>
                </span>
              </>
            ) : (
              <span className="muted">Hover a key to inspect it.</span>
            )}
          </div>
        </aside>
      </div>
    </StageFrame>
  );
}

function Ring({
  pts, owners, vnodes, hover, setHover, moved, version, onServer,
}: {
  pts: Point[];
  owners: string[];
  vnodes: number;
  hover: number | null;
  setHover: (i: number | null) => void;
  moved: Set<number>;
  version: number;
  onServer: (s: string) => void;
}) {
  const hk = hover !== null ? KEYS[hover] : null;
  const hOwner = hk ? ringOwner(pts, hk.pos) : null;
  const big = vnodes <= 3;

  return (
    <svg viewBox="0 0 440 430" className="ch-svg">
      {/* ownership arcs: each point owns the stretch counter-clockwise back to the previous point */}
      {pts.map((p, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        return (
          <path
            key={`${p.server}-${p.pos}`}
            d={pts.length === 1 ? arcPath(p.pos, p.pos + 0.9999, R) : arcPath(prev.pos, p.pos, R)}
            stroke={COLORS[p.server]}
            strokeWidth={10}
            strokeOpacity={0.55}
            fill="none"
          />
        );
      })}

      {/* hovered key's clockwise walk to its owner */}
      {hk && hOwner && (
        <motion.path
          key={hover}
          d={arcPath(hk.pos, hOwner.pos === hk.pos ? hk.pos + 0.0001 : hOwner.pos, R - 30)}
          stroke="var(--hi)"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      )}

      {/* keys that just changed owner walk clockwise to their new server */}
      {moved.size <= 40 &&
        [...moved].map((i) => {
          const k = KEYS[i];
          const o = ringOwner(pts, k.pos);
          return (
            <motion.path
              key={`mv-${version}-${i}`}
              d={arcPath(k.pos, o.pos, R - 30 - (i % 4) * 4)}
              stroke={COLORS[o.server]}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1, opacity: [1, 1, 0] }}
              transition={{ duration: 1.8, ease: 'easeOut', delay: (i % 10) * 0.04 }}
            />
          );
        })}

      {/* keys */}
      {KEYS.map((k) => {
        const r = R - 24 - (k.i % 4) * 9;
        const p = at(k.pos, r);
        const isMoved = moved.has(k.i);
        return (
          <circle
            key={`${k.i}-${isMoved ? version : 0}`}
            cx={p.x}
            cy={p.y}
            r={hover === k.i ? 6 : 4}
            className={`ch-key ${isMoved ? 'moved' : ''}`}
            style={{ fill: COLORS[owners[k.i]] } as CSSProperties}
            onMouseEnter={() => setHover(k.i)}
            onMouseLeave={() => setHover(null)}
          />
        );
      })}

      {/* server points */}
      {pts.map((p) => {
        const o = at(p.pos, R);
        const lbl = at(p.pos, R + 22);
        const primary = p === pts.find((q) => q.server === p.server);
        return (
          <g key={`pt-${p.server}-${p.pos}`} className="ch-point" onClick={() => onServer(p.server)}>
            <circle cx={o.x} cy={o.y} r={big ? 9 : 4} fill="var(--bg-2)" stroke={COLORS[p.server]} strokeWidth={big ? 3 : 2} />
            {(big || primary) && (
              <text x={lbl.x} y={lbl.y + 4} textAnchor="middle" fill={COLORS[p.server]} className="ch-point-label">
                {p.server}
              </text>
            )}
          </g>
        );
      })}

      <text x={CX} y={CY - 6} textAnchor="middle" className="ch-center">
        hash ring
      </text>
      <text x={CX} y={CY + 14} textAnchor="middle" className="ch-center-sub">
        0 → 2³² clockwise
      </text>
    </svg>
  );
}

function Buckets({
  servers, owners, hover, setHover, moved, version,
}: {
  servers: string[];
  owners: string[];
  hover: number | null;
  setHover: (i: number | null) => void;
  moved: Set<number>;
  version: number;
}) {
  const W = 440;
  const top = 70;
  const colW = (W - 20) / servers.length;
  const perRow = Math.max(2, Math.floor((colW - 12) / 13));
  const slot = new Map<number, { x: number; y: number }>();
  let tallest = 0;
  servers.forEach((s, c) => {
    let n = 0;
    KEYS.forEach((k) => {
      if (owners[k.i] !== s) return;
      slot.set(k.i, { x: 10 + c * colW + 12 + (n % perRow) * 13, y: top + 16 + Math.floor(n / perRow) * 13 });
      n++;
    });
    tallest = Math.max(tallest, Math.ceil(n / perRow));
  });
  const colH = Math.max(160, tallest * 13 + 30);

  return (
    <svg viewBox="0 0 440 430" className="ch-svg">
      {servers.map((s, c) => (
        <g key={s}>
          <rect x={10 + c * colW + 3} y={top - 6} width={colW - 6} height={colH} rx={10} fill="var(--cell)" stroke={COLORS[s]} strokeOpacity={0.5} />
          <text x={10 + c * colW + colW / 2} y={top - 22} textAnchor="middle" fill={COLORS[s]} className="ch-point-label">
            {s}
          </text>
          <text x={10 + c * colW + colW / 2} y={top - 40} textAnchor="middle" className="ch-center-sub">
            % {servers.length} = {c}
          </text>
        </g>
      ))}
      {KEYS.map((k) => {
        const p = slot.get(k.i)!;
        const isMoved = moved.has(k.i);
        return (
          <motion.circle
            key={k.i}
            r={hover === k.i ? 6 : 4.5}
            initial={false}
            animate={{ cx: p.x, cy: p.y }}
            transition={{ type: 'spring', stiffness: 90, damping: 16, delay: isMoved ? (k.i % 20) * 0.02 : 0 }}
            className={`ch-key ${isMoved ? `moved v${version % 2}` : ''}`}
            style={{ fill: COLORS[owners[k.i]] }}
            onMouseEnter={() => setHover(k.i)}
            onMouseLeave={() => setHover(null)}
          />
        );
      })}
    </svg>
  );
}
