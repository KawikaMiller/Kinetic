import type { CSSProperties, ReactNode } from 'react';
import type { Pt } from '../../core/geometry';
import { toneVar, type Tone } from '../../core/tone';
import { Pulse } from './Pulse';

/**
 * A labelled box centred on `at`: a client, server, service or database in an SVG scene.
 * `on` highlights it in `tone` (default info); `busy` adds a ripple; `children` are
 * extras drawn in scene coordinates (badges, locks, screens).
 */
export function SceneNode({
  at, w, h, rx = 10, title, sub, titleDy = -3, subDy = 13, tone, color, on = false, busy = false,
  variant = 'default', className = '', children,
}: {
  at: Pt;
  w: number;
  h: number;
  rx?: number;
  title: ReactNode;
  sub?: ReactNode;
  /** Vertical offsets of the title and sub lines from the centre. */
  titleDy?: number;
  subDy?: number;
  tone?: Tone;
  /** Any CSS colour for the highlight; overrides `tone`. */
  color?: string;
  on?: boolean;
  busy?: boolean;
  variant?: 'default' | 'bad' | 'dim';
  className?: string;
  children?: ReactNode;
}) {
  const c = color ?? (tone ? toneVar(tone) : undefined);
  const classes = ['scene-node', on && 'on', variant !== 'default' && `is-${variant}`, className].filter(Boolean).join(' ');
  return (
    <g className={classes} style={c ? ({ '--c': c } as CSSProperties) : undefined}>
      {busy && <Pulse at={at} from={Math.max(w, h) / 2} to={Math.max(w, h)} color={c ?? 'var(--info)'} />}
      <rect className="scene-node-box" x={at.x - w / 2} y={at.y - h / 2} width={w} height={h} rx={rx} />
      <text x={at.x} y={at.y + titleDy} textAnchor="middle" className="scene-node-title">
        {title}
      </text>
      {sub != null && (
        <text x={at.x} y={at.y + subDy} textAnchor="middle" className="scene-node-sub">
          {sub}
        </text>
      )}
      {children}
    </g>
  );
}
