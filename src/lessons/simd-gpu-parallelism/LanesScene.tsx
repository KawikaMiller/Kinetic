import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField, Hint } from '../../components/ui';
import { sig, times } from '../../core/format';

import { usePlayer } from '../../core/usePlayer';
import { boundSentence, laneDivision, lanesFrames, type LaneFrame } from './frames';
import { ELEMENT_BITS, REGISTER_BITS, cycleReport, lanesOf, nextWider, parseN, type CycleReport, type TailMode } from './model';
import { lanesOpening, type LanesOpening } from './openings';

const COLS = 8;
const BANDWIDTH_EXPONENTS = { min: 2, max: 6 } as const;
const WIDTH_OPTIONS = REGISTER_BITS.map((bits) => ({ value: bits, label: bits === ELEMENT_BITS ? 'scalar' : `${bits}-bit` }));
const TAIL_OPTIONS: { value: TailMode; label: string }[] = [
  { value: 'scalar', label: 'scalar epilogue' },
  { value: 'masked', label: 'masked tail' },
];

const PRESETS: { id: string; label: string; set: LanesOpening }[] = [
  { id: 'brighten', label: 'image brighten (no dependence)', set: { n: 20, bits: 256, tail: 'scalar', bandwidth: 64 } },
  { id: 'tail', label: 'unlucky tail (N = 17)', set: { n: 17, bits: 512, tail: 'scalar', bandwidth: 64 } },
];

const sameSettings = (a: LanesOpening, b: LanesOpening) => a.n === b.n && a.bits === b.bits && a.tail === b.tail && a.bandwidth === b.bandwidth;

/** The tone and fill of element `i` at the frame where `done` instructions have run. */
function elementCell(report: CycleReport, owner: readonly number[], i: number, done: number) {
  const tailLike = report.instrs[owner[i]].kind !== 'vector';
  const o = owner[i];
  if (o === done - 1) return { text: i, tone: tailLike ? ('violet' as const) : ('hi' as const), fill: 'solid' as const };
  if (o < done - 1) return { text: i, tone: tailLike ? ('violet' as const) : ('muted' as const), fill: 'tint' as const };
  return { text: i, tone: tailLike ? ('violet' as const) : ('dim' as const), fill: 'outline' as const };
}

function LaneRow({ report, done }: { report: CycleReport; done: number }) {
  const ins = done > 0 ? report.instrs[done - 1] : null;
  if (!ins) return <Hint tone="muted" block>No instruction has run yet: press play or step.</Hint>;
  return (
    <div className="sg-lanes" role="img" aria-label={`The ${ins.lanes} lanes of instruction ${done}, ${ins.active} on`}>
      {Array.from({ length: ins.lanes }, (_, k) => (
        <span key={k} className={`sg-lane ${k < ins.active ? (ins.kind === 'vector' ? 'is-on' : 'is-tail') : 'is-off'}`}>
          {k < ins.active ? ins.from + k : '·'}
        </span>
      ))}
    </div>
  );
}

export function LanesScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<LanesOpening>(lanesOpening);
  const [nText, setNText] = useState(String(s.n));
  const [nError, setNError] = useState<string | null>(null);
  const report = useMemo(() => cycleReport(s.n, s.bits, s.tail, s.bandwidth), [s]);
  const scalar = useMemo(() => cycleReport(s.n, ELEMENT_BITS, s.tail, s.bandwidth), [s]);
  const wider = nextWider(s.bits);
  const widerReport = useMemo(() => (wider ? cycleReport(s.n, wider, s.tail, s.bandwidth) : null), [s, wider]);
  const frames = useMemo(() => lanesFrames(s.n, s.bits, s.tail, s.bandwidth, report), [s, report]);
  const player = usePlayer<LaneFrame>(frames, { interval: 650, autoplayOnChange: false });
  const done = player.frame.done;
  const owner = useMemo(() => report.instrs.flatMap((ins, k) => Array.from({ length: ins.active }, () => k)), [report]);

  const typeN = (text: string) => {
    setNText(text);
    const parsed = parseN(text);
    if (parsed.ok) {
      setNError(null);
      setS((cur) => ({ ...cur, n: parsed.value }));
    } else setNError(`${parsed.error} The array stays at ${s.n} elements.`);
  };
  const load = (p: LanesOpening) => {
    setS(p);
    setNText(String(p.n));
    setNError(null);
  };

  const bandwidthExp = Math.log2(s.bandwidth);
  const computeBinds = report.bound === 'compute';
  const memoryBinds = report.bound === 'memory';

  return (
    <StageFrame
      player={player}
      height={380}
      stats={
        <Stats>
          <Stat label="Lanes" value={lanesOf(s.bits)} sub={laneDivision(s.bits)} />
          <Stat label="Compute cycles" value={report.compute} color={computeBinds ? 'var(--info)' : undefined} sub={[`${report.vectorOps} vector ${report.vectorOps === 1 ? 'op' : 'ops'}`, report.tailElements === 0 ? 'no tail' : `+ ${report.compute - report.vectorOps} for the ${report.tailElements}-element tail`]} />
          <Stat label="Memory cycles" value={report.memory} color={memoryBinds ? 'var(--info)' : undefined} sub={[`${s.n * 12} bytes at ${s.bandwidth} bytes per cycle`]} />
          <Stat label="Cycles" value={report.cycles} sub={[boundSentence(report, widerReport), `${times(sig(scalar.cycles / report.cycles, 3))} against one lane at a time (${scalar.cycles} cycles)`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'touched by this instruction' },
            { color: 'var(--violet)', label: 'scalar tail' },
            { color: 'var(--muted)', label: 'done' },
            { color: 'var(--dim)', label: 'not yet / masked off' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Register" value={s.bits} onChange={(bits) => setS((c) => ({ ...c, bits }))} options={WIDTH_OPTIONS} />
          <Segmented label="Tail" value={s.tail} onChange={(tail) => setS((c) => ({ ...c, tail }))} options={TAIL_OPTIONS} />
        </>,
        <>
          <TextField label="Elements N" value={nText} onChange={typeN} width={72} spellCheck={false} />
          <Slider
            label="Memory bandwidth"
            value={bandwidthExp}
            {...BANDWIDTH_EXPONENTS}
            format={(v) => `${2 ** v} B/cycle`}
            onChange={(v) => setS((c) => ({ ...c, bandwidth: 2 ** v }))}
          />
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={sameSettings(p.set, s)} onClick={() => load(p.set)}>
              {p.label}
            </ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="sg-stage stage-pad">
        {nError && <Hint tone="muted" block>{nError}</Hint>}
        <CellGrid
          rows={Math.ceil(s.n / COLS)}
          cols={COLS}
          size="md"
          cell={(r, c) => {
            const i = r * COLS + c;
            return i >= s.n ? { fill: 'none' } : elementCell(report, owner, i, done);
          }}
          ariaLabel={`The ${s.n} array elements, ${done} of ${report.compute} instructions run`}
        />
        <LaneRow report={report} done={done} />
        <ProvenanceRow>
          <Provenance kind="toy">one instruction per cycle, no pipelining and no cache: a roofline-style simplification; each element moves 12 bytes (two loads, one store)</Provenance>
          <Provenance kind="from-memory">128-, 256- and 512-bit registers are SSE, AVX2 and AVX-512 on x86 and NEON is 128-bit on Arm; verify against the Intel Intrinsics Guide and Arm documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
