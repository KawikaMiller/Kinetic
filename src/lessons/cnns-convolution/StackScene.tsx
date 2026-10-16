import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { stackCaption } from './captions';
import { stackOpening } from './openings';
import {
  INPUT_SIZE, LAYER_SPEC, MAX_LAYERS, canAdd, describeStack, reachedByPerturbation, reachedByRecurrence, receptiveBox, stackInput, stackKernels,
  type LayerKind,
} from './stack';

type Mode = 'field' | 'pixel';
const MODES: { value: Mode; label: string }[] = [
  { value: 'field', label: 'Pick an output cell' },
  { value: 'pixel', label: 'Change one input pixel' },
];
const INPUT = stackInput();

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function StackScene({ picker }: { picker: ReactNode }) {
  const open = stackOpening();
  const [layers, setLayers] = useState<LayerKind[]>(open.layers);
  const [mode, setMode] = useState<Mode>(open.mode);
  const [output, setOutput] = useState<[number, number]>(open.output);
  const [pixel, setPixel] = useState<[number, number]>(open.pixel);

  const rows = useMemo(() => describeStack(layers), [layers]);
  const last = rows.at(-1);
  const side = last?.side ?? INPUT_SIZE;
  const [outRow, outCol] = [Math.min(output[0], side - 1), Math.min(output[1], side - 1)];
  const box = receptiveBox(layers, outRow, outCol);
  const kernels = useMemo(() => stackKernels(layers), [layers]);
  const predicted = useMemo(() => reachedByRecurrence(layers, pixel[0], pixel[1]), [layers, pixel]);
  const moved = useMemo(() => reachedByPerturbation(layers, kernels, INPUT, pixel[0], pixel[1]), [layers, kernels, pixel]);
  const agree = sameSet(predicted, moved);

  const add = (kind: LayerKind) => {
    if (canAdd(layers, kind)) setLayers([...layers, kind]);
  };

  return (
    <StageFrame
      height={520}
      intro={stackCaption(layers, rows, mode, mode === 'pixel' ? agree : null)}
      introKey={[layers, mode, agree]}
      stats={
        <Stats>
          <Stat label="Receptive field" value={last ? `${last.field} x ${last.field}` : '1 x 1'} sub="r_out = r_in + (k − 1) · jump" />
          <Stat label="Output" value={`${side} x ${side}`} sub={`${layers.length} of ${MAX_LAYERS} layers`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'receptive field of the picked cell', shape: 'square' },
            { color: 'var(--hi)', label: 'the changed pixel, and the outputs that moved', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Look at" options={MODES} value={mode} onChange={setMode} />
        </>,
        <>
          <Button softDisabled={!canAdd(layers, 'conv')} onClick={() => add('conv')}>Add conv 3 x 3</Button>
          <Button softDisabled={!canAdd(layers, 'pool')} onClick={() => add('pool')}>Add pool 2 x 2</Button>
          <Button softDisabled={layers.length === 0} onClick={() => setLayers(layers.slice(0, -1))}>Remove last</Button>
          <Button onClick={() => setLayers(stackOpening().layers)}>Reset</Button>
        </>,
      ]}
    >
      <div className="cn-stage stage-pad">
        <div className="cn-row">
          <figure className="cn-figure">
            <figcaption>Input {INPUT_SIZE} x {INPUT_SIZE}{mode === 'pixel' ? ': click a pixel to change it' : ''}</figcaption>
            <CellGrid
              rows={INPUT_SIZE}
              cols={INPUT_SIZE}
              size="sm"
              ariaLabel="Input pixels"
              onCellClick={mode === 'pixel' ? (r, c) => setPixel([r, c]) : undefined}
              cell={(r, c) => {
                if (mode === 'pixel' && r === pixel[0] && c === pixel[1]) return { tone: 'hi', fill: 'solid' };
                const inBox = mode === 'field' && r >= box.top && r < box.top + box.size && c >= box.left && c < box.left + box.size;
                if (inBox) return { tone: 'violet', fill: 'tint', intensity: 0.45 };
                return { tone: 'muted', fill: 'tint', intensity: INPUT[r][c] * 0.4 };
              }}
            />
          </figure>
          <figure className="cn-figure">
            <figcaption>Output {side} x {side}{mode === 'field' ? ': click a cell' : ''}</figcaption>
            <CellGrid
              rows={side}
              cols={side}
              size="md"
              ariaLabel="Output cells"
              onCellClick={mode === 'field' ? (r, c) => setOutput([r, c]) : undefined}
              cell={(r, c) => {
                if (mode === 'field') return r === outRow && c === outCol ? { tone: 'violet', fill: 'solid' } : { tone: 'muted', fill: 'outline' };
                return moved.has(`${r},${c}`) ? { tone: 'hi', fill: 'tint', intensity: 0.6 } : { tone: 'dim', fill: 'outline' };
              }}
            />
          </figure>
        </div>
        <table className="data-table cn-layers">
          <caption className="sr-only">Layers, output side and receptive field</caption>
          <thead>
            <tr><th>layer</th><th>output</th><th>field</th><th>jump</th></tr>
          </thead>
          <tbody>
            <tr><td>input</td><td>{INPUT_SIZE} x {INPUT_SIZE}</td><td>1</td><td>1</td></tr>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{LAYER_SPEC[r.kind].label}</td>
                <td>{r.side} x {r.side}</td>
                <td>{r.field}</td>
                <td>{r.jump}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="cn-closing">
          <ClaimLabel kind="research">
            Edges, then textures, then object parts is reported for large trained vision networks in published visualisations (Zeiler and Fergus, 2014: from memory, verify). This toy does not show it.
          </ClaimLabel>
        </div>
        <ProvenanceRow>
          <Provenance kind="real">receptive fields from the recurrence; the perturbation test really runs the stack twice</Provenance>
          <Provenance kind="toy">seeded positive kernels, a seeded 16 x 16 input; nothing here is trained</Provenance>
          <Provenance kind="from-memory">the hierarchy of features in large networks</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
