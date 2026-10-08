import type { KeyboardEvent } from 'react';
import type { Tone } from '../../core/tone';
import { foldStacks, layoutChart, layoutFlame, type FlameNode, type Sample } from './model';
import { FN_TONE, type Mode } from './view';

const FLAME_W = 640;
const ROW = 24;
const GAP = 2;
/** Text needs at least this many px of box; narrower boxes stay unlabelled. */
const MIN_LABEL_PX = 34;
const CHAR_PX = 7.2;



interface Box {
  key: string;
  name: string;
  depth: number;
  x: number;
  w: number;
  label: string;
  node?: FlameNode;
}

const fit = (text: string, px: number) => {
  const max = Math.floor((px - 8) / CHAR_PX);
  if (max >= text.length) return text;
  return max >= 3 ? `${text.slice(0, max - 1)}…` : '';
};

export function FlameView({
  samples, mode, icicle, zoom, selected, latest, optimised, onSelect,
}: {
  samples: readonly Sample[];
  mode: Mode;
  icicle: boolean;
  /** Id of the zoomed node (flame graph only), or null. */
  zoom: string | null;
  selected: string | null;
  latest: Sample | null;
  /** Functions shown as fixed (--ok). */
  optimised: ReadonlySet<string>;
  onSelect: (node: FlameNode) => void;
}) {
  const n = samples.length;
  const root = foldStacks(samples);
  const depthMax = Math.max(1, ...samples.map((s) => s.stack.length));
  const height = (depthMax + 1) * ROW;
  const latestKey = latest ? ['all', ...latest.stack].join(';') : null;

  let boxes: Box[];
  if (n === 0) boxes = [{ key: 'all', name: 'all', depth: 0, x: 0, w: 1, label: 'no samples yet' }];
  else if (mode === 'graph') {
    const all = layoutFlame(root);
    const z = all.find((b) => b.node.id === zoom) ?? all[0];
    const inside = (id: string) => id === z.node.id || id.startsWith(`${z.node.id};`);
    const ancestor = (id: string) => z.node.id.startsWith(`${id};`);
    boxes = all
      .filter((b) => inside(b.node.id) || ancestor(b.node.id))
      .map((b) => {
        const x = ancestor(b.node.id) ? 0 : (b.x - z.x) / z.w;
        const w = ancestor(b.node.id) ? 1 : b.w / z.w;
        const pctText = `${Math.round((b.node.total / n) * 100)}%`;
        return { key: b.node.id, name: b.node.name, depth: b.depth, x, w, label: b.depth === 0 ? `all (${n} samples)` : `${b.node.name} ${pctText}`, node: b.node };
      });
  } else {
    boxes = [
      { key: 'all', name: 'all', depth: 0, x: 0, w: 1, label: `all (${n} samples, in time order)` },
      ...layoutChart(samples).map((b) => ({ key: `${b.depth}:${b.from}`, name: b.name, depth: b.depth, x: b.from / n, w: b.count / n, label: b.name })),
    ];
  }

  // One tab stop (the selected box, else the root); arrow keys walk the boxes in drawing order.
  const stop = mode === 'graph' ? (boxes.some((b) => b.key === selected) ? selected : 'all') : null;
  const move = (e: KeyboardEvent<SVGGElement>, delta: number) => {
    // The arrows are ours here; usePlayer skips a prevented keydown, so they don't also step it.
    e.preventDefault();
    const all = [...(e.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>('.pf-hit') ?? [])];
    const i = all.indexOf(e.currentTarget);
    all[Math.min(all.length - 1, Math.max(0, i + delta))]?.focus();
  };

  return (
    <svg viewBox={`0 0 ${FLAME_W} ${height}`} className="pf-flame" role="group" aria-label={mode === 'graph' ? 'Flame graph of the samples' : 'Flame chart: the samples in time order'}>
      {boxes.map((b) => {
        const y = icicle ? b.depth * ROW : height - (b.depth + 1) * ROW;
        const px = b.w * FLAME_W;
        if (px < 0.5) return null;
        const isRoot = b.depth === 0;
        const tone: Tone = isRoot ? 'muted' : optimised.has(b.name) ? 'ok' : FN_TONE[b.name] ?? 'muted';
        const isSel = mode === 'graph' && b.key === selected;
        const onLatest = latestKey !== null && mode === 'graph' && latestKey.startsWith(b.key) && (latestKey === b.key || latestKey[b.key.length] === ';');
        const text = fit(b.label, px);
        const clickable = mode === 'graph' && b.node;
        const rect = (
          <>
            <rect x={b.x * FLAME_W + GAP / 2} y={y + GAP / 2} width={Math.max(0, px - GAP)} height={ROW - GAP} rx={3} className={`pf-box tone-${isSel ? 'hi' : tone} ${isRoot ? 'is-root' : ''} ${onLatest ? 'is-latest' : ''}`} />
            {px >= MIN_LABEL_PX && text && (
              <text x={b.x * FLAME_W + 5} y={y + ROW / 2 + 4} className={`pf-label ${isSel ? 'is-selected' : ''}`}>
                {text}
              </text>
            )}
          </>
        );
        if (!clickable) return <g key={b.key}>{rect}</g>;
        const node = b.node!;
        return (
          <g
            key={b.key}
            className="pf-hit"
            role="button"
            tabIndex={b.key === stop ? 0 : -1}
            aria-label={`${node.name === 'all' ? 'all samples' : node.name}: ${node.total} samples in total, ${node.self} its own. Zoom in`}
            aria-pressed={isSel}
            onClick={() => onSelect(node)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(node);
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(e, 1);
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(e, -1);
            }}
          >
            {rect}
          </g>
        );
      })}
    </svg>
  );
}
