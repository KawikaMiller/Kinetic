import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { flightText, fragmentText, pipelineCaption } from './captions';
import { MESH_IDS, meshOf } from './mesh';
import { GRID } from './render';
import { STAGES, TURN_RANGE, analyse, initialPipeline, lastTriangle, withMesh, withStage, type Analysis, type PipelineState, type StageId } from './stages';

const TABLE_MIN_WIDTH = 340;
const MESH_OPTIONS = MESH_IDS.map((id) => ({ value: id, label: id }));
const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the stage running now', shape: 'square' },
      { color: 'var(--ok)', label: 'a stage already passed, and a fragment that passed the depth test', shape: 'square' },
      { color: 'var(--info)', label: 'data in flight between stages', shape: 'square' },
      { color: 'var(--dim)', label: 'a fragment that failed the depth test', shape: 'square' },
      { color: 'var(--amber)', label: 'vertex-shader lane', shape: 'dot' },
      { color: 'var(--pink)', label: 'fragment-shader lane', shape: 'dot' },
    ]}
  />
);

const n2 = (v: number) => decimal(v, 2);
const EMPTY: GridCellSpec = { tone: 'dim', fill: 'none' };

/** The tone of one grid cell at a given stage. */
function cellFor(stage: StageId, a: Analysis, slot: number, vertexSlots: ReadonlySet<number>): GridCellSpec {
  const tested = a.tested.find((t) => t.fragment.y * GRID.w + t.fragment.x === slot);
  switch (stage) {
    case 'input':
    case 'vertex':
      return EMPTY;
    case 'primitive':
      return vertexSlots.has(slot) ? { tone: 'info', fill: 'solid' } : EMPTY;
    case 'raster':
      return tested ? { tone: 'info', fill: 'tint', intensity: 0.5 } : EMPTY;
    case 'fragment':
      return tested ? { tone: 'pink', fill: 'tint', intensity: 0.2 + 0.7 * tested.fragment.nl } : EMPTY;
    case 'depth':
      return tested ? (tested.passed ? { tone: 'ok', fill: 'tint', intensity: 0.6 } : { tone: 'dim', fill: 'outline' }) : EMPTY;
    case 'blend':
      return tested?.passed ? { tone: 'ok', fill: 'tint', intensity: 0.6 } : EMPTY;
    case 'framebuffer':
      if (a.onTopSlots.includes(slot)) return { tone: 'ok', fill: 'solid' };
      return a.drawnSlots.includes(slot) ? { tone: 'muted', fill: 'tint', intensity: 0.4 } : EMPTY;
  }
}

function StageTable({ stage, s, a }: { stage: StageId; s: PipelineState; a: Analysis }) {
  const m = meshOf(s.mesh);
  if (stage === 'input') {
    return (
      <table className="data-table gp-table">
        <thead><tr><th>Index</th><th>Position</th><th>u, v</th><th>Normal</th></tr></thead>
        <tbody>
          {a.indices.map((idx) => (
            <tr key={idx}>
              <td>{idx}</td>
              <td>{`(${m.vertices[idx].pos.map(n2).join(', ')})`}</td>
              <td>{`${n2(m.vertices[idx].uv[0])}, ${n2(m.vertices[idx].uv[1])}`}</td>
              <td>{`(${m.vertices[idx].normal.map(n2).join(', ')})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (stage === 'vertex') {
    return (
      <table className="data-table gp-table">
        <thead><tr><th>Index</th><th>Clip (x, y, z, w)</th><th>Passed on</th></tr></thead>
        <tbody>
          {a.assembled.outs.map((o, i) => (
            <tr key={a.indices[i]}>
              <td>{a.indices[i]}</td>
              <td>{`(${o.clip.map(n2).join(', ')})`}</td>
              <td>{`u ${n2(o.attrs[0])}, v ${n2(o.attrs[1])}, normal (${o.attrs.slice(2).map(n2).join(', ')})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (stage === 'primitive') {
    return (
      <table className="data-table gp-table">
        <thead><tr><th>Piece</th><th>Pixel x, y</th><th>Depth</th></tr></thead>
        <tbody>
          {a.assembled.pieces.flatMap((piece, p) => piece.map((v, k) => (
            <tr key={`${p}-${k}`}><td>{`${p + 1}.${k + 1}`}</td><td>{`${n2(v.x)}, ${n2(v.y)}`}</td><td>{decimal(v.z, 4)}</td></tr>
          )))}
        </tbody>
      </table>
    );
  }
  const picked = s.picked === null ? undefined : a.tested.find((t) => t.fragment.y * GRID.w + t.fragment.x === s.picked);
  return (
    <p className="hint is-muted">
      {picked
        ? fragmentText(picked.fragment, picked.passed)
        : 'Click a cell, or focus the grid and press Enter, to read the interpolated attributes of that fragment.'}
    </p>
  );
}

export function PipelineScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<PipelineState>(initialPipeline);
  const { mesh, turnDeg, triangle } = s;
  /** The stage and the picked cell do not change the analysis, so it is keyed on the three controls that do. */
  const a = useMemo(() => analyse({ mesh, turnDeg, triangle, stage: 0, picked: null }), [mesh, turnDeg, triangle]);
  const stage = STAGES[s.stage];
  const vertexSlots = useMemo(
    () => new Set(a.assembled.pieces.flat().filter((v) => v.x >= 0 && v.y >= 0 && v.x < GRID.w && v.y < GRID.h).map((v) => Math.floor(v.y) * GRID.w + Math.floor(v.x))),
    [a],
  );
  const caption = pipelineCaption(s, a);
  const total = lastTriangle(s.mesh) + 1;
  return (
    <StageFrame
      height={560}
      legend={LEGEND}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Fragments from this triangle" value={a.fragments.length} sub="from rasterisation" color="var(--info)" />
          <Stat label="Passed the depth test" value={a.passed} sub={`of ${a.fragments.length}`} color={a.passed > 0 ? 'var(--ok)' : undefined} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Mesh" value={s.mesh} onChange={(mesh) => setS((c) => withMesh(c, mesh))} options={MESH_OPTIONS} />
          <Slider label="Triangle" value={s.triangle + 1} min={1} max={total} format={(v) => `${v} of ${total}`} onChange={(v) => setS((c) => ({ ...c, triangle: v - 1, picked: null }))} />
          <Slider label="Turn about y" value={s.turnDeg} min={TURN_RANGE.min} max={TURN_RANGE.max} step={TURN_RANGE.step} format={(v) => `${v}°`} onChange={(turnDeg) => setS((c) => ({ ...c, turnDeg, picked: null }))} />
        </>,
        <>
          <Button softDisabled={s.stage === 0} onClick={() => setS((c) => withStage(c, c.stage - 1))}>Previous stage</Button>
          <Button variant="primary" softDisabled={s.stage === STAGES.length - 1} onClick={() => setS((c) => withStage(c, c.stage + 1))}>Next stage</Button>
          <Button onClick={() => setS(initialPipeline())}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <div className="gp-row">
          <ol className="gp-stages" aria-label="Pipeline stages">
            {STAGES.map((st, i) => {
              const state = i < s.stage ? 'done' : i === s.stage ? 'now' : 'next';
              return (
                <li key={st.id} className="gp-stage-item">
                  <button type="button" className={`gp-stage-btn is-${state}`} aria-current={state === 'now' ? 'step' : undefined} onClick={() => setS((c) => withStage(c, i))}>
                    <span className="gp-tick" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
                    {st.lane && <i className="gp-lane" style={{ background: `var(--${st.lane})` }} aria-hidden="true" />}
                    <span>{st.label}</span>
                  </button>
                  {i === s.stage && i < STAGES.length - 1 && <span className="gp-flight">{`→ ${flightText(a, i)}`}</span>}
                </li>
              );
            })}
          </ol>
          <div className="gp-col">
            <Box>
              <SectionTitle hint={`${GRID.w} by ${GRID.h} pixels, ${stage.label.toLowerCase()}`}>The triangle on the pixel grid</SectionTitle>
              <CellGrid
                rows={GRID.h}
                cols={GRID.w}
                size={{ cell: 14, gap: 1 }}
                cell={(r, c) => cellFor(stage.id, a, r * GRID.w + c, vertexSlots)}
                onCellClick={(r, c) => setS((cur) => ({ ...cur, picked: r * GRID.w + c }))}
                cellAriaLabel={(r, c) => `Pixel ${c}, ${r}`}
                highlight={s.picked === null ? [] : [{ r: Math.floor(s.picked / GRID.w), c: s.picked % GRID.w, tone: 'hi' }]}
                ariaLabel="Fragment grid"
              />
            </Box>
            <WideRegion minWidth={TABLE_MIN_WIDTH} label="Stage data: scroll sideways to see all of it" hint="swipe to see the whole table">
              <StageTable stage={stage.id} s={s} a={a} />
            </WideRegion>
          </div>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">a teaching pipeline in software on a canvas; real GPUs add tiling, hierarchical depth tests and massive parallelism</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
