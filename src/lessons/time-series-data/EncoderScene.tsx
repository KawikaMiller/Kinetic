import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, decimal } from '../../core/format';
import { encoderCaption } from './captions';
import { RAW_POINT_BYTES, bitsPerPoint, decode, encode, encodedBytes, ratioAgainstRaw } from './gorilla';
import { initialEncoderScene } from './init';
import { GAP_AT, patternSeries, type TimestampPattern, type ValuePattern } from './series';

const TS: { value: TimestampPattern; label: string }[] = [
  { value: 'regular', label: 'Regular, every 10 s' },
  { value: 'jittery', label: 'Jittery (a few seconds either way)' },
  { value: 'gap', label: 'A gap of over an hour' },
];
const VS: { value: ValuePattern; label: string }[] = [
  { value: 'constant', label: 'Constant' },
  { value: 'drifting', label: 'Slowly drifting' },
  { value: 'noisy', label: 'Noisy floats' },
];
const SHOWN_POINTS = 5;

export function EncoderScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialEncoderScene);
  const { ts, vs } = state;

  const series = useMemo(() => patternSeries(ts, vs), [ts, vs]);
  const enc = useMemo(() => encode(series), [series]);
  const roundTrips = useMemo(() => {
    const back = decode(enc.bits, series.length);
    return back.length === series.length && back.every((p, i) => p.t === series[i].t && Object.is(p.v, series[i].v));
  }, [enc, series]);
  const each = bitsPerPoint(enc);
  const ratio = ratioAgainstRaw(enc);
  const curve = useMemo(() => enc.perPoint.map((b, i): [number, number] => [i, b]), [enc]);
  const shown = [...Array(SHOWN_POINTS).keys(), ...(ts === 'gap' ? [GAP_AT] : [])];

  useIntroCaption(encoderCaption(ts, vs, each, ratio, series.length, roundTrips), [ts, vs]);

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Bits a point" value={decimal(each, 1)} color={each < 8 ? 'var(--ok)' : each > 40 ? 'var(--bad)' : undefined} sub={`against ${RAW_POINT_BYTES * 8} raw`} />
          <Stat label="Size" value={bytes(encodedBytes(enc))} sub={`${bytes(series.length * RAW_POINT_BYTES)} raw`} />
          <Stat label="Smaller by" value={`${decimal(ratio, 1)}×`} color={ratio > 1 ? 'var(--ok)' : 'var(--bad)'} sub={roundTrips ? 'decodes back exactly' : 'does NOT decode back'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'timestamp bits (delta of delta)', shape: 'square' },
            { color: 'var(--sky)', label: 'value bits (XOR with the previous value)', shape: 'square' },
            { color: 'var(--info)', label: 'bits each point took', shape: 'line' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Segmented label="Timestamps" value={ts} onChange={(t) => setState((s) => ({ ...s, ts: t }))} options={TS} />
          <Segmented label="Values" value={vs} onChange={(v) => setState((s) => ({ ...s, vs: v }))} options={VS} />
        </>
      }
    >
      <div className="ts-stage stage-pad">
        <Box>
          <SectionTitle hint="the first points carry full values; the rest are small">Bits for each point</SectionTitle>
          <Plot2D x={{ domain: [0, series.length - 1], label: 'point number' }} y={{ domain: [0, Math.max(...enc.perPoint) + 5], label: 'bits' }} ariaLabel="Bits each point took when encoded">
            <Curve points={curve} tone="info" />
          </Plot2D>
        </Box>
        <Box>
          <SectionTitle hint="the encoded bits, point by point">Some points as bits</SectionTitle>
          <div className="ts-points">
            {shown.map((i) => (
              <div key={i} className="ts-point">
                <b>point {i + 1}</b> <span className="ts-count">{enc.perPoint[i]} bits</span>
                {enc.segments[i].map((s, k) => (
                  <span key={k} className={`ts-bits ${s.label === 'value' ? 'is-value' : 'is-time'}`} title={s.label}>
                    {s.bits.length > 72 ? `${s.bits.slice(0, 72)}…` : s.bits}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">a real encoder and decoder run in your browser: the round trip is checked bit for bit</Provenance>
          <Provenance kind="from-memory">the scheme follows the Gorilla paper (Pelkonen et al., VLDB 2015) as remembered; verify the exact bit windows and control codes against it. Other systems differ in the details</Provenance>
          <Provenance kind="simulated">seeded demo series, not one product&rsquo;s format or real metrics</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
