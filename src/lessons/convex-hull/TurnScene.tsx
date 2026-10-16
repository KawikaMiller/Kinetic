import { useState, type ReactNode } from 'react';
import { Plot2D, Points, Polygon } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Stat, Stats } from '../../components/ui';
import { cross, type P } from './hull';
import { TURN_PRESETS, TURN_OPEN, TURN_DOMAIN, snapPoint, type TurnPreset } from './turn';
import { TURN_PHRASE, TURN_WORDS, crossText, pt, turnOf } from './text';

const AXIS = { domain: [-TURN_DOMAIN, TURN_DOMAIN] as [number, number], label: '', ticks: 5 };
const NAMES = ['a', 'b', 'c'];
const TURN_TONE = { left: 'ok', right: 'bad', collinear: 'dim' } as const;

/** Scene 1: three draggable points and the sign of one cross product. */
export function TurnScene({ picker }: { picker: ReactNode }) {
  const [tri, setTri] = useState<P[]>(TURN_OPEN);
  const [preset, setPreset] = useState<TurnPreset['id'] | null>('left');
  const [a, b, c] = tri;
  const value = cross(a, b, c);
  const turn = turnOf(value);
  const tone = TURN_TONE[turn];

  const intro = (
    <>
      cross = {crossText(a, b, c)}: {TURN_PHRASE[turn]}. The absolute value, {Math.abs(value)}, is twice the area of the triangle, so the area is {Math.abs(value) / 2}.
    </>
  );

  return (
    <StageFrame
      height={420}
      intro={intro}
      introKey={[value, a, b, c]}
      stats={
        <Stats>
          <Stat label="Cross product" value={value} color={`var(--${tone})`} sub="(b - a) x (c - a)" />
          <Stat label="Turn" value={turn === 'left' ? 'Left' : turn === 'right' ? 'Right' : 'Collinear'} color={`var(--${tone})`} sub={TURN_WORDS[turn]} />
          <Stat label="Triangle area" value={Math.abs(value) / 2} sub={`|cross| / 2 = ${Math.abs(value)} / 2`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a, b, c (drag me)', shape: 'dot' },
            { color: 'var(--ok)', label: 'left turn (positive)', shape: 'square' },
            { color: 'var(--bad)', label: 'right turn (negative)', shape: 'square' },
            { color: 'var(--dim)', label: 'collinear (zero)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {TURN_PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => { setTri(p.points); setPreset(p.id); }}>{p.label}</ChipButton>
          ))}
          <Hint>
            Convention: y points up, and a left turn (counter-clockwise) is a positive cross product. Drag a point (it snaps to whole numbers) or focus one and use the arrow keys (one whole number per press, Shift for a few).
          </Hint>
        </>,
      ]}
    >
      <div className="ch-stage stage-pad">
        <Plot2D x={AXIS} y={AXIS} aspect="equal" ariaLabel={`Three points a ${pt(a)}, b ${pt(b)}, c ${pt(c)}: ${TURN_PHRASE[turn]}`}>
          <Polygon points={tri.map((p) => [p.x, p.y] as [number, number])} tone={tone} />
          <Points
            data={tri.map((p) => ({ x: p.x, y: p.y, tone: 'hi', r: 6 }))}
            labels={(i) => NAMES[i]}
            onDrag={(i, p, via) => {
              setTri(tri.map((q, k) => (k === i ? snapPoint(q, p, via) : q)));
              setPreset(null);
            }}
            pointLabel={(i) => `Point ${NAMES[i]}`}
            roving
          />
        </Plot2D>
      </div>
    </StageFrame>
  );
}
