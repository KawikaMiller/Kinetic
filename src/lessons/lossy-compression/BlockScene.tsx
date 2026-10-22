import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { paintPixels } from './paint';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import {
  BASIS_SIDE, SIZE, SOURCES, analyseBlock, basisGrid, chooseSource, initialBlock, paintCell, toggleCoefficient, type BlockState, type SourceId,
} from './blocks';
import { blockCaption, dB } from './captions';

const BASIS_SCALE = 4;
const CELL = { cell: 34, gap: 3 };
const MAX_GREY = 255;
const ERROR_FULL = 32;
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--amber)', label: 'the DC coefficient (the average)', shape: 'square' },
      { color: 'var(--hi)', label: 'a coefficient, stronger when larger', shape: 'square' },
      { color: 'var(--dim)', label: 'a coefficient you zeroed', shape: 'square' },
      { color: 'var(--bad)', label: 'a pixel that changed, stronger when further off', shape: 'square' },
      { color: 'var(--ok)', label: 'a pixel that is exactly right', shape: 'square' },
    ]}
  />
);
const SOURCE_OPTIONS = SOURCES.map((s) => ({ value: s.value, label: s.label }));

export function BlockScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<BlockState>(initialBlock);
  const r = useMemo(() => analyseBlock(s), [s]);
  const basis = useMemo(() => {
    const g = basisGrid();
    return paintPixels(BASIS_SIDE, BASIS_SIDE, (i) => {
      const v = g[Math.floor(i / BASIS_SIDE)][i % BASIS_SIDE];
      return v < 0 ? [0.07, 0.08, 0.11] : [v, v, v];
    }, BASIS_SCALE);
  }, []);
  const peak = Math.max(...r.coeffs.flat().map((v) => Math.abs(v)), 1);
  const caption = blockCaption(s);
  const pixel = (v: number): GridCellSpec => ({ text: v, tone: 'muted', fill: 'tint', intensity: 0.1 + 0.6 * (v / MAX_GREY) });
  return (
    <StageFrame
      height={760}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Coefficients holding 90% of the energy" value={`${r.holding90} of 64`} />
          <Stat label="Energy kept" value={pct(r.keptEnergy)} sub="Parseval: the transform keeps energy" />
          <Stat label="PSNR" value={dB(r.psnr)} sub={`MSE ${r.mse.toFixed(2)}`} color={r.mse === 0 ? 'var(--ok)' : 'var(--bad)'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Block" value={s.source} onChange={(source: SourceId) => setS((c) => chooseSource(c, source))} options={SOURCE_OPTIONS} />
        </>,
        <>
          <Button softDisabled={!s.zeroed.some(Boolean)} onClick={() => setS((c) => ({ ...c, zeroed: c.zeroed.map(() => false) }))}>Restore all coefficients</Button>
          <Button onClick={() => setS(initialBlock())}>Reset</Button>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <div className="lc-row">
          <div className="lc-col">
            <Box>
              <SectionTitle hint="click a pixel to cycle its brightness in steps of 32">The block (grey levels)</SectionTitle>
              <CellGrid rows={SIZE} cols={SIZE} size={CELL} cell={(y, x) => pixel(r.block[y][x])} onCellClick={(y, x) => setS((c) => paintCell(c.source === 'painted' ? c : chooseSource(c, 'painted'), y, x))} cellAriaLabel={(y, x) => `Pixel row ${y + 1}, column ${x + 1}, level ${r.block[y][x]}`} ariaLabel="The 8 by 8 block of grey levels" />
            </Box>
          </div>
          <div className="lc-col">
            <Box>
              <SectionTitle hint="after subtracting 128 and the 2D DCT; click one to zero it">The coefficients</SectionTitle>
              <CellGrid
                rows={SIZE}
                cols={SIZE}
                size={CELL}
                cell={(u, v): GridCellSpec => {
                  const c = r.coeffs[u][v];
                  if (s.zeroed[u * SIZE + v]) return { text: Math.round(c), tone: 'dim', fill: 'none' };
                  if (u === 0 && v === 0) return { text: Math.round(c), tone: 'amber', fill: 'tint', intensity: 0.5 };
                  return { text: Math.round(c), tone: 'hi', fill: 'tint', intensity: 0.08 + 0.8 * (Math.abs(c) / peak) };
                }}
                onCellClick={(u, v) => setS((c) => toggleCoefficient(c, u, v))}
                cellAriaLabel={(u, v) => `Coefficient row ${u + 1}, column ${v + 1}, ${Math.round(r.coeffs[u][v])}, ${s.zeroed[u * SIZE + v] ? 'zeroed' : 'kept'}`}
                ariaLabel="The 8 by 8 DCT coefficients"
              />
            </Box>
          </div>
          <div className="lc-col">
            <Box>
              <SectionTitle hint="inverse DCT, add 128, round and clamp">The reconstruction</SectionTitle>
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
          <div className="lc-col">
            <Box>
              <SectionTitle hint="row u, column v: the pattern each coefficient weighs">The 64 basis patterns</SectionTitle>
              {basis && <img className="lc-img" src={basis} width={BASIS_SIDE * BASIS_SCALE} height={BASIS_SIDE * BASIS_SCALE} alt="The 64 DCT basis patterns, low frequencies at the top left" />}
            </Box>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="real">computed with the lesson's DCT-II, orthonormal so it keeps energy</Provenance>
          <Provenance kind="from-memory">the textbook block is recalled from the English Wikipedia JPEG article; check the values there</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
