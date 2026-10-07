import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { power } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { pad, radixFrames } from './frames';
import {
  COST_BITS, COST_N, COST_RADIX_BITS, comparisonLeading, costRow, firstBreak, isSorted, RADIX_BASE, RADIX_DIGITS, RADIX_MAX,
  RADIX_MAX_ITEMS, RADIX_PRESETS, parseKeys, type BucketOrder,
} from './model';

const STEP_MS = 800;
const BUCKET_SIZE = { cell: 36, font: 11 };
const MIN_BUCKET_ROWS = 3;
const BYTES_PER_COUNTER = 4;
const GIB = 2 ** 30;
const DIGIT_LABELS = Array.from({ length: RADIX_BASE }, (_, d) => String(d));
const group = (n: number) => n.toLocaleString('en-US');

export function RadixScene({ picker }: { picker: ReactNode }) {
  const [keys, setKeys] = useState<number[]>([...RADIX_PRESETS[0].keys]);
  const [draft, setDraft] = useState(RADIX_PRESETS[0].keys.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<BucketOrder>('fifo');
  const frames = useMemo(() => radixFrames(keys, order), [keys, order]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  // The tallest bucket in the whole run, so the grid keeps one height while it plays.
  const rows = useMemo(() => Math.max(MIN_BUCKET_ROWS, ...frames.flatMap((fr) => fr.buckets.map((b) => b.length))), [frames]);

  const load = (ks: readonly number[]) => {
    setKeys([...ks]);
    setDraft(ks.join(', '));
    setError(null);
  };
  const apply = () => {
    const r = parseKeys(draft, RADIX_MAX, RADIX_MAX_ITEMS);
    if (!r.ok) return setError(r.error);
    load(r.keys);
  };

  const pass = f.pass;
  const broken = f.done && !isSorted(f.strip) ? firstBreak(f.strip, RADIX_DIGITS) : null;
  const stripState = (i: number) => {
    const it = f.strip[i];
    if (it.id === f.current) return 'active' as const;
    if (broken && (it === broken[0] || it === broken[1])) return 'bad' as const;
    if (f.done && !broken) return 'done' as const;
    return 'idle' as const;
  };

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Pass" value={pass === null ? '–' : `${pass + 1} of ${RADIX_DIGITS}`} color="var(--hi)" sub={pass === null ? 'not started' : `${['ones', 'tens', 'hundreds'][pass]} digit`} />
          <Stat label="Digit reads" value={f.reads} color="var(--info)" sub={`of ${RADIX_DIGITS * keys.length}: one per number per pass`} />
          <Stat label="Comparisons" value={0} color="var(--ok)" sub="numbers are never compared" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'digit / number now' },
            { color: 'var(--info)', label: 'in a bucket' },
            { color: 'var(--ok)', label: 'sorted' },
            { color: 'var(--bad)', label: 'out of order' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Buckets" value={order === 'lifo'} onChange={(v) => setOrder(v ? 'lifo' : 'fifo')} off="First in, first out" on="Newest first" />
        </>,
        <>
          <TextField label="Numbers" value={draft} onChange={setDraft} onEnter={apply} width={220} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
          <ControlGroup label="Presets" inline>
            {RADIX_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={keys.join() === p.keys.join()} onClick={() => load(p.keys)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint tone={error ? 'muted' : 'faint'} className="lts-note">
            <span role="status">{error ?? `Up to ${RADIX_MAX_ITEMS} whole numbers, 0 to ${RADIX_MAX}: this demo sorts 0-${RADIX_MAX}.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="lts stage-pad lts-rows">
        <div className="lts-row">
          <SectionTitle className="lts-row-title">Strip{f.collected && pass !== null ? `, read back after pass ${pass + 1}` : ''}</SectionTitle>
          <ArrayStrip
            values={f.strip.map((it) => it.key)}
            renderValue={(v) => <Digits value={Number(v)} pass={pass} />}
            cellState={stripState}
            fontSize={13}
            cellMax={56}
          />
        </div>
        <div className="lts-row">
          <SectionTitle className="lts-row-title">
            Buckets by {pass === null ? 'digit' : `${['ones', 'tens', 'hundreds'][pass]} digit`}{' '}
            <span className="hint-inline">{order === 'fifo' ? 'read top to bottom' : 'read bottom to top (newest first)'}</span>
          </SectionTitle>
          <CellGrid
            rows={rows}
            cols={RADIX_BASE}
            size={BUCKET_SIZE}
            colLabels={DIGIT_LABELS}
            className="lts-buckets"
            ariaLabel={bucketSummary(f.buckets)}
            cell={(r, c) => {
              const it = f.buckets[c][r];
              if (!it) return { fill: 'none' };
              return it.id === f.current ? { tone: 'hi', fill: 'solid', text: pad(it.key) } : { tone: 'info', fill: 'tint', text: pad(it.key) };
            }}
          />
        </div>
        <WhyNotAlways />
      </div>
    </StageFrame>
  );
}

/** The three digits, with the one this pass sorts by lit. */
function Digits({ value, pass }: { value: number; pass: number | null }) {
  const s = pad(value);
  return (
    <span className="lts-digits">
      {[...s].map((ch, k) => {
        const d = RADIX_DIGITS - 1 - k;
        return (
          <span key={k} className={pass === d ? 'lts-digit-now' : undefined}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

function bucketSummary(buckets: readonly { key: number }[][]): string {
  const filled = buckets.map((b, d) => (b.length ? `bucket ${d}: ${b.map((x) => x.key).join(', ')}` : null)).filter(Boolean);
  return filled.length ? `Buckets, ${filled.join('; ')}` : 'Buckets, all empty';
}

function WhyNotAlways() {
  const nlogn = Math.round(comparisonLeading());
  return (
    <Box className="lts-why">
      <SectionTitle>Why not always?</SectionTitle>
      <p className="lts-why-text">
        Counting sort costs n + k, where k is how many keys are possible, and it needs one counter per possible key. That's cheap for
        keys 0-9 and ruinous for 32-bit keys: {power(32)} counters, {BYTES_PER_COUNTER * 2 ** 32 / GIB} GiB at {BYTES_PER_COUNTER} bytes
        each. Radix sort fixes that by sorting one {COST_RADIX_BITS}-bit digit at a time.
      </p>
      <table className="data-table lts-why-table">
        <thead>
          <tr>
            <th>Keys</th>
            <th>Counting: n + k</th>
            <th>Radix, base {2 ** COST_RADIX_BITS}: passes × (n + {2 ** COST_RADIX_BITS})</th>
          </tr>
        </thead>
        <tbody>
          {COST_BITS.map((bits) => {
            const c = costRow(bits);
            return (
              <tr key={bits}>
                <td>{bits}-bit</td>
                <td>{group(COST_N)} + {power(bits)}</td>
                <td>{c.radixPasses} × {group(COST_N + 2 ** COST_RADIX_BITS)} = {group(c.radixWork)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Hint block>
        For n = {group(COST_N)} keys (illustrative), against n log₂ n ≈ {group(nlogn)} for a comparison sort. These are the formulas'
        step counts, not timings. Linear time needs keys with a small range or a fixed number of digits; comparison sorts need neither.
      </Hint>
    </Box>
  );
}
