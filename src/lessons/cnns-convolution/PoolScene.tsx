import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { ImageGrid, MapGrid } from './MapGrid';
import { poolCaption } from './captions';
import { BAR_COLUMNS, KERNEL_SIZE, SHIFTS, barAt, convParams, shiftPresets, shiftReport } from './convolve';
import { poolOpening } from './openings';

const signedShift = (s: number) => (s > 0 ? `+${s}` : String(s));
const PRESETS = shiftPresets();

export function PoolScene({ picker }: { picker: ReactNode }) {
  const open = poolOpening();
  const [column, setColumn] = useState(open.column);
  const [shift, setShift] = useState(open.shift);
  const report = useMemo(() => shiftReport(barAt(column), shift), [column, shift]);
  const { original, shifted } = report;
  const cells = report.original.pooled.flat().length;

  const pick = (p: { column: number; shift: number }) => {
    setColumn(p.column);
    setShift(p.shift);
  };

  return (
    <StageFrame
      height={520}
      intro={poolCaption(report, column, shift)}
      introKey={[column, shift]}
      stats={
        <Stats>
          <Stat label="Feature map moved with the image" value={report.mapShifted ? 'yes' : 'no'} sub={shift === 0 ? 'no shift' : `every output whose source column exists`} />
          <Stat
            label="Pooled map"
            value={report.pooledChanged === 0 ? 'unchanged' : `${report.pooledChanged} of ${cells} cells changed`}
            color={report.pooledChanged === 0 ? 'var(--ok)' : 'var(--hi)'}
            sub="2 x 2 max pool, stride 2"
          />
          <Stat label="Numbers learned here" value={`${convParams(1, KERNEL_SIZE)} + 0`} sub="one 3 x 3 kernel and its bias; pooling learns none" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'positive response (ReLU keeps these)', shape: 'square' },
            { color: 'var(--dim)', label: 'zero', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Bar column" options={BAR_COLUMNS.map((c) => ({ value: c, label: String(c + 1) }))} value={column} onChange={setColumn} />
          <Segmented label="Shift right by" options={SHIFTS.map((s) => ({ value: s, label: signedShift(s) }))} value={shift} onChange={setShift} />
        </>,
        <>
          <ControlGroup label="Examples" inline>
            <ChipButton tone="ok" on={column === PRESETS.unchanged.column && shift === PRESETS.unchanged.shift} onClick={() => pick(PRESETS.unchanged)}>
              pooled map stays put
            </ChipButton>
            <ChipButton tone="hi" on={column === PRESETS.changed.column && shift === PRESETS.changed.shift} onClick={() => pick(PRESETS.changed)}>
              pooled map changes
            </ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="cn-stage stage-pad">
        <div className="cn-row">
          {[{ name: 'Original', view: original }, { name: `Shifted by ${signedShift(shift)}`, view: shifted }].map(({ name, view }) => (
            <section key={name} className="cn-column" aria-label={name}>
              <h3 className="section-title">{name}</h3>
              <figure className="cn-figure">
                <figcaption>Image</figcaption>
                <ImageGrid image={view.image} size="sm" ariaLabel={`${name}: image`} />
              </figure>
              <figure className="cn-figure">
                <figcaption>Feature map (vertical-edge kernel, ReLU)</figcaption>
                <MapGrid map={view.map} scale={4} size="sm" ariaLabel={`${name}: feature map`} />
              </figure>
              <figure className="cn-figure">
                <figcaption>After 2 x 2 max pool</figcaption>
                <MapGrid map={view.pooled} scale={4} size="md" ariaLabel={`${name}: pooled map`} />
              </figure>
            </section>
          ))}
        </div>
        <ProvenanceRow>
          <Provenance kind="real">feature maps and pooling computed here; the kernel is Sobel x, set by hand</Provenance>
          <Provenance kind="toy">one bar on an 8 x 8 picture</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
