import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { ByteGrid } from '../../components/ByteGrid';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { MemoryMap, RefArrow, memoryMapLayout } from '../../components/memory';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { bytes as fmtBytes } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { CARD, arrowBend, cardLayout, type Card, type SymRow } from './cards';
import { linkFrames, loadFrames, type LinkFrame } from './frames';
import { hex, link, patchedSection, signedHex, type Mode } from './link';
import { loadPlan, randomBases, type Binding } from './load';
import { GEOM_O, MAIN_O } from './objects';
import { FILE_SIZE, PRESETS, commandFor, inputsFor, type PresetId } from './presets';
import './styles.css';

const STEP_MS = 1500;
/** The link picture: cards plus the arrow gutter (spec: 480 on phones). */
const CARDS_MIN_W = 480;
/** MemoryMap's smallest text is its 10.5px address column. */
const MAP_TEXT_PX = 10.5;

type SceneId = 'link' | 'load';

export function Stage() {
  const [mode, setMode] = useState<Mode>('dynamic');
  const [scene, picker] = useScenePicker<SceneId>({
    label: 'Scene',
    options: [
      { value: 'link', label: 'Link' },
      { value: 'load', label: 'Load & run' },
    ],
    initial: 'link',
  });
  const libcToggle = <Toggle label="libc" value={mode === 'static'} onChange={(v) => setMode(v ? 'static' : 'dynamic')} off="Dynamic" on="Static (-static)" />;
  return scene === 'link' ? <LinkScene picker={picker} mode={mode} libcToggle={libcToggle} /> : <LoadScene picker={picker} mode={mode} libcToggle={libcToggle} />;
}

/* ---------- link ---------- */

function LinkScene({ picker, mode, libcToggle }: { picker: ReactNode; mode: Mode; libcToggle: ReactNode }) {
  const [presetId, setPresetId] = useState<PresetId>('ok');
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const inputs = useMemo(() => inputsFor(preset, mode), [preset, mode]);
  const result = useMemo(() => link(inputs), [inputs]);
  const frames = useMemo(() => linkFrames(inputs, result, mode), [inputs, result, mode]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const { cards, width, height } = useMemo(() => cardLayout(inputs), [inputs]);

  const ldLines: ConsoleLine[] = f.messages.length
    ? f.messages.map((t) => ({ text: t, tone: 'bad' as const }))
    : f.done && result.ok
      ? [{ text: '(no output: the link succeeded and wrote ./app)', tone: 'muted' as const }]
      : [];
  const size = result.ok ? FILE_SIZE[mode] : null;

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Still undefined" value={stillUndefined(f, cards).length} color={f.undefinedSyms.length ? 'var(--bad)' : undefined} />
          <Stat label="Relocations patched" value={`${f.patched} / ${result.ok ? result.patches.length : '–'}`} />
          <Stat label="File size" value={size && f.done ? `≈ ${fmtBytes(size, { base: 1000, dp: 0 })}` : '–'} sub="illustrative">
            <Bar value={size && f.done ? size : 0} max={FILE_SIZE.static} tone="info" height={8} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'defined symbol (peg)', shape: 'dot' },
            { color: 'var(--dim)', label: 'needed, unresolved (socket)', shape: 'dot' },
            { color: 'var(--hi)', label: 'being resolved, or being read', shape: 'dot' },
            { color: 'var(--violet)', label: 'resolved: arrow to the definition', shape: 'line' },
            { color: 'var(--info)', label: 'patched bytes' },
            { color: 'var(--orange)', label: 'first of two definitions', shape: 'dot' },
            { color: 'var(--bad)', label: 'link error', shape: 'dot' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" size="md" on={presetId === p.id} onClick={() => setPresetId(p.id)}>
              {p.label}
            </ChipButton>
          ))}
        </>,
        libcToggle,
      ]}
    >
      <div className="ll stage-pad">
        <pre className="ll-cmd">
          <span className="ll-prompt">$ </span>
          {commandFor(preset, mode)}
        </pre>
        <WideRegion minWidth={CARDS_MIN_W} label="Object files and their symbols: scroll sideways to see the arrows">
          <svg className="ll-cards" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={cardsLabel(f, cards)}>
            {cards.map((c) => (
              <CardView key={c.input} card={c} f={f} />
            ))}
            {f.arrows.map((a, i) => {
              const from = rowOf(cards, a.from, a.symbol, 'socket');
              const to = rowOf(cards, a.toObj, a.symbol, 'peg');
              if (!from || !to) return null;
              const x = CARD.x + CARD.w;
              return <RefArrow key={`${a.from}-${a.symbol}-${i}`} from={{ x, y: from.y }} to={{ x: x + 5, y: to.y }} bend={arrowBend(from.y, to.y)} tone="violet" />;
            })}
          </svg>
        </WideRegion>
        <ConsolePanel title="ld" lines={ldLines} empty="(linking…)" />
        <div className="ll-row">
          <RelocTable result={result} patched={f.patched} laidOut={f.laidOut} />
        </div>
        <div className="ll-row">
          {[MAIN_O, GEOM_O].map((obj) => (
            <PatchedBytes key={obj.name} objName={obj.name} result={result} f={f} />
          ))}
        </div>
        <Hint block>
          Simplified object files and linker in the style of GNU ld on x86-64 ELF: the machine-code bytes are real encodings, but real binaries also link start-up files
          (crt1.o and friends) and have many more sections and relocation types. Built with <code>-no-pie</code> so the addresses stay fixed and readable.
        </Hint>
      </div>
    </StageFrame>
  );
}

const rowOf = (cards: readonly Card[], obj: string, symbol: string, kind: SymRow['kind']) => {
  for (const c of cards) for (const r of c.rows) if (r.obj === obj && r.symbol === symbol && r.kind === kind) return r;
  return null;
};

/** Sockets on read cards that no arrow has reached yet. */
function stillUndefined(f: LinkFrame, cards: readonly Card[]) {
  const open = new Set<string>();
  for (const c of cards) {
    if (!f.read.includes(c.input)) continue;
    for (const r of c.rows) {
      if (r.kind !== 'socket' || !objIncluded(f, c, r.obj)) continue;
      if (!f.arrows.some((a) => a.from === r.obj && a.symbol === r.symbol)) open.add(r.symbol);
    }
  }
  return [...open];
}

/** An archive member only counts once it's pulled in. */
const objIncluded = (f: LinkFrame, c: Card, obj: string) => c.kind !== 'archive' || f.pulled.includes(obj);

function cardsLabel(f: LinkFrame, cards: readonly Card[]): string {
  const open = stillUndefined(f, cards);
  return `Object files on the command line, with their symbols. ${f.arrows.length} resolved. ${open.length ? `Undefined: ${open.join(', ')}.` : 'Nothing undefined.'}`;
}

function CardView({ card, f }: { card: Card; f: LinkFrame }) {
  const read = f.read.includes(card.input);
  const now = f.input === card.input;
  const skipped = f.skipped.includes(card.input);
  const cls = ['ll-card', now ? 'is-now' : '', !read ? 'is-unread' : '', skipped ? 'is-skipped' : ''].join(' ');
  const x = CARD.x;
  const right = CARD.x + CARD.w;
  return (
    <g className={cls}>
      <rect className="ll-card-box" x={x} y={card.y} width={CARD.w} height={card.h} rx={10} />
      <text className="ll-card-title" x={x + 12} y={card.y + 17}>
        {card.name}
        <tspan className="ll-card-kind" dx={8}>
          {card.kind === 'obj' ? 'object file' : card.kind === 'archive' ? 'static archive' : 'shared library'}
        </tspan>
      </text>
      {card.members.map((m) => (
        <text key={m.name} className={`ll-member ${f.pulled.includes(m.name) ? 'is-pulled' : ''}`} x={x + 20} y={m.y}>
          member {m.name}
          {f.pulled.includes(m.name) ? ' · pulled in' : ''}
        </text>
      ))}
      {card.rows.map((r) => {
        const state = symState(f, card, r, read);
        return (
          <g key={`${r.obj}-${r.symbol}-${r.kind}`} className={`ll-sym is-${state}`}>
            <text className="ll-sym-name" x={right - 18} y={r.y + 4} textAnchor="end">
              {r.kind === 'peg' ? 'defines' : 'needs'} {r.symbol}
            </text>
            {r.kind === 'peg' ? <circle className="ll-peg" cx={right} cy={r.y} r={6} /> : <circle className="ll-socket" cx={right} cy={r.y} r={6} />}
          </g>
        );
      })}
      {card.note && (
        <text className="ll-note" x={right - 18} y={card.y + card.h - 10} textAnchor="end">
          {card.note}
        </text>
      )}
    </g>
  );
}

type SymState = 'unread' | 'defined' | 'open' | 'current' | 'resolved' | 'error' | 'first';

function symState(f: LinkFrame, card: Card, r: SymRow, read: boolean): SymState {
  if (!read || !objIncluded(f, card, r.obj)) return 'unread';
  if (r.kind === 'peg') {
    if (f.duplicate?.symbol === r.symbol && f.duplicate.second === r.obj) return 'error';
    if (f.duplicate?.symbol === r.symbol && f.duplicate.first === r.obj) return 'first';
    return 'defined';
  }
  if (f.current.some((c) => c.obj === r.obj && c.symbol === r.symbol)) return 'current';
  if (f.arrows.some((a) => a.from === r.obj && a.symbol === r.symbol)) return 'resolved';
  if (f.undefinedSyms.includes(r.symbol)) return 'error';
  return 'open';
}

function RelocTable({ result, patched, laidOut }: { result: ReturnType<typeof link>; patched: number; laidOut: boolean }) {
  const relocs = result.included.filter((o) => o.name !== 'printf.o').flatMap((o) => o.relocs.map((r) => ({ obj: o.name, r })));
  return (
    <div className="ll-table">
      <SectionTitle>relocations · S + A − P for these PC-relative types</SectionTitle>
      <div className="ll-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>where</th>
              <th>type</th>
              <th>symbol</th>
              <th>S</th>
              <th>A</th>
              <th>P</th>
              <th>S + A − P</th>
            </tr>
          </thead>
          <tbody>
            {relocs.map(({ obj, r }, i) => {
              const p = result.patches[i];
              const done = laidOut && p && i < patched;
              return (
                <tr key={`${obj}-${r.offset}`} className={done ? 'is-done' : ''}>
                  <td>
                    <code>
                      {obj} {r.section}+{hex(r.offset)}
                    </code>
                  </td>
                  <td>
                    <code>{r.type.replace('R_X86_64_', '')}</code>
                  </td>
                  <td>
                    <code>{r.symbol}</code>
                  </td>
                  <td className="ll-num">{laidOut && p ? hex(p.S) : '?'}</td>
                  <td className="ll-num">{signedHex(r.addend)}</td>
                  <td className="ll-num">{laidOut && p ? hex(p.P) : '?'}</td>
                  <td className="ll-num ll-value">{done ? signedHex(p.value) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PatchedBytes({ objName, result, f }: { objName: string; result: ReturnType<typeof link>; f: LinkFrame }) {
  const obj = objName === MAIN_O.name ? MAIN_O : GEOM_O;
  const placed = f.laidOut ? patchedSection(result, objName, '.text', f.patched) : null;
  if (f.laidOut && !placed) return null;
  const bytes = placed ? placed.bytes : [...obj.sections['.text']!];
  const order = result.patches.filter((p) => p.obj === objName);
  return (
    <div className="ll-bytes">
      <SectionTitle>
        {objName} .text · {placed ? `at ${hex(placed.addr)} in app` : 'offsets in the object file'}
      </SectionTitle>
      <ByteGrid
        bytes={bytes}
        offsetBase={placed ? placed.addr : 0}
        fields={obj.relocs.map((r) => {
          const p = order.find((x) => x.reloc.offset === r.offset);
          const done = !!p && result.patches.indexOf(p) < f.patched && f.laidOut;
          return { from: r.offset, to: r.offset + 3, tone: done ? ('info' as const) : ('dim' as const), label: `${done ? 'patched' : 'hole'} → ${r.symbol}` };
        })}
        ariaLabel={`${objName} machine code bytes`}
      />
    </div>
  );
}

/* ---------- load & run ---------- */

function LoadScene({ picker, mode, libcToggle }: { picker: ReactNode; mode: Mode; libcToggle: ReactNode }) {
  const [binding, setBinding] = useState<Binding>('lazy');
  const [seed, setSeed] = useState(1);
  const linked = useMemo(() => link(inputsFor(PRESETS[0], mode)), [mode]);
  const plan = useMemo(() => loadPlan(linked, mode, binding, randomBases(seed)), [linked, mode, binding, seed]);
  const frames = useMemo(() => loadFrames(plan, mode, binding), [plan, mode, binding]);
  const player = usePlayer(frames, { interval: STEP_MS * 1.4 });
  const s = player.frame.step;
  const mapProps = { regions: s.regions, cells: s.cells, pointers: s.pointer ? [s.pointer] : [], unit: 0x1000 } as const;
  const mapMin = minWidthForText(memoryMapLayout(mapProps).width, MAP_TEXT_PX);

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="GOT[printf]" value={s.got === null ? 'none (static)' : hex(s.got)} color={s.gotWritten ? 'var(--info)' : undefined} sub={s.got === null ? undefined : s.got === plan.printf ? 'printf in libc.so.6' : 'back into printf@plt'} />
          <Stat label="Output" value={s.output.at(-1) ?? '–'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'code segment r-x' },
            { color: 'var(--amber)', label: 'read-only r--' },
            { color: 'var(--pink)', label: 'data rw-' },
            { color: 'var(--orange)', label: 'shared library' },
            { color: 'var(--muted)', label: 'stack, heap' },
            { color: 'var(--info)', label: 'GOT slot just written' },
            { color: 'var(--hi)', label: 'rip: running here', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {libcToggle}
          {mode === 'dynamic' && <Toggle label="Binding" value={binding === 'now'} onChange={(v) => setBinding(v ? 'now' : 'lazy')} off="Lazy" on="At load (-z now)" />}
          <ChipButton tone="info" size="md" onClick={() => setSeed(seed + 1)}>
            Run again
          </ChipButton>
        </>,
      ]}
    >
      <div className="ll stage-pad">
        <WideRegion minWidth={mapMin} label="Process memory map: scroll sideways to see all of it">
          <MemoryMap {...mapProps} direction="down" ariaLabel="The process's address space, high addresses at the top, one row per 4 KB page" />
        </WideRegion>
        <ConsolePanel title="output" lines={s.output} empty="(nothing printed yet)" />
        <Hint block>
          Addresses for one example run. The program is linked with <code>-no-pie</code>, so its own segments always land at 0x400000 and up; ASLR moves the stack, the heap
          and {mode === 'dynamic' ? 'the shared libraries' : 'nothing else here, since there are no shared libraries'} on every run (press Run again). With PIE, gcc&apos;s
          default on most distributions, the program moves too. libc&apos;s size and printf&apos;s offset inside it are illustrative.
        </Hint>
        {mode === 'dynamic' && (
          <Hint block>
            Where ld.so looks for <code>libc.so.6</code>, simplified from <code>man ld.so</code>: the program&apos;s DT_RPATH (only if it has no DT_RUNPATH), then{' '}
            <code>LD_LIBRARY_PATH</code>, then DT_RUNPATH, then the cache in <code>/etc/ld.so.cache</code>, then the default directories such as /lib and /usr/lib.
            Lazy binding is the classic default; many distributions build with <code>-z now</code> (full RELRO), which binds everything at load time instead.
          </Hint>
        )}
      </div>
    </StageFrame>
  );
}
