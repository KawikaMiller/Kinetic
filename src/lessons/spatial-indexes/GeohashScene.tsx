import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Plot2D, PointerLayer, Points, Polygon } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { plural } from '../../core/format';
import { BOUNDARY_A, BOUNDARY_PRECISION, geoView } from './geoScene';
import {
  BITS_PER_CHAR, BASE32, LAT_RANGE, LON_RANGE, MAX_PRECISION, MIN_PRECISION, bitSteps, boundsAfterBits, cellSize, formatLength, parseLatitude, parseLongitude, widthKmAt, type Bounds,
} from './geohash';
import { openingState } from './opening';

const OPEN = openingState().geohash;
type Preset = 'vector' | 'spain' | 'boundary';
const PRESETS: { id: Preset; label: string; lat: number; lon: number; precision: number }[] = [
  { id: 'vector', label: '57.64911, 10.40744', lat: 57.64911, lon: 10.40744, precision: 5 },
  { id: 'spain', label: '42.6, -5.6', lat: 42.6, lon: -5.6, precision: 5 },
  { id: 'boundary', label: 'Equator and meridian', lat: BOUNDARY_A.lat, lon: BOUNDARY_A.lon, precision: BOUNDARY_PRECISION },
];
const WORLD_X = { domain: [LON_RANGE.min, LON_RANGE.max] as [number, number], label: 'longitude' };
const WORLD_Y = { domain: [LAT_RANGE.min, LAT_RANGE.max] as [number, number], label: 'latitude' };
const BIT_CELL_MAX = 30;
const ZOOM_CELLS = 1;

const box = (b: Bounds): [number, number][] => [[b.lonMin, b.latMin], [b.lonMax, b.latMin], [b.lonMax, b.latMax], [b.lonMin, b.latMax]];
const decimals = (span: number) => Math.max(0, Math.ceil(-Math.log10(span)) + 1);

/** Scene 4: a geohash built by bisecting longitude and latitude in turn, and the boundary it cannot see across. */
export function GeohashScene({ picker }: { picker: ReactNode }) {
  const [latText, setLatText] = useState(String(OPEN.lat));
  const [lonText, setLonText] = useState(String(OPEN.lon));
  const [at, setAt] = useState({ lat: OPEN.lat, lon: OPEN.lon });
  const [precision, setPrecision] = useState(OPEN.precision);
  const [withNeighbours, setWithNeighbours] = useState(OPEN.neighbours);
  const [preset, setPreset] = useState<Preset | null>(OPEN.preset);
  const [upTo, setUpTo] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const totalBits = precision * BITS_PER_CHAR;
  const bitsShown = Math.min(upTo ?? totalBits, totalBits);
  const view = useMemo(() => geoView(at, precision, withNeighbours, preset === 'boundary'), [at, precision, withNeighbours, preset]);
  const steps = useMemo(() => bitSteps(at.lat, at.lon, precision), [at, precision]);
  const shownCell = boundsAfterBits(at.lat, at.lon, bitsShown);
  const size = cellSize(precision);
  const missed = view.others.filter((o) => o.state === 'missed').length;
  const found = view.others.filter((o) => o.state === 'found').length;
  const last = bitsShown > 0 ? steps[bitsShown - 1] : null;

  const type = (which: 'lat' | 'lon', text: string) => {
    const other = which === 'lat' ? parseLongitude(lonText) : parseLatitude(latText);
    const mine = (which === 'lat' ? parseLatitude : parseLongitude)(text);
    if (which === 'lat') setLatText(text);
    else setLonText(text);
    if (!mine.ok) {
      setNote(mine.error);
      return;
    }
    setNote(null);
    setPreset(null);
    if (other.ok) setAt(which === 'lat' ? { lat: mine.value, lon: other.value } : { lat: other.value, lon: mine.value });
  };
  const loadPreset = (p: (typeof PRESETS)[number]) => {
    setPreset(p.id);
    setLatText(String(p.lat));
    setLonText(String(p.lon));
    setAt({ lat: p.lat, lon: p.lon });
    setPrecision(p.precision);
    setWithNeighbours(false);
    setUpTo(null);
    setNote(null);
  };
  const pick = (p: readonly [number, number]) => {
    const lat = Math.round(p[1] * 1e4) / 1e4;
    const lon = Math.round(p[0] * 1e4) / 1e4;
    setLatText(String(lat));
    setLonText(String(lon));
    setAt({ lat, lon });
    setPreset(null);
    setNote(null);
  };

  const zx = { lo: Math.max(LON_RANGE.min, view.cell.lonMin - ZOOM_CELLS * (view.cell.lonMax - view.cell.lonMin)), hi: Math.min(LON_RANGE.max, view.cell.lonMax + ZOOM_CELLS * (view.cell.lonMax - view.cell.lonMin)) };
  const zy = { lo: Math.max(LAT_RANGE.min, view.cell.latMin - ZOOM_CELLS * (view.cell.latMax - view.cell.latMin)), hi: Math.min(LAT_RANGE.max, view.cell.latMax + ZOOM_CELLS * (view.cell.latMax - view.cell.latMin)) };
  const zoomX = { domain: [zx.lo, zx.hi] as [number, number], label: 'longitude', ticks: 3, format: (v: number) => v.toFixed(decimals(zx.hi - zx.lo)) };
  const zoomY = { domain: [zy.lo, zy.hi] as [number, number], label: 'latitude', ticks: 3, format: (v: number) => v.toFixed(decimals(zy.hi - zy.lo)) };

  const widthHere = widthKmAt(precision, at.lat);
  const intro = (
    <>
      {`(${at.lat}, ${at.lon})`} at {plural(precision, 'character')} is {view.code}: {totalBits} bits, longitude first, each bit halving one interval. The cell is {formatLength(size.widthKm)} wide and {formatLength(size.heightKm)} tall at the equator
      {view.nearest ? <>; the nearest other point shares {plural(view.nearest.shared, 'leading character')} with it.</> : '.'}
      {preset === 'boundary' ? (withNeighbours ? ` Searching the eight neighbouring cells as well finds all ${found} near points.` : ` The pair a few metres apart share no prefix: ${missed} near ${missed === 1 ? 'point is' : 'points are'} missed.`) : ''}
    </>
  );

  return (
    <StageFrame
      height={460}
      intro={intro}
      introKey={[view, bitsShown]}
      stats={
        <Stats>
          <Stat label="Geohash" value={<span className="si-code">{view.code}</span>} sub={`${totalBits} bits = ${plural(precision, 'character')} x ${BITS_PER_CHAR}`} />
          <Stat label="Cell size" value={`${formatLength(size.widthKm)} x ${formatLength(size.heightKm)}`} sub={`at the equator; ${formatLength(widthHere)} wide at latitude ${Math.round(at.lat)}`} />
          <Stat label="Near points missed" value={found + missed > 0 ? missed : '–'} color={missed ? 'var(--bad)' : undefined} sub={withNeighbours ? 'searching the 9 cells' : 'searching one cell'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'your point and its cell', shape: 'square' },
            { color: 'var(--info)', label: 'neighbour cells searched', shape: 'square' },
            { color: 'var(--ok)', label: 'near point found', shape: 'dot' },
            { color: 'var(--bad)', label: 'near point missed (ring)', shape: 'dot' },
            { color: 'var(--info)', label: 'searched but not near', shape: 'dot' },
            { color: 'var(--sky)', label: 'longitude bit', shape: 'square' },
            { color: 'var(--amber)', label: 'latitude bit', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Precision" value={precision} min={MIN_PRECISION} max={MAX_PRECISION} onChange={(v) => { setPrecision(v); setUpTo(null); setPreset((p) => (p === 'boundary' ? p : null)); }} format={(v) => `${v} characters`} />
          <Slider label="Bits shown" value={bitsShown} min={0} max={totalBits} onChange={setUpTo} format={(v) => `${v} of ${totalBits}`} />
          <Toggle label="Search" value={withNeighbours} onChange={setWithNeighbours} off="Own cell only" on="Plus 8 neighbours" />
        </>,
        <>
          <TextField label="Latitude" value={latText} onChange={(t) => type('lat', t)} width={110} spellCheck={false} />
          <TextField label="Longitude" value={lonText} onChange={(t) => type('lon', t)} width={110} spellCheck={false} />
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={preset === p.id} onClick={() => loadPreset(p)}>{p.label}</ChipButton>
          ))}
          <Hint>
            <span role="status">{note ?? 'Type a latitude and longitude, click the world map, or pick a preset. Out-of-range values are refused, not wrapped.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="si-stage stage-pad">
        <div className="si-pair">
          <div className="si-col">
            <Plot2D x={WORLD_X} y={WORLD_Y} aspect="equal" ariaLabel="World map as a plain longitude and latitude box with the cell of the chosen precision">
              <PointerLayer onDown={pick} />
              <Polygon points={box(shownCell)} tone="hi" />
              <Points data={[{ x: at.lon, y: at.lat, tone: 'hi', r: 4 }]} />
            </Plot2D>
            <div className="si-bits" role="group" aria-label="The bits of the code, five to a character">
              {Array.from({ length: precision }, (_, c) => (
                <div key={c} className="si-bitrow">
                  <span className="si-bitchar">{view.code[c]}</span>
                  <ArrayStrip
                    values={steps.slice(c * BITS_PER_CHAR, (c + 1) * BITS_PER_CHAR).map((s) => s.bit)}
                    cellTone={(i) => (steps[c * BITS_PER_CHAR + i].axis === 'lon' ? 'sky' : 'amber')}
                    cellState={(i) => (c * BITS_PER_CHAR + i < bitsShown ? 'idle' : 'dim')}
                    cellMax={BIT_CELL_MAX}
                    fontSize={11}
                  />
                  <span className="si-bitval">= {BASE32.indexOf(view.code[c])}</span>
                </div>
              ))}
            </div>
            <p className="si-note">
              {last
                ? `Bit ${bitsShown}: ${last.axis === 'lon' ? 'longitude' : 'latitude'} in [${last.lo}, ${last.hi}), middle ${last.mid}, so the bit is ${last.bit}.`
                : 'No bits yet: the cell is the whole world.'}
            </p>
          </div>
          <div className="si-col">
            <WideRegion minWidth={340} label="Zoomed map: scroll sideways to see all of it">
              <Plot2D x={zoomX} y={zoomY} width={340} height={300} ariaLabel="Zoom on the cell and its neighbours with nearby points">
                {withNeighbours && view.neighbourCells.map((c) => <Polygon key={c.code} points={box(c.bounds)} tone="info" />)}
                <Polygon points={box(view.cell)} tone="hi" />
                <Points
                  data={view.others.map((o) => ({ x: o.point.lon, y: o.point.lat, tone: o.state === 'found' ? 'ok' : o.state === 'missed' ? 'bad' : o.state === 'extra' ? 'info' : 'dim', ring: o.state === 'missed' ? 'bad' : undefined }))}
                  r={3.4}
                />
                <Points data={[{ x: at.lon, y: at.lat, tone: 'hi', r: 5 }]} />
              </Plot2D>
            </WideRegion>
            <p className="si-note">
              Near means within {Number(view.radiusDeg.toPrecision(3))} degrees on both axes (one cell's shorter side). {withNeighbours ? 'The eight neighbouring cells are searched too.' : 'Only the point\'s own cell is searched.'}
            </p>
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the code is built by the bisection shown; checked against published vectors in the tests</Provenance>
        <Provenance kind="toy" seed={3}>the scattered nearby points are made up</Provenance>
        <Provenance kind="illustrative">cell sizes use about 111.32 km per degree at the equator; cells are narrower in longitude away from it</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
