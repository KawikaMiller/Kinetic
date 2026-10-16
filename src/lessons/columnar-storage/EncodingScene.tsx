import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, decimal, plural } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { plainTone } from '../../core/tone';
import { encodingCaption } from './captions';
import { ENCODING_LABELS, FIELD_BITS, RUN_COUNT_BITS, codeWidth, decode, encodingsFor, sizeReport, type Encoded } from './encode';
import { ENCODING_OPTIONS, initialEncodingScene } from './init';
import { COLUMNS, DEFAULT_TABLE, SORT_KEYS, columnOf, sortRows, type Cell, type Column } from './table';

const showText = (v: Cell) => String(v);
const signed = (z: number) => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);

function EncodedForm({ e }: { e: Encoded }) {
  switch (e.kind) {
    case 'none':
      return <p className="cs-form">{plural(e.values.length, 'value')} of {FIELD_BITS} bits each, as they are.</p>;
    case 'rle':
      return (
        <p className="cs-form">
          {e.runs.map((r, i) => (
            <span key={i} className={`cs-token tone-${plainTone(i)}`}>{showText(r.value)} x{r.count}</span>
          ))}
          <span className="cs-formnote"> each run is a {FIELD_BITS}-bit value and a {RUN_COUNT_BITS}-bit count</span>
        </p>
      );
    case 'dict':
      return (
        <p className="cs-form">
          {e.dict.map((v, i) => (
            <span key={i} className={`cs-token tone-${plainTone(i)}`}>{i} = {showText(v)}</span>
          ))}
          <span className="cs-formnote">
            {' '}
            then {e.codes.length} codes of {codeWidth(e.dict.length)} {codeWidth(e.dict.length) === 1 ? 'bit' : 'bits'}
            {codeWidth(e.dict.length) === 0 ? ': no bits needed, there is only one value' : ''}
          </span>
        </p>
      );
    case 'delta':
      return (
        <p className="cs-form">
          <span className="cs-token tone-amber">start {e.first === null ? 'none' : e.first}</span>
          {e.deltas.map((z, i) => (
            <span key={i} className="cs-token tone-sky">{signed(z) >= 0 ? '+' : ''}{signed(z)}</span>
          ))}
          <span className="cs-formnote"> each step in {e.width} {e.width === 1 ? 'bit' : 'bits'} (a sign bit is folded in; the widest step sets the width)</span>
        </p>
      );
  }
}

export function EncodingScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialEncodingScene);
  const { sort, picks, shown } = state;

  const rows = useMemo(() => sortRows(DEFAULT_TABLE, sort), [sort]);
  const reports = useMemo(
    () => Object.fromEntries(COLUMNS.map((c) => [c, sizeReport(columnOf(rows, c), picks[c])])) as Record<Column, ReturnType<typeof sizeReport>>,
    [rows, picks],
  );
  const raw = COLUMNS.reduce((n, c) => n + reports[c].before, 0);
  const stored = COLUMNS.reduce((n, c) => n + reports[c].after, 0);
  const rep = reports[shown];
  const values = columnOf(rows, shown);
  const decoded = rep.roundTrips;

  useIntroCaption(encodingCaption(shown, picks[shown], sort, rep.before, rep.after, rep.roundTrips, rep.encoded), [sort, picks, shown]);

  const firstSeen = [...new Set(values)];
  const shape = { rows: 1, cols: values.length, size: 'sm' as const };
  const frame = cellGridFrame(shape);
  const strip = (cells: Cell[], label: string) => (
    <WideRegion minWidth={minWidthForText(frame.width, frame.size.font)} label={`${label}: scroll sideways to see all of it`}>
      <CellGrid {...shape} cols={cells.length} cell={(_r, c) => ({ tone: plainTone(firstSeen.indexOf(cells[c])), fill: 'tint', intensity: 0.4, text: showText(cells[c]) })} ariaLabel={label} />
    </WideRegion>
  );

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label={`${shown} raw`} value={bytes(rep.before)} sub={`${values.length} values x 4 B`} />
          <Stat
            label={`${shown} stored`}
            value={bytes(rep.after)}
            color={rep.after < rep.before ? 'var(--ok)' : rep.after > rep.before ? 'var(--bad)' : undefined}
            sub={ENCODING_LABELS[picks[shown]].toLowerCase()}
          />
          <Stat label="Whole table" value={bytes(stored)} color={stored < raw ? 'var(--ok)' : stored > raw ? 'var(--bad)' : undefined} sub={`${bytes(raw)} raw, ${decimal(stored / raw, 2)} of it`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a distinct value or run (a hue each, repeating)', shape: 'square' },
            { color: 'var(--ok)', label: 'smaller than raw', shape: 'square' },
            { color: 'var(--bad)', label: 'bigger than raw', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Sort rows" value={sort} onChange={(s) => setState((st) => ({ ...st, sort: s }))} options={SORT_KEYS} />
          <Segmented label="Show column" value={shown} onChange={(c) => setState((st) => ({ ...st, shown: c }))} options={COLUMNS.map((c) => ({ value: c, label: c }))} />
        </>,
        <>
          <Segmented
            label={`Encode ${shown} as`}
            value={picks[shown]}
            onChange={(e) => setState((st) => ({ ...st, picks: { ...st.picks, [shown]: e } }))}
            options={ENCODING_OPTIONS.filter((o) => encodingsFor(shown).includes(o.value))}
          />
        </>,
      ]}
    >
      <div className="cs-stage stage-pad">
        <Box>
          <SectionTitle hint="press a column name to show it; each keeps its own encoding">Columns</SectionTitle>
          <div className="cs-scroll" role="region" aria-label="Each column, its encoding and its size" tabIndex={0}>
            <table className="data-table cs-table">
              <thead>
                <tr><th scope="col">Column</th><th scope="col">Encoding</th><th scope="col">Raw</th><th scope="col">Stored</th><th scope="col">Decodes back</th></tr>
              </thead>
              <tbody>
                {COLUMNS.map((c) => (
                  <tr key={c} className={c === shown ? 'cs-current' : ''}>
                    <th scope="row">
                      <button type="button" className="cs-colbtn" aria-pressed={c === shown} onClick={() => setState((st) => ({ ...st, shown: c }))}>{c}</button>
                    </th>
                    <td>{ENCODING_LABELS[picks[c]]}</td>
                    <td>{bytes(reports[c].before)}</td>
                    <td className={reports[c].after < reports[c].before ? 'cs-cheap' : reports[c].after > reports[c].before ? 'cs-dear' : ''}>{bytes(reports[c].after)}</td>
                    <td className={reports[c].roundTrips ? 'cs-cheap' : 'cs-dear'}>{reports[c].roundTrips ? 'yes' : 'NO'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`${shown}, ${sort === 'none' ? 'in insert order' : 'sorted'}`}>The column as stored</SectionTitle>
          {strip(values, `${shown} values in row order`)}
          <EncodedForm e={rep.encoded} />
          <p className="cs-note">Size rule: bits added up, then rounded up to whole bytes.</p>
        </Box>
        <Box>
          <SectionTitle hint="rebuilt from the encoded form alone">Decoded back</SectionTitle>
          {strip(decode(rep.encoded), `${shown} decoded`)}
          <p className={decoded ? 'cs-same' : 'cs-wrong'}>{decoded ? 'equal to the original, value for value' : 'NOT equal to the original'}</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">four fixed-size rules of this lesson (a 4-byte value, a 1-byte run count, a dictionary of whole values), not any file format</Provenance>
          <Provenance kind="illustrative">the 16-row table is made up; a real column holds millions of values, so its runs and dictionaries behave differently</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
