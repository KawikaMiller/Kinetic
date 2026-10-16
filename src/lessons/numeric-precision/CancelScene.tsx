import { useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { power } from '../../core/format';
import { cancelCaption } from './captions';
import { FUNCTIONS, K_DEFAULT, K_MAX, K_MIN, read, STRIP_DIGITS, tenToThe, type FunctionId } from './cancellation';
import { OPENING } from './opening';

const STRIP_MIN_WIDTH = 400;
const ROW_LABELS = ['oracle', 'naive', 'rewrite'];

/** Scene 2: two cancellations, as strips of digits against an 80-digit oracle. */
export function CancelScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<FunctionId>(OPENING.cancellation.id);
  const [k, setK] = useState(OPENING.cancellation.k);
  const fn = FUNCTIONS.find((f) => f.id === id)!;
  const r = read(id, k);
  const x = tenToThe(k);
  const lost = x + 1 === x;
  const rows = [r.oracleDigits, r.naive.digits, r.stable.digits];
  const correct = [STRIP_DIGITS, r.naive.correct, r.stable.correct];

  return (
    <StageFrame
      height={430}
      intro={cancelCaption(fn.label, k, r)}
      introKey={`${id}-${k}`}
      stats={
        <Stats>
          <Stat label="Naive: digits right" value={`${r.naive.correct} of ${STRIP_DIGITS}`} color={r.naive.correct === STRIP_DIGITS ? 'var(--ok)' : 'var(--bad)'} sub={fn.naive} />
          <Stat label="Rewrite: digits right" value={`${r.stable.correct} of ${STRIP_DIGITS}`} color={r.stable.correct === STRIP_DIGITS ? 'var(--ok)' : 'var(--bad)'} sub={fn.stable} />
          <Stat label={`x + 1 === x at ${power(k, 10)}`} value={lost ? 'true' : 'false'} color="var(--info)" sub="real JavaScript, run in your browser" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the oracle: 80-digit BigInt arithmetic', shape: 'square' },
            { color: 'var(--ok)', label: 'a correct digit', shape: 'square' },
            { color: 'var(--bad)', label: 'the first wrong digit and all after it', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Function" value={id} onChange={setId} options={FUNCTIONS.map((f) => ({ value: f.id, label: f.label }))} />
        </>,
        <>
          <Slider label="k, with x = 10^k" value={k} min={K_MIN} max={K_MAX} onChange={setK} format={(v) => `${v} (x = ${power(v, 10)})`} />
          <ChipButton tone="violet" on={k === K_DEFAULT && id === 'sqrt-difference'} onClick={() => { setId('sqrt-difference'); setK(K_DEFAULT); }}>Difference of nearly equal numbers</ChipButton>
        </>,
      ]}
    >
      <div className="np-stage stage-pad">
        <WideRegion minWidth={STRIP_MIN_WIDTH} label="Digit strips: scroll sideways to see all of them">
          <CellGrid
            rows={3}
            cols={STRIP_DIGITS}
            size={{ cell: 22, gap: 3, font: 13 }}
            rowLabels={ROW_LABELS}
            cell={(row, col) => ({
              text: rows[row][col],
              tone: row === 0 ? 'info' : col < correct[row] ? 'ok' : 'bad',
              fill: row === 0 ? 'outline' : 'tint',
            })}
            ariaLabel={`First ${STRIP_DIGITS} digits of the oracle, the naive result and the rewrite; correct digits green, wrong digits red`}
          />
        </WideRegion>
        <p className="np-note">
          The strips show the first {STRIP_DIGITS} significant digits; the decimal point is not drawn.
          {r.naive.value === 0 ? ' The naive result is exactly 0, so its digits are all zero.' : ''}
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the naive and rewritten results are real JavaScript doubles</Provenance>
        <Provenance kind="real">the oracle is a BigInt integer square root at 80 digits, not the rewritten formula</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
