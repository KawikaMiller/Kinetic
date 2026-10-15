import { useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toBits } from '../../core/bits';
import { minScaleNote } from './text';
import { fenBuild, fenRange, lowbit, minBuild, prefixHops, rangeMinWrong, rangeStart, updateHops, type FenOp } from './fenwick';
import { parseField, parseRange, parseValue } from './keys';
import { buildTree, nodeCount, queryRange } from './model';
import { FENWICK_DEFAULT, FENWICK_MIN_RANGE, FENWICK_N, FENWICK_VALUES } from './presets';
import { fenwickCaption } from './text';
import type { Tone } from '../../core/tone';

const COL = 46;
const PAD = 24;
const ROW = 18;
const TOP = 26;
const CELL_H = 30;
const LOWBIT_TONES: Tone[] = ['amber', 'pink', 'sky', 'orange', 'muted'];
const FEN_TEXT_PX = 10;
const BITS = 5;

const QUERY_LINES = ['sum = 0', 'while i > 0:', '  sum += tree[i]', '  i -= i & -i'];
const UPDATE_LINES = ['while i <= n:', '  tree[i] += v', '  i += i & -i'];

type WideOp = FenOp | 'min';

export function FenwickScene({ picker }: { picker: ReactNode }) {
  const [op, setOp] = useState<WideOp>('sum');
  const [values, setValues] = useState<number[]>(FENWICK_VALUES);
  const [qText, setQText] = useState(String(FENWICK_DEFAULT.query));
  const [uText, setUText] = useState(String(FENWICK_DEFAULT.updateAt));
  const [vText, setVText] = useState('4');
  const [lText, setLText] = useState(String(FENWICK_DEFAULT.rangeL));
  const [rText, setRText] = useState(String(FENWICK_DEFAULT.rangeR));
  const [note, setNote] = useState<string | null>(null);

  const fenOp: FenOp = op === 'xor' ? 'xor' : 'sum';
  const tree = fenBuild(values, fenOp);
  const q = parseField(qText, 1, FENWICK_N, 'a cell number');
  const u = parseField(uText, 1, FENWICK_N, 'a cell number');
  const range = parseRange(lText, rText, FENWICK_N, 1);
  const swap = !range.ok ? range.swapOffer ?? null : null;
  const qi = q.ok ? q.value : FENWICK_DEFAULT.query;
  const ui = u.ok ? u.value : FENWICK_DEFAULT.updateAt;
  const reads = prefixHops(qi);
  const writes = updateHops(ui, FENWICK_N);
  const l = range.ok ? range.l : FENWICK_DEFAULT.rangeL;
  const r = range.ok ? range.r : FENWICK_DEFAULT.rangeR;

  const fen = op === 'min' ? null : fenRange(tree, l, r, fenOp);
  const seg = queryRange(buildTree(values, 'sum'), l - 1, r - 1);
  const segXor = op === 'xor' ? values.slice(l - 1, r).reduce((a, b) => a ^ b, 0) : null;
  const naiveMin = Math.min(...values.slice(l - 1, r));
  const wrongMin = rangeMinWrong(minBuild(values), r);
  const caption = fenwickCaption({ query: qi, hops: reads, ranges: reads.map((k) => `(${k - lowbit(k)}, ${k}]`), updateAt: ui, updateHops: writes, n: FENWICK_N });
  useIntroCaption(<>{caption}</>, [caption]);

  const width = FENWICK_N * COL + 2 * PAD;
  const x = (i: number) => PAD + (i - 0.5) * COL;
  const levels = BITS;
  const height = TOP + CELL_H + levels * ROW + 16;
  const chooseOp = (next: WideOp) => {
    if (next !== op && (next === 'min' || op === 'min')) {
      const [nl, nr] = next === 'min' ? [FENWICK_MIN_RANGE.l, FENWICK_MIN_RANGE.r] : [FENWICK_DEFAULT.rangeL, FENWICK_DEFAULT.rangeR];
      setLText(String(nl));
      setRText(String(nr));
    }
    setOp(next);
    setNote(null);
  };
  const apply = () => {
    if (!u.ok) return setNote(u.error);
    const v = parseValue(vText);
    if (!v.ok) return setNote(v.error);
    setNote(null);
    setValues(values.map((c, k) => (k === u.value - 1 ? (op === 'xor' ? c ^ v.value : c + v.value) : c)));
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Fenwick stores" value={FENWICK_N} sub="numbers, one per cell" />
          <Stat label="Iterative segment tree" value={2 * FENWICK_N} sub="numbers (2n), implementation-dependent" />
          <Stat label="Recursive segment tree" value={4 * FENWICK_N} sub={`array slots (4n) for ${nodeCount(buildTree(values, 'sum'))} nodes used`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'cell a prefix query reads', shape: 'square' },
            { color: 'var(--hi)', label: 'cell an update writes', shape: 'square' },
            { color: 'var(--amber)', label: 'bars: coverage by lowbit 1, 2, 4, 8, 16 (amber, pink, sky, orange, grey)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Operation" value={op} onChange={chooseOp} options={[{ value: 'sum', label: 'sum' }, { value: 'xor', label: 'xor' }, { value: 'min', label: 'min' }]} />
        </>,
        <>
          <TextField label="Prefix query up to" value={qText} onChange={setQText} width={64} spellCheck={false} />
          <TextField label="Update cell" value={uText} onChange={setUText} width={64} spellCheck={false} />
          <TextField label="by" value={vText} onChange={setVText} width={64} spellCheck={false} />
          <Button variant="primary" softDisabled={op === 'min'} onClick={apply}>Apply update</Button>
          <TextField label="Range l" value={lText} onChange={setLText} width={64} spellCheck={false} />
          <TextField label="r" value={rText} onChange={setRText} width={64} spellCheck={false} />
          {swap && <Button onClick={() => { setLText(String(swap.l)); setRText(String(swap.r)); }}>Swap l and r</Button>}
          <Hint>
            <span role="status">
              {note ?? (!q.ok ? q.error : !u.ok ? u.error : !range.ok ? range.error : 'Cells are numbered from 1 to 16, because i & -i needs a positive i.')}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="st-stage stage-pad">
        <WideRegion minWidth={Math.ceil((width * 8) / FEN_TEXT_PX)} label="Fenwick cells: scroll sideways to see all 16">
          <svg className="st-fen" viewBox={`0 0 ${width} ${height}`} width={width} role="img" aria-label="Fenwick tree: each cell with the range it is responsible for">
            <g aria-hidden="true">
              {Array.from({ length: FENWICK_N }, (_, k) => k + 1).map((i) => {
                const lb = lowbit(i);
                const row = Math.log2(lb);
                const state = writes.includes(i) ? 'is-write' : reads.includes(i) ? 'is-read' : '';
                return (
                  <g key={i}>
                    <text className="st-idx" x={x(i)} y={TOP - 8}>{i}</text>
                    <rect className={`st-fcell ${state}`} x={x(i) - COL / 2 + 3} y={TOP} width={COL - 6} height={CELL_H} rx={6} />
                    <text className="st-fval" x={x(i)} y={TOP + CELL_H / 2 + 4}>{op === 'min' ? minBuild(values)[i] : tree[i]}</text>
                    <rect
                      className={`st-bar tone-${LOWBIT_TONES[row]} ${state}`}
                      x={x(rangeStart(i)) - COL / 2 + 4}
                      y={TOP + CELL_H + 6 + row * ROW}
                      width={(i - rangeStart(i) + 1) * COL - 8}
                      height={ROW - 6}
                      rx={4}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        </WideRegion>
        <div className="st-pair">
          <div className="st-col">
            <BitStrip bits={toBits(qi, BITS)} highlight={[BITS - 1 - Math.log2(lowbit(qi))]} highlightTone="hi" size="sm" ariaLabel={`${qi} in binary; its lowest set bit is ringed`} />
            <Hint tone="muted" block>{qi} = binary above, lowbit({qi}) = {lowbit(qi)}: cell {qi} covers ({qi - lowbit(qi)}, {qi}].</Hint>
            <div className="st-code">
              <CodePanel title="query(i)" lines={QUERY_LINES} gutter="none" />
              <CodePanel title="update(i, v)" lines={UPDATE_LINES} gutter="none" />
            </div>
          </div>
          <div className="st-col">
            {op === 'min' ? (
              <div className="st-refuse" role="note">
                <b>Refused: a Fenwick tree cannot answer a range minimum.</b> Its range query takes prefix(r) and removes prefix(l - 1), which needs an operation with an inverse. Sum and xor have one; min and max do not.
                <p className="st-line">
                  The same hops give a correct prefix minimum, but for cells {l} to {r} the recipe can only answer {wrongMin} (the minimum up to {r}), while a plain loop says {naiveMin}
                  {wrongMin === naiveMin ? ': they agree on this range by luck; try l = 6 and r = 9.' : ': they disagree.'}
                </p>
              </div>
            ) : (
              <>
                <p className="st-line">
                  Cells {l} to {r}, {op}: the Fenwick tree reads {fen!.hopsR.length + fen!.hopsL.length} cells and says <b>{fen!.value}</b>
                  {op === 'sum' ? <>; the segment tree touches {seg.touched} nodes and says <b>{seg.value}</b>{seg.value === fen!.value ? ': they agree.' : ': they differ.'}</> : <>; a plain loop says <b>{segXor}</b>{segXor === fen!.value ? ': they agree.' : ': they differ.'}</>}
                </p>
                <p className="st-line">{minScaleNote}</p>
              </>
            )}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">hops, ranges and results come from the Fenwick tree built on these cells; the segment tree answers the same range</Provenance>
        <Provenance kind="illustrative">numbers stored depend on the implementation: 2n and 4n are two common layouts of a segment tree</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
