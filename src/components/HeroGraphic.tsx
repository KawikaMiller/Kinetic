import { motion, useReducedMotion } from 'motion/react';

// A little living system diagram: requests flow client → LB → servers → DB.
const NODES = [
  { id: 'c', x: 50, y: 160, label: 'client', color: '#4cc9f0' },
  { id: 'lb', x: 170, y: 160, label: 'LB', color: '#f7b538' },
  { id: 's1', x: 300, y: 70, label: 'api', color: '#a78bfa' },
  { id: 's2', x: 300, y: 160, label: 'api', color: '#a78bfa' },
  { id: 's3', x: 300, y: 250, label: 'api', color: '#a78bfa' },
  { id: 'db', x: 440, y: 120, label: 'db', color: '#3ddc97' },
  { id: 'q', x: 440, y: 220, label: 'cache', color: '#ff5d8f' },
] as const;

const EDGES: [string, string][] = [
  ['c', 'lb'], ['lb', 's1'], ['lb', 's2'], ['lb', 's3'],
  ['s1', 'db'], ['s2', 'db'], ['s2', 'q'], ['s3', 'q'],
];

// Paths a packet travels, as node id sequences.
const ROUTES = [
  ['c', 'lb', 's1', 'db'],
  ['c', 'lb', 's2', 'q'],
  ['c', 'lb', 's3', 'q'],
  ['c', 'lb', 's2', 'db'],
];

const pos = (id: string) => NODES.find((n) => n.id === id)!;

export function HeroGraphic() {
  // Decorative loops: under reduced motion the packets rest at their start and the rings don't pulse.
  const still = useReducedMotion();
  return (
    <motion.svg
      className="hero-graphic"
      viewBox="0 0 490 320"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      aria-hidden="true"
    >
      {EDGES.map(([a, b]) => {
        const p = pos(a);
        const q = pos(b);
        return <line key={a + b} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="hero-edge" />;
      })}

      {ROUTES.map((route, r) => {
        const pts = route.map(pos);
        // there and back again
        const xs = [...pts.map((p) => p.x), ...pts.slice(0, -1).reverse().map((p) => p.x)];
        const ys = [...pts.map((p) => p.y), ...pts.slice(0, -1).reverse().map((p) => p.y)];
        return (
          <motion.circle
            key={r}
            r={5}
            className="hero-packet"
            fill={r % 2 ? '#4cc9f0' : '#ffd166'}
            initial={{ cx: xs[0], cy: ys[0] }}
            animate={still ? undefined : { cx: xs, cy: ys }}
            transition={{ duration: 4.2, repeat: Infinity, delay: r * 1.05, ease: 'linear' }}
          />
        );
      })}

      {NODES.map((n, i) => (
        <g key={n.id}>
          {!still && (
            <motion.circle
              cx={n.x}
              cy={n.y}
              fill="none"
              stroke={n.color}
              initial={{ r: 24, strokeOpacity: 0.35 }}
              animate={{ r: [24, 34], strokeOpacity: [0.35, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.3 }}
            />
          )}
          <circle cx={n.x} cy={n.y} r={24} className="hero-node" stroke={n.color} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" className="hero-label">
            {n.label}
          </text>
        </g>
      ))}
    </motion.svg>
  );
}
