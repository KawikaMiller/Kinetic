import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { BitStrip } from '../../components/BitStrip';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { chunkGroups, type Bit } from '../../core/bits';
import { useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import type { FieldParse } from '../../core/parse';
import type { Tone } from '../../core/tone';
import { rectIn, useMeasure } from '../../core/useMeasure';
import { dividerSlots, nearestSlot } from './divider';
import { addressCaption, equalCaption, handCaption, membershipCaption, teamsCaption, type SplitMode } from './frames';
import {
  ADDRESS_BITS, DEFAULT_CIDR, DEFAULT_PARENT, DEFAULT_PROBE, DEFAULT_TEAMS, MAX_FIELD_CHARS, PRESETS, addressBits, allocate, andBits,
  blockEnd, blockInfo, blockSize, blockToString, contains, firstDifference, hex32, ipToString, maskOf, networkOf, parseCidr, parseIPv4,
  parseTeams, placeBlock, splitEqual, type Allocation, type Block,
} from './model';
import './styles.css';

const SCENES = [
  { value: 'address' as const, label: 'One block' },
  { value: 'split' as const, label: 'Split a block' },
];

/** A parse result we know is good (the lesson's own defaults). */
function known<T>(r: FieldParse<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const count = (n: number) => n.toLocaleString('en-US');
const octetGroups = (a: number) => chunkGroups(ADDRESS_BITS, 8, { label: (k) => String((a >>> (24 - 8 * k)) & 0xff) });
const plainGroups = chunkGroups(ADDRESS_BITS, 8);
const HONEST = 'Nothing simulated: every number here is computed live from the bits.';

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'address' });
  return scene === 'split' ? <SplitScene picker={picker} /> : <AddressScene picker={picker} />;
}

// ── One block: the divider, the readouts and "Does it belong?" ───────────

function AddressScene({ picker }: { picker: ReactNode }) {
  const [{ addr, prefix }, setBlock] = useState(() => known(parseCidr(DEFAULT_CIDR)));
  const [draft, setDraft] = useState(DEFAULT_CIDR);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState(() => known(parseIPv4(DEFAULT_PROBE)));
  const [probeDraft, setProbeDraft] = useState(DEFAULT_PROBE);
  const [probeError, setProbeError] = useState<string | null>(null);
  const setCaption = useSetCaption();
  const info = blockInfo(addr, prefix);
  const inside = contains(info.network, prefix, probe);

  // A block change speaks the block's caption; a Check press (below) speaks the verdict until the block changes.
  useEffect(() => {
    setCaption(addressCaption(addr, prefix), { quiet: true });
  }, [addr, prefix, setCaption]);

  const setPrefix = (p: number) => {
    setBlock({ addr, prefix: p });
    setDraft(`${ipToString(addr)}/${p}`);
    setError(null);
  };
  const submit = () => {
    const r = parseCidr(draft);
    if (!r.ok) return setError(r.error);
    setError(null);
    setBlock(r.value);
  };
  const load = (cidr: string) => {
    setBlock(known(parseCidr(cidr)));
    setDraft(cidr);
    setError(null);
  };
  const check = () => {
    const r = parseIPv4(probeDraft);
    if (!r.ok) return setProbeError(r.error);
    setProbeError(null);
    setProbe(r.value);
    setCaption(membershipCaption(addr, prefix, r.value), { quiet: true });
  };
  const loaded = PRESETS.find((p) => {
    const r = parseCidr(p.cidr);
    return r.ok && r.value.addr === addr && r.value.prefix === prefix;
  });

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Block" value={`${ipToString(info.network)}/${prefix}`} sub={`${count(info.total)} addresses`} />
          <Stat label="Usable hosts" value={<AnimatedValue value={count(info.usable)} />} sub={info.kind === 'normal' ? 'minus network + broadcast' : info.kind === 'point-to-point' ? 'RFC 3021: both usable' : 'one host'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'network bits' },
            { color: 'var(--violet)', label: 'host bits' },
            { color: 'var(--hi)', label: 'prefix divider (drag it)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Prefix" value={prefix} min={0} max={ADDRESS_BITS} onChange={setPrefix} format={(v) => `/${v}`} />
        </>,
        <>
          <TextField label="Address/prefix" value={draft} onChange={setDraft} onEnter={submit} width={190} maxLength={MAX_FIELD_CHARS} spellCheck={false} />
          <Button onClick={submit} disabled={!draft.trim()}>Set</Button>
          {error && <Hint tone="muted" className="sc-error">{error}</Hint>}
        </>,
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} on={loaded?.id === p.id} onClick={() => load(p.cidr)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          <TextField label="Does it belong?" value={probeDraft} onChange={setProbeDraft} onEnter={check} width={170} maxLength={MAX_FIELD_CHARS} spellCheck={false} />
          <Button onClick={check} disabled={!probeDraft.trim()}>Check</Button>
          {probeError && <Hint tone="muted" className="sc-error">{probeError}</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad sc">
        <SectionTitle weight="regular" hint="octet values above each byte">{ipToString(addr)} in bits</SectionTitle>
        <PrefixStrip addr={addr} prefix={prefix} onPrefix={setPrefix} />
        <table className="data-table sc-readouts">
          <tbody>
            <tr><th scope="row">Network</th><td>{ipToString(info.network)}</td></tr>
            <tr><th scope="row">Broadcast</th><td>{info.broadcast === null ? <span className="sc-muted">none: {prefix === 31 ? 'RFC 3021 link' : 'a single host'}</span> : ipToString(info.broadcast)}</td></tr>
            <tr><th scope="row">First host</th><td>{ipToString(info.first)}</td></tr>
            <tr><th scope="row">Last host</th><td>{ipToString(info.last)}</td></tr>
            <tr><th scope="row">Usable hosts</th><td>{count(info.usable)}</td></tr>
            <tr><th scope="row">Netmask</th><td>{ipToString(info.mask)} <span className="sc-muted">{hex32(info.mask)}</span></td></tr>
            <tr><th scope="row">Wildcard</th><td>{ipToString(info.wildcard)}</td></tr>
          </tbody>
        </table>
        <Membership addr={addr} prefix={prefix} probe={probe} inside={inside} />
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

const DIVIDER_KEYS: Record<string, (p: number) => number> = {
  ArrowLeft: (p) => p - 1,
  ArrowDown: (p) => p - 1,
  ArrowRight: (p) => p + 1,
  ArrowUp: (p) => p + 1,
  PageDown: (p) => p - 8,
  PageUp: (p) => p + 8,
  Home: () => 0,
  End: () => ADDRESS_BITS,
};

/** The address's 32 bits with a draggable, arrow-key prefix divider laid over the measured strip. */
function PrefixStrip({ addr, prefix, onPrefix }: { addr: number; prefix: number; onPrefix: (p: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const rects = useMeasure(wrap, (el) => [...el.querySelectorAll('.bit')].map((b) => rectIn(b, el)));
  const slots = rects ? dividerSlots(rects) : [];
  const slot = slots[prefix];

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (slots.length) onPrefix(nearestSlot(slots, e.clientX - box.left, e.clientY - box.top));
  };
  const onKey = (e: KeyboardEvent) => {
    const to = DIVIDER_KEYS[e.key];
    if (!to) return;
    e.preventDefault();
    onPrefix(Math.max(0, Math.min(ADDRESS_BITS, to(prefix))));
  };

  return (
    <div
      ref={wrap}
      className="sc-strip"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
        handle.current?.focus();
      }}
      // keep the focus on the handle: a mousedown's default action would move it to <body>
      onMouseDown={(e) => e.preventDefault()}
      onPointerMove={(e) => dragging.current && pick(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <BitStrip bits={addressBits(addr)} groups={octetGroups(addr)} size="sm" toneOf={(i) => (i < prefix ? 'info' : 'violet')} ariaLabel={`${ipToString(addr)} in bits`} />
      {slot && (
        <div
          ref={handle}
          className="sc-divider"
          role="slider"
          tabIndex={0}
          aria-label="Prefix divider: network bits on the left, host bits on the right"
          aria-valuemin={0}
          aria-valuemax={ADDRESS_BITS}
          aria-valuenow={prefix}
          aria-valuetext={`/${prefix}: ${prefix} network bits, ${ADDRESS_BITS - prefix} host bits`}
          style={{ left: slot.x, top: slot.y - 6, height: slot.h + 12 }}
          onKeyDown={onKey}
        >
          <span className="sc-divider-tag">/{prefix}</span>
        </div>
      )}
    </div>
  );
}

function BitRow({ label, bits, toneOf, highlight, ariaLabel }: { label: ReactNode; bits: Bit[]; toneOf: (i: number) => Tone; highlight?: number[]; ariaLabel: string }) {
  return (
    <div className="sc-bitrow">
      <span className="sc-bitrow-label">{label}</span>
      <BitStrip bits={bits} groups={plainGroups} size="sm" toneOf={toneOf} highlight={highlight} highlightTone="bad" ariaLabel={ariaLabel} />
    </div>
  );
}

/** The membership test drawn as an AND: probe, mask, their AND, and the block's network to compare with. */
function Membership({ addr, prefix, probe, inside }: { addr: number; prefix: number; probe: number; inside: boolean }) {
  const net = networkOf(addr, prefix);
  const diff = firstDifference(net, prefix, probe);
  const ring = diff === null ? [] : [diff];
  const verdict: Tone = inside ? 'ok' : 'bad';
  return (
    <div className="sc-belong">
      <SectionTitle weight="regular" hint={inside ? 'inside' : 'outside'}>Does {ipToString(probe)} belong to {ipToString(net)}/{prefix}?</SectionTitle>
      <BitRow label={`address ${ipToString(probe)}`} bits={addressBits(probe)} toneOf={(i) => (i < prefix ? 'info' : 'violet')} ariaLabel="address bits" />
      <BitRow label={`AND mask ${ipToString(maskOf(prefix))}`} bits={addressBits(maskOf(prefix))} toneOf={() => 'muted'} ariaLabel="mask bits" />
      <BitRow label={<>= <b className={`sc-verdict tone-${verdict}`}>{ipToString(networkOf(probe, prefix))}</b></>} bits={andBits(probe, prefix)} toneOf={(i) => (i < prefix ? verdict : 'dim')} highlight={ring} ariaLabel="address AND mask" />
      <BitRow label={`network ${ipToString(net)}`} bits={addressBits(net)} toneOf={(i) => (i < prefix ? 'info' : 'dim')} highlight={ring} ariaLabel="network bits" />
      <p className={`sc-verdict-line tone-${verdict}`}>
        {inside ? `Same network bits: ${ipToString(probe)} is inside, reachable directly.` : `Network bit ${diff! + 1} differs (ringed): ${ipToString(probe)} is outside, so it goes via a router.`}
      </p>
    </div>
  );
}

// ── Split a block ───────────────────────────────────────────────────────

const MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equal blocks' },
  { value: 'teams', label: 'Teams (VLSM)' },
  { value: 'hand', label: 'By hand' },
];
/** Plain categories for the blocks; they never mean success or failure. */
const BLOCK_TONES: readonly Tone[] = ['amber', 'sky', 'pink', 'orange'];
const MAX_EQUAL_STEPS = 4;
const TEAM_NAMES = 'ABCDEFGH';

interface Drawn extends Block {
  tone: Tone;
  label?: string;
}

function SplitScene({ picker }: { picker: ReactNode }) {
  const [parent, setParent] = useState<Block>(() => {
    const r = known(parseCidr(DEFAULT_PARENT));
    return { net: r.addr, prefix: r.prefix };
  });
  const [parentDraft, setParentDraft] = useState(DEFAULT_PARENT);
  const [parentNote, setParentNote] = useState<string | null>(null);
  const [mode, setMode] = useState<SplitMode>('equal');
  const [into, setInto] = useState(26);
  const [teams, setTeams] = useState(() => known(parseTeams(DEFAULT_TEAMS)));
  const [teamsDraft, setTeamsDraft] = useState(DEFAULT_TEAMS);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Block[]>([]);
  const [handDraft, setHandDraft] = useState('192.168.1.32/26');
  const [handError, setHandError] = useState<string | null>(null);
  const setCaption = useSetCaption();

  const allocation = mode === 'teams' ? allocate(parent, teams) : null;
  const teamsMessage = teamsError ?? (allocation && !allocation.ok ? allocation.error : null);
  const drawn: Drawn[] =
    mode === 'equal'
      ? splitEqual(parent, into).map((b, i) => ({ ...b, tone: BLOCK_TONES[i % BLOCK_TONES.length] }))
      : mode === 'teams'
        ? allocation!.ok
          ? allocation!.value.map((b: Allocation) => ({ ...b, tone: BLOCK_TONES[b.team % BLOCK_TONES.length], label: `${TEAM_NAMES[b.team]} · ${b.hosts}` }))
          : []
        : placed.map((b, i) => ({ ...b, tone: BLOCK_TONES[i % BLOCK_TONES.length] }));

  useEffect(() => {
    const alloc = allocate(parent, teams);
    if (mode === 'equal') setCaption(equalCaption(parent, into), { quiet: true });
    else if (mode === 'teams') setCaption(alloc.ok ? teamsCaption(parent, alloc.value, teams) : <span className="hl bad">{alloc.error}</span>, { quiet: true });
    else setCaption(handCaption(parent, placed), { quiet: true });
  }, [mode, parent, into, teams, placed, setCaption]);

  const equalOptions = Array.from({ length: Math.min(MAX_EQUAL_STEPS, ADDRESS_BITS - parent.prefix) }, (_, k) => {
    const p = parent.prefix + 1 + k;
    return { value: p, label: `/${p}` };
  });

  const submitParent = () => {
    const r = parseCidr(parentDraft);
    if (!r.ok) return setParentNote(r.error);
    if (r.value.prefix === ADDRESS_BITS) return setParentNote("A /32 is one address: there's nothing to split.");
    const net = networkOf(r.value.addr, r.value.prefix);
    setParent({ net, prefix: r.value.prefix });
    setInto(Math.min(ADDRESS_BITS, r.value.prefix + 2));
    setPlaced([]);
    setHandError(null);
    setParentNote(net === r.value.addr ? null : `Host bits cleared: the block is ${ipToString(net)}/${r.value.prefix}.`);
  };
  const submitTeams = () => {
    const r = parseTeams(teamsDraft);
    if (!r.ok) return setTeamsError(r.error);
    setTeamsError(null);
    setTeams(r.value);
  };
  const add = () => {
    const r = parseCidr(handDraft);
    if (!r.ok) return setHandError(r.error);
    const placedResult = placeBlock(parent, placed, { net: r.value.addr, prefix: r.value.prefix });
    if (!placedResult.ok) return setHandError(placedResult.error);
    setHandError(null);
    setPlaced([...placed, placedResult.value].sort((a, b) => a.net - b.net));
  };

  const modeRow =
    mode === 'equal' ? (
      <Segmented label="Into" value={into} onChange={setInto} options={equalOptions} />
    ) : mode === 'teams' ? (
      <>
        <TextField label="Hosts per team" value={teamsDraft} onChange={setTeamsDraft} onEnter={submitTeams} width={150} maxLength={MAX_FIELD_CHARS * 2} spellCheck={false} />
        <Button onClick={submitTeams} disabled={!teamsDraft.trim()}>Allocate</Button>
        {teamsMessage && <Hint tone="muted" className="sc-error">{teamsMessage}</Hint>}
      </>
    ) : (
      <>
        <TextField label="Block" value={handDraft} onChange={setHandDraft} onEnter={add} width={170} maxLength={MAX_FIELD_CHARS} spellCheck={false} />
        <Button onClick={add} disabled={!handDraft.trim()}>Add</Button>
        <Button onClick={() => { setPlaced([]); setHandError(null); }} disabled={!placed.length}>Clear</Button>
        {handError && <Hint tone="muted" className="sc-error">{handError}</Hint>}
      </>
    );

  const used = drawn.reduce((s, b) => s + blockSize(b.prefix), 0);
  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Parent" value={blockToString(parent)} sub={`${count(blockSize(parent.prefix))} addresses`} />
          <Stat label="Blocks" value={drawn.length || NA} sub={`${count(used)} addresses used`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'blocks (one colour each, by turn)' },
            { color: 'var(--dim)', label: 'free space' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="How" value={mode} onChange={setMode} options={MODES} />
        </>,
        <>
          <TextField label="Parent block" value={parentDraft} onChange={setParentDraft} onEnter={submitParent} width={170} maxLength={MAX_FIELD_CHARS} spellCheck={false} />
          <Button onClick={submitParent} disabled={!parentDraft.trim()}>Set</Button>
          {parentNote && <Hint tone="muted" className="sc-error">{parentNote}</Hint>}
        </>,
        modeRow,
      ]}
    >
      <div className="stage-pad sc">
        <SectionTitle weight="regular" hint="to scale">{blockToString(parent)} from {ipToString(parent.net)} to {ipToString(blockEnd(parent))}</SectionTitle>
        <WideRegion minWidth={BAR_W} label="Address range: scroll sideways to see all of it">
          <RangeBar parent={parent} blocks={drawn} />
        </WideRegion>
        {drawn.length > 0 && (
          <div className="sc-table-wrap">
          <table className="data-table sc-blocks">
            <thead>
              <tr><th>Block</th><th>Range</th><th>Usable</th>{mode === 'teams' && <th>Team</th>}</tr>
            </thead>
            <tbody>
              {drawn.map((b) => {
                const info = blockInfo(b.net, b.prefix);
                return (
                  <tr key={blockToString(b)}>
                    <td><i className={`sc-swatch tone-${b.tone}`} />{blockToString(b)}</td>
                    <td>{ipToString(b.net)} – {ipToString(blockEnd(b))}</td>
                    <td>{count(info.usable)}</td>
                    {mode === 'teams' && <td>{b.label}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        <Hint block>{HONEST} Blocks must start on a multiple of their own size; that's what keeps routes summarisable.</Hint>
      </div>
    </StageFrame>
  );
}

const BAR_W = 560;
const BAR = { x: 8, y: 26, h: 38, w: BAR_W - 16 };
const LABEL_MIN_PX = 34;
const TICK_MIN_PX = 84;

/** The parent's address range as a to-scale bar, with each block drawn where it sits. */
function RangeBar({ parent, blocks }: { parent: Block; blocks: readonly Drawn[] }) {
  const size = blockSize(parent.prefix);
  const xOf = (a: number) => BAR.x + ((a - parent.net) / size) * BAR.w;
  const ticks: { x: number; text: string }[] = [{ x: xOf(parent.net), text: ipToString(parent.net) }];
  for (const b of blocks) {
    const x = xOf(b.net);
    if (x - ticks[ticks.length - 1].x >= TICK_MIN_PX && BAR.x + BAR.w - x >= TICK_MIN_PX) ticks.push({ x, text: ipToString(b.net) });
  }
  return (
    <svg className="sc-bar" viewBox={`0 0 ${BAR_W} 92`} width={BAR_W} role="img" aria-label={`Address range of ${blockToString(parent)}: ${blocks.map(blockToString).join(', ') || 'nothing carved out'}`}>
      <rect className="sc-bar-free" x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={6} />
      <text className="sc-bar-free-label" x={BAR.x + BAR.w / 2} y={BAR.y + BAR.h / 2 + 4}>{blocks.length ? '' : 'free'}</text>
      {blocks.map((b) => {
        const x = xOf(b.net);
        const w = Math.max(1, (blockSize(b.prefix) / size) * BAR.w);
        return (
          <g key={blockToString(b)} className={`sc-bar-block tone-${b.tone}`}>
            <rect x={x} y={BAR.y} width={w} height={BAR.h} rx={3} />
            {w >= LABEL_MIN_PX && <text x={x + w / 2} y={BAR.y + BAR.h / 2 + 4}>/{b.prefix}</text>}
          </g>
        );
      })}
      {ticks.map((t) => (
        <text key={t.text} className="sc-bar-tick" x={t.x} y={BAR.y - 8}>{t.text}</text>
      ))}
      <text className="sc-bar-tick is-end" x={BAR.x + BAR.w} y={BAR.y + BAR.h + 18}>{ipToString(blockEnd(parent))}</text>
    </svg>
  );
}
