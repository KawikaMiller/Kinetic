import { useMemo, useState, type ReactNode } from 'react';
import { Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { distinctLines, pairsCaption } from './captions';
import { PRESETS, hyperplaneBound, pairs, presetById, type LcgParams } from './lcg';
import { OPENING } from './opening';
import { SeedInput } from './SeedInput';

const MAX_COUNT = 5000;
const MIN_COUNT = 10;
const PLOT = { width: 356, height: 356 } as const;
const POINT_RADIUS = 1.8;
const UNIT = { domain: [0, 1] as [number, number], ticks: 4 };

/** `count` consecutive pairs of real random 32-bit values, scaled into the unit square. */
function realPairs(count: number): { x: number; y: number }[] {
  const raw = new Uint32Array(count + 1);
  crypto.getRandomValues(raw);
  return Array.from({ length: count }, (_, i) => ({ x: raw[i] / 2 ** 32, y: raw[i + 1] / 2 ** 32 }));
}


/** Scene 1: consecutive pairs of a toy generator fall on lines; the same plot from the real source is a cloud. */
export function PairsScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState(OPENING.pairs.preset);
  const [seed, setSeed] = useState(OPENING.pairs.seed);
  const [count, setCount] = useState(OPENING.pairs.count);
  const [real, setReal] = useState(() => realPairs(MAX_COUNT));
  const p = presetById(id);
  const mine = useMemo(() => pairs(p, seed, count), [p, seed, count]);
  const lines = distinctLines(p, seed, count);

  return (
    <StageFrame
      height={780}
      intro={pairsCaption(p, seed, count)}
      introKey={`${id}|${seed}|${count}`}
      stats={
        <Stats>
          <Stat label="Lines the pairs lie on" value={integer(lines)} color={lines <= 12 ? 'var(--bad)' : undefined} sub="distinct, counted from the points" />
          <Stat label="Marsaglia's bound" value={integer(hyperplaneBound(2, p.m))} sub="at most this many lines for pairs, m = modulus" />
          <Stat label="Pairs drawn" value={integer(count)} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'toy generator: structure shows', shape: 'dot' }, { color: 'var(--info)', label: 'a generator whose lines are too fine to see', shape: 'dot' }, { color: 'var(--ok)', label: 'crypto.getRandomValues', shape: 'dot' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Generator" value={id} options={PRESETS.map((x) => ({ value: x.id, label: x.label }))} onChange={setId} />
        </>,
        <>
          <SeedInput seed={seed} onSeed={setSeed} />
          <Slider label="Pairs" value={count} min={MIN_COUNT} max={MAX_COUNT} step={10} onChange={setCount} format={integer} />
          <Button onClick={() => setReal(realPairs(MAX_COUNT))}>Draw the real cloud again</Button>
        </>,
      ]}
    >
      <div className="rn-stage stage-pad">
        <p className="rn-note">{p.text}.</p>
        <div className="rn-plots">
          <figure className="rn-figure">
            <figcaption>The toy generator: x(n) against x(n+1)</figcaption>
            <Plot2D x={{ ...UNIT, label: 'x(n)' }} y={{ ...UNIT, label: 'x(n+1)' }} width={PLOT.width} height={PLOT.height} ariaLabel={`Consecutive pairs of the ${p.label} generator`}>
              <Points data={mine} r={POINT_RADIUS} tone={lines <= 12 ? 'bad' : 'info'} />
            </Plot2D>
          </figure>
          <figure className="rn-figure">
            <figcaption>The real source: crypto.getRandomValues</figcaption>
            <Plot2D x={{ ...UNIT, label: 'value(n)' }} y={{ ...UNIT, label: 'value(n+1)' }} width={PLOT.width} height={PLOT.height} ariaLabel="Consecutive pairs of real random values">
              <Points data={real.slice(0, count)} r={POINT_RADIUS} tone="ok" />
            </Plot2D>
          </figure>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">linear congruential generators built for this page; nothing here is run on Math.random output, a token or a session id</Provenance>
        <Provenance kind="real">real random bytes: the right-hand plot differs on every load</Provenance>
        <Provenance kind="from-memory">the Park-Miller multiplier 16807 and modulus 2^31 - 1, and Marsaglia's bound on hyperplanes; check the original papers</Provenance>
        <ClaimLabel kind="research">Marsaglia, 1968, "Random numbers fall mainly in the planes", quoted from memory</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
