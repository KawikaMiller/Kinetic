import { motion } from 'motion/react';
import { KEYS, SERVER_COLORS } from './model';

/** The bar track spans this many fair shares, so the fair-share mark sits at 1/FAIR_SPAN. */
const FAIR_SPAN = 2.5;

/** Keys-per-server bars (click to remove a server) and the hovered-key inspector. */
export function SidePanel({
  servers, counts, fair, hover, own, mode, onRemove,
}: {
  servers: string[];
  counts: number[];
  fair: number;
  hover: number | null;
  own: string[];
  mode: 'ring' | 'mod';
  onRemove: (s: string) => void;
}) {
  return (
    <aside className="ch-side">
      <h4>Keys per server</h4>
      <div className="ch-bars">
        {servers.map((s, i) => (
          <button key={s} type="button" className="ch-bar" onClick={() => onRemove(s)} title={`Remove server ${s}`}>
            <span className="ch-bar-name" style={{ color: SERVER_COLORS[s] }}>
              {s}
            </span>
            <span className="ch-bar-track">
              <motion.i
                style={{ background: SERVER_COLORS[s] }}
                initial={false}
                animate={{ width: `${Math.min(100, (counts[i] / (fair * FAIR_SPAN)) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 180, damping: 22 }}
              />
              <span className="ch-fair" style={{ left: `${100 / FAIR_SPAN}%` }} />
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
              → server <b style={{ color: SERVER_COLORS[own[hover]] }}>{own[hover]}</b>
            </span>
          </>
        ) : (
          <span className="muted">Hover a key to inspect it.</span>
        )}
      </div>
    </aside>
  );
}
