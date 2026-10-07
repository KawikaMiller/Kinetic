import { useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { HeapObject, heapRect, MemoryMap, RefArrow, slotPort, VarSlot } from '../../components/memory';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { NA } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { listingFor, stackFrames, uafFrames } from './frames';
import { ASAN_STACK, ASAN_UAF, CANARY_ABORT, RUST_PANIC } from './listings';
import {
  DEFAULT_PRESET, HONESTY_STACK, hexAddr, NAME_BYTES, NO_DEFENCES, parseName, PRESETS, stackRun, WHY_IT_MATTERS,
  type DefenceId, type Defences, type OutcomeKind,
} from './model';
import { byteFields, byteTone, bytesAt, framePicture } from './picture';
import { blockText, HONESTY_UAF, RUST_ERROR, UAF_PROGRAMS, type UafDefence, type UafVar } from './uaf';
import './styles.css';

const STEP_MS = 1600;
/** The memory map with its slot labels needs this much width to stay readable. */
const FRAME_MIN_W = 420;

type SceneId = 'stack' | 'uaf';

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({
    label: 'Scene',
    options: [
      { value: 'stack', label: 'Stack overflow' },
      { value: 'uaf', label: 'Use after free' },
    ],
    initial: 'stack',
  });
  return scene === 'stack' ? <StackScene picker={picker} /> : <UafScene picker={picker} />;
}

/* ---------- stack overflow ---------- */

const OUTCOME: Record<OutcomeKind, { label: string; color: string }> = {
  fits: { label: 'fits', color: 'var(--ok)' },
  truncated: { label: 'cut short, safe', color: 'var(--ok)' },
  panic: { label: 'panic, safe', color: 'var(--ok)' },
  aborted: { label: 'aborted, safe', color: 'var(--ok)' },
  quiet: { label: 'silent bug', color: 'var(--orange)' },
  corrupted: { label: 'corrupted', color: 'var(--bad)' },
};

const DEFENCE_TOGGLES: { id: DefenceId; label: string; off: string; on: string }[] = [
  { id: 'boundsCheck', label: 'Bounds check', off: 'strcpy', on: 'snprintf' },
  { id: 'canary', label: 'Stack canary', off: 'Off', on: 'On' },
  { id: 'aslr', label: 'ASLR', off: 'Off', on: 'On' },
  { id: 'nx', label: 'NX stack', off: 'Off', on: 'On' },
  { id: 'memorySafe', label: 'Language', off: 'C', on: 'Rust' },
];

const encode = (t: string) => new TextEncoder().encode(t);

function StackScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState<string>(DEFAULT_PRESET.text);
  const [valid, setValid] = useState<{ text: string; bytes: Uint8Array }>(() => ({ text: DEFAULT_PRESET.text, bytes: encode(DEFAULT_PRESET.text) }));
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState<Defences>(NO_DEFENCES);
  const [seed, setSeed] = useState(1);
  const run = useMemo(() => stackRun(valid.bytes, d, seed), [valid, d, seed]);
  const frames = useMemo(() => stackFrames(run), [run]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const bytes = bytesAt(run, f.upTo);
  const pic = framePicture(run, f.upTo, f.fresh);
  const listing = listingFor(run);
  const past = d.memorySafe ? 0 : Math.max(0, f.upTo - NAME_BYTES);

  const onText = (t: string) => {
    setText(t);
    const parsed = parseName(t);
    if (parsed.ok) {
      setValid({ text: t, bytes: parsed.bytes });
      setError(null);
    } else setError(parsed.error);
  };

  const output: ConsoleLine[] = !f.done
    ? []
    : run.kind === 'aborted'
      ? CANARY_ABORT.map((t) => ({ text: t, tone: 'bad' as const }))
      : run.kind === 'panic'
        ? RUST_PANIC.map((t) => ({ text: t, tone: 'bad' as const }))
        : run.kind === 'corrupted'
          ? [{ text: '(the run stops before ret: this lesson does not continue it)', tone: 'muted' as const }]
          : ['(greet returned normally)'];

  const addrTone = d.aslr ? 'dim' : 'muted';

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Bytes written" value={`${f.upTo} / ${run.written}`} />
          <Stat label="Past the buffer" value={past} color={past ? 'var(--bad)' : undefined} />
          <Stat label="Outcome" value={f.done ? OUTCOME[run.kind].label : NA} color={f.done ? OUTCOME[run.kind].color : undefined} />
          <Stat label="Stack pages" value={d.nx ? 'read, write' : 'read, write, run'} sub={d.nx ? 'NX: never run as code' : 'executable stack'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'input bytes in the buffer' },
            { color: 'var(--bad)', label: 'written past the buffer' },
            { color: 'var(--violet)', label: 'canary, saved rbp, return address' },
            { color: 'var(--sky)', label: "main's frame" },
            { color: 'var(--hi)', label: 'row just written', shape: 'line' },
            { color: 'var(--ok)', label: 'stopped by a defence' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="Name" value={text} onChange={onText} width={240} spellCheck={false} className="msb-field" />
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" on={text === p.text} onClick={() => onText(p.text)}>
              {p.label}
            </ChipButton>
          ))}
          <span className="msb-refusal" role="status">
            {error ?? ''}
          </span>
        </>,
        <>
          {DEFENCE_TOGGLES.map((t) => (
            <Toggle key={t.id} label={t.label} value={d[t.id]} onChange={(v) => setD({ ...d, [t.id]: v })} off={t.off} on={t.on} />
          ))}
        </>,
      ]}
    >
      <div className="msb stage-pad">
        <CodePanel
          title={listing.lang === 'C' ? 'C · greet.c' : 'Rust · the same function'}
          lines={listing.lines}
          active={f.line}
          trailing={(i) => listing.notes[i] ?? ''}
        />
        <WideRegion minWidth={FRAME_MIN_W} label="Frame diagrams: scroll sideways to see all of them">
        <div className="msb-panels">
          <div className="msb-col">
            <SectionTitle>greet&apos;s frame, then part of main&apos;s · low addresses on top</SectionTitle>
            <MemoryMap
              regions={pic.regions}
              cells={pic.cells}
              pointers={pic.pointers}
              highlight={pic.highlight}
              unit={8}
              direction="up"
              ariaLabel="greet's stack frame, one row per 8-byte slot"
            />
          </div>
          <div className="msb-col">
            <SectionTitle>the bytes · offset from name</SectionTitle>
            <ByteGrid
              bytes={bytes}
              perRow={8}
              ascii
              fields={byteFields(run, bytes)}
              toneOf={(i) => byteTone(f.upTo, i)}
              highlight={f.fresh ? Array.from({ length: f.fresh[1] - f.fresh[0] }, (_, k) => ({ i: f.fresh![0] + k, tone: 'hi' as const })) : []}
              ariaLabel="The frame's bytes"
            />
          </div>
        </div>
        </WideRegion>
        <div className="msb-addrs">
          <span className={`chip tone-${addrTone} msb-addr`}>name at {hexAddr(run.layout.frameAddr)}</span>
          <span className={`chip tone-${addrTone} msb-addr`}>returns to {hexAddr(run.layout.returnTo)}</span>
          <span className="msb-note">{d.aslr ? 'ASLR on: new addresses every run.' : 'ASLR off: the same addresses every run.'} The canary is new every run either way.</span>
          <ChipButton tone="info" size="md" onClick={() => setSeed(seed + 1)}>
            Run again
          </ChipButton>
        </div>
        <ConsolePanel title="program output" lines={output} empty="(still copying)" />
        {d.memorySafe && (
          <Hint block>
            In JavaScript, <code>name = input</code> just makes a {valid.text.length}-character string: there is no fixed-size buffer to run past.
          </Hint>
        )}
        <Hint block>
          All defences start off: a build you only get by switching them off on purpose. Today most systems ship with canaries, NX and ASLR on; bounds checking is up to the code.
        </Hint>
        <Hint block>{HONESTY_STACK}</Hint>
        <FindingIt report={ASAN_STACK} what={<>strcpy of &quot;Grace Hopper&quot; (13 bytes) into name[8]</>} />
        <WhyItMatters />
      </div>
    </StageFrame>
  );
}

/* ---------- use after free ---------- */

const UAF_DEFENCES: { value: UafDefence; label: string }[] = [
  { value: 'none', label: 'No defence' },
  { value: 'null', label: 'p = NULL after free' },
  { value: 'rust', label: 'Rust ownership' },
  { value: 'gc', label: 'Garbage collector (JS)' },
];

const SCENE_W = 396;
const SCENE_H = 190;
const SLOT_X = 10;
const SLOT_Y: Record<UafVar, number> = { p: 46, q: 122 };
const BLOCK_X = 200;
const BLOCK_W = 186;
const BLOCK_Y0 = 40;
const BLOCK_GAP = 76;
const VAR_TONE: Record<UafVar, 'violet' | 'info'> = { p: 'violet', q: 'info' };

function UafScene({ picker }: { picker: ReactNode }) {
  const [defence, setDefence] = useState<UafDefence>('none');
  const { steps, frames } = useMemo(() => uafFrames(defence), [defence]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const step = steps[f.k];
  const s = step.state;
  const prog = UAF_PROGRAMS[defence];
  const gc = defence === 'gc';
  const staleWrite = s.wrote && (['p', 'q'] as const).some((v) => s.stale.includes(v) && s.vars[v] === s.wrote!.addr);

  const lineState = (i: number): LineState => {
    if (defence === 'rust') return f.done && i === prog.staleLine ? 'bad' : 'idle';
    if (i === step.line) return s.crash ? 'bad' : 'now';
    return 'idle';
  };

  const output: ConsoleLine[] =
    defence === 'rust' ? (f.done ? RUST_ERROR.map((t) => ({ text: t, tone: 'bad' as const })) : []) : [...s.out.map((t) => ({ text: t, tone: (staleOut(defence) ? 'bad' : 'ok') as 'bad' | 'ok' })), ...(s.crash ? [{ text: s.crash, tone: 'bad' as const }] : [])];

  return (
    <StageFrame
      player={player}
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'p' },
            { color: 'var(--info)', label: 'q' },
            { color: 'var(--bad)', label: 'freed block, stale pointer (dashed)', shape: 'line' },
            { color: 'var(--bad)', label: 'bytes the stale write changed' },
            { color: 'var(--hi)', label: 'line just run' },
            { color: 'var(--ok)', label: 'stopped by a defence' },
          ]}
        />
      }
      controls={[picker, <Segmented key="d" label="Defence" value={defence} onChange={setDefence} options={UAF_DEFENCES} />]}
    >
      <div className="msb stage-pad">
        <CodePanel title={`${prog.lang}${prog.lang === 'C' ? ' · uaf.c' : ''}`} lines={prog.lines} stateOf={lineState} />
        <svg className="msb-scene" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label="Variables p and q on the left, heap blocks on the right">
          <text className="scene-zone" x={SLOT_X} y={22}>
            variables
          </text>
          <text className="scene-zone" x={BLOCK_X} y={22}>
            heap
          </text>
          {defence === 'rust' && (
            <text className="msb-scene-note" x={BLOCK_X} y={BLOCK_Y0 + 30}>
              nothing runs: rustc rejects it
            </text>
          )}
          {(['p', 'q'] as const).map((v) => {
            const val = s.vars[v];
            return (
              <VarSlot
                key={v}
                at={{ x: SLOT_X, y: SLOT_Y[v] }}
                name={v}
                isRef={typeof val === 'number'}
                value={val === null ? 'NULL' : NA}
                tone={s.stale.includes(v) ? 'bad' : VAR_TONE[v]}
                dead={val === undefined}
              />
            );
          })}
          {s.blocks.map((b, i) => (
            <HeapObject
              key={b.addr}
              at={{ x: BLOCK_X, y: BLOCK_Y0 + i * BLOCK_GAP }}
              w={BLOCK_W}
              title={hexAddr(b.addr)}
              fields={[{ name: gc ? 'name' : '16 bytes', value: b.freed ? '(freed)' : `"${blockText(b)}"` }]}
              variant={b.freed ? 'freed' : 'live'}
              tone="muted"
              highlight={s.wrote?.addr === b.addr}
            />
          ))}
          {(['p', 'q'] as const).map((v) => {
            const val = s.vars[v];
            const i = s.blocks.findIndex((b) => b.addr === val);
            if (i < 0) return null;
            return (
              <RefArrow
                key={v}
                from={slotPort({ x: SLOT_X, y: SLOT_Y[v] })}
                to={heapRect({ x: BLOCK_X, y: BLOCK_Y0 + i * BLOCK_GAP }, BLOCK_W, 1)}
                tone={VAR_TONE[v]}
                dangling={s.stale.includes(v)}
              />
            );
          })}
        </svg>
        {!gc && s.blocks.length > 0 && (
          <div className="msb-col">
            <SectionTitle>block bytes at {hexAddr(s.blocks[0].addr)}</SectionTitle>
            <ByteGrid
              bytes={s.blocks[0].bytes}
              perRow={8}
              ascii
              toneOf={(i) => (s.wrote && s.wrote.addr === s.blocks[0].addr && i >= s.wrote.from && i < s.wrote.to ? (staleWrite ? 'bad' : 'info') : undefined)}
              ariaLabel="The block's bytes"
            />
          </div>
        )}
        <ConsolePanel title={defence === 'rust' ? 'rustc (trimmed)' : 'program output'} lines={output} empty={defence === 'rust' ? '(compiling)' : 'nothing printed yet'} />
        <Hint block>{HONESTY_UAF}</Hint>
        <FindingIt
          report={ASAN_UAF}
          what={<>the program with no defence</>}
          extra=" AddressSanitizer keeps freed memory out of reuse for a while, so the stale write is caught instead of landing in q."
        />
        <WhyItMatters />
      </div>
    </StageFrame>
  );
}

/** Whether this program's printed line shows corrupted data. */
const staleOut = (defence: UafDefence) => defence === 'none';

/* ---------- shared strips ---------- */

function FindingIt({ report, what, extra = '' }: { report: readonly string[]; what: ReactNode; extra?: string }) {
  return (
    <Box className="msb-strip">
      <SectionTitle>Finding it</SectionTitle>
      <p className="msb-note">
        Sanitizers such as AddressSanitizer (<code>-fsanitize=address</code>) and fuzzing (running the program on huge numbers of generated inputs) catch these bugs in testing.{extra}
      </p>
      <details className="msb-report">
        <summary>Illustrative report, lesson-authored, for {what}</summary>
        <ConsolePanel title="AddressSanitizer (illustrative)" lines={report.map((t) => ({ text: t, tone: 'muted' as const }))} />
      </details>
    </Box>
  );
}

function WhyItMatters() {
  return (
    <Box className="msb-strip">
      <SectionTitle>Why it matters</SectionTitle>
      <p className="msb-note">
        {WHY_IT_MATTERS} These bugs don&apos;t just crash programs: as above, the program can carry on running with memory it never meant to change.
      </p>
    </Box>
  );
}
