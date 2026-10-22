import { useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { zigzagOrder } from '../../core/dct';
import { SIZE, SOURCES, DEFAULT_QUALITY, QUALITY, initialQuant, quantiseBlock, type QuantSource, type QuantState } from './blocks';
import { dB, quantCaption } from './captions';

const CELL = { cell: 34, gap: 3 };
const ERROR_FULL = 32;
const ORDER = zigzagOrder(SIZE);
const SOURCE_OPTIONS = SOURCES.filter((s) => s.value !== 'painted').map((s) => ({ value: s.value as QuantSource, label: s.label }));
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--amber)', label: 'the DC level', shape: 'square' },
      { color: 'var(--hi)', label: 'a non-zero level', shape: 'square' },
      { color: 'var(--dim)', label: 'a level that rounded to zero', shape: 'square' },
      { color: 'var(--info)', label: 'the zig-zag scan', shape: 'line' },
      { color: 'var(--bad)', label: 'a pixel that changed', shape: 'square' },
    ]}
  />
);

export function QuantScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<QuantState>(initialQuant);
  const r = quantiseBlock(s);
  const caption = quantCaption(s);
  return (
    <StageFrame
      height={760}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Non-zero levels" value={`${r.nonZero} of 64`} color={r.nonZero <= 1 ? 'var(--bad)' : undefined} />
          <Stat label="PSNR" value={dB(r.psnr)} sub={`MSE ${r.mse.toFixed(2)}, largest error ${r.maxError}`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Block" value={s.source} onChange={(source: QuantSource) => setS((c) => ({ ...c, source }))} options={SOURCE_OPTIONS} />
        </>,
        <>
          <Slider label="Quality" value={s.quality} min={QUALITY.min} max={QUALITY.max} step={QUALITY.step} onChange={(quality) => setS((c) => ({ ...c, quality }))} />
          <Button onClick={() => setS(initialQuant())}>Reset ({DEFAULT_QUALITY})</Button>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <div className="lc-row">
          <div className="lc-col">
            <Box>
              <SectionTitle hint="coefficient divided by the table entry and rounded">The quantised levels</SectionTitle>
              <CellGrid
                rows={SIZE}
                cols={SIZE}
                size={CELL}
                cell={(u, v): GridCellSpec => {
                  const l = r.levels[u][v];
                  if (l === 0) return { text: 0, tone: 'dim', fill: 'none' };
                  return { text: l, tone: u === 0 && v === 0 ? 'amber' : 'hi', fill: 'tint', intensity: 0.5 };
                }}
                overlay={(g) => (
                  <polyline
                    className="lc-zigzag"
                    points={ORDER.map(([u, v]) => `${g.center(u, v).x},${g.center(u, v).y}`).join(' ')}
                  />
                )}
                ariaLabel="The 8 by 8 quantised levels with the zig-zag scan drawn over them"
              />
            </Box>
          </div>
          <div className="lc-col">
            <Box>
              <SectionTitle hint="the standard luminance table scaled by quality">The table</SectionTitle>
              <CellGrid rows={SIZE} cols={SIZE} size={CELL} cell={(u, v): GridCellSpec => ({ text: r.table[u][v], tone: 'muted', fill: 'tint', intensity: 0.1 + r.table[u][v] / 400 })} ariaLabel="The 8 by 8 quantisation table" />
            </Box>
          </div>
          <div className="lc-col">
            <Box>
              <SectionTitle hint="dequantise, inverse DCT, round and clamp">The reconstruction</SectionTitle>
              <CellGrid
                rows={SIZE}
                cols={SIZE}
                size={CELL}
                cell={(y, x): GridCellSpec => {
                  const err = Math.abs(r.reconstructed[y][x] - r.block[y][x]);
                  return err === 0 ? { text: r.reconstructed[y][x], tone: 'ok', fill: 'tint', intensity: 0.2 } : { text: r.reconstructed[y][x], tone: 'bad', fill: 'tint', intensity: Math.min(1, 0.2 + err / ERROR_FULL) };
                }}
                ariaLabel="The reconstructed block"
              />
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="real">the transform, the division and the rounding are computed here</Provenance>
          <Provenance kind="from-memory">the table values (the T.81 Annex K example) and the quality rule (libjpeg's, including its integer division of 5000 by the quality) are as recalled from memory of its source; check them against the standard and the libjpeg source</Provenance>
          <Provenance kind="illustrative">baseline grey only: no chroma, no entropy coding of the levels</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
