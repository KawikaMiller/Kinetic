import { useMemo, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { parseBoundedBigInt } from '../../core/parse';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { FLAT_TEXT, allocatedText, n } from './captions';
import { walkFrames } from './frames';
import {
  DEFAULT_MAPPINGS, LEVELS, PAGE_NAMES, PAGE_SIZES, canonicalise, hex, mappingCovering, spaceFor, walk, walkOpening, type AddressChoice, type PageSize,
} from './paging';

const FIELD = {
  min: 0n,
  max: (1n << 64n) - 1n,
  prefixes: ['hex'] as const,
  plainRadix: 16 as const,
  underscores: true,
  spaces: true,
  messages: {
    empty: 'Type a hex address (up to 16 digits).',
    invalid: (typed: string) => `"${typed}" is not a hex address: use the digits 0-9 and a-f.`,
    tooBig: () => 'That is more than 16 hex digits (64 bits).',
  },
};
const FIELD_TONES: Tone[] = ['orange', 'amber', 'pink', 'sky'];
const SIZE_OPTIONS = PAGE_SIZES.map((s) => ({ value: s, label: PAGE_NAMES[s] }));
const BITS = 48;
const FIELD_WIDTH = 9;

const bitsOf = (va: bigint): (0 | 1)[] => Array.from({ length: BITS }, (_, i) => (Number((va >> BigInt(BITS - 1 - i)) & 1n) as 0 | 1));

export function WalkScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(walkOpening);
  const [address, setAddress] = useState(open.address);
  const [typed, setTyped] = useState(hex(open.address));
  const [choice, setChoice] = useState<AddressChoice>(open.choice);
  const [error, setError] = useState<string | null>(null);

  const covering = useMemo(() => mappingCovering(DEFAULT_MAPPINGS, address), [address]);
  const space = useMemo(() => spaceFor(address, choice), [address, choice]);
  const result = useMemo(() => walk(space, address), [space, address]);
  const frames = useMemo(() => walkFrames(result, space.tables.length), [result, space]);
  const player = usePlayer(frames, { interval: 800 });
  const read = player.frame.read;
  const sizeShown: PageSize = choice.size ?? covering?.size ?? 'p4k';

  const commit = (text: string) => {
    const parsed = parseBoundedBigInt(text, FIELD);
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setAddress(parsed.value);
    setTyped(hex(parsed.value));
    setChoice({ size: null, unmapped: false });
  };
  const pick = (va: bigint) => {
    setAddress(va);
    setTyped(hex(va));
    setError(null);
    setChoice({ size: null, unmapped: false });
  };

  const walkSize = result.ok ? result.size : sizeShown;
  const leafBits = walkSize === 'p4k' ? 12 : walkSize === 'p2m' ? 21 : 30;
  const toneOf = (i: number): Tone => {
    const bitIndex = BITS - 1 - i;
    if (bitIndex < leafBits) return 'violet';
    return FIELD_TONES[Math.floor(i / FIELD_WIDTH)];
  };

  return (
    <StageFrame
      player={player}
      height={520}
      minWidth={420}
      stats={
        <Stats>
          <Stat label="Memory references" value={n(Math.min(read, result.memoryRefs))} color="var(--hi)" sub={`of ${n(result.memoryRefs)} for this address`} />
          <Stat label="Tables allocated" value={n(space.tables.length)} sub={allocatedText(space.tables.length)} />
          <Stat label="A flat table would need" value={FLAT_TEXT} color="var(--bad)" sub="2^36 entries x 8 bytes, computed" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'PML4 index', shape: 'square' },
            { color: 'var(--amber)', label: 'PDPT index', shape: 'square' },
            { color: 'var(--pink)', label: 'PD index', shape: 'square' },
            { color: 'var(--sky)', label: 'PT index', shape: 'square' },
            { color: 'var(--violet)', label: 'offset, untranslated', shape: 'square' },
            { color: 'var(--ok)', label: 'entry present', shape: 'square' },
            { color: 'var(--bad)', label: 'not present or not canonical', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Virtual address (hex)" value={typed} onChange={setTyped} onEnter={() => commit(typed)} onBlur={() => commit(typed)} width={230} spellCheck={false} />
        </>,
        <>
          <ControlGroup label="Mapped pages" inline>
            {DEFAULT_MAPPINGS.map((m) => (
              <ChipButton key={m.va.toString()} tone="info" on={address === m.sample} onClick={() => pick(m.sample)}>{`${PAGE_NAMES[m.size]} ${hex(m.sample).slice(0, 12)}`}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        ...(covering
          ? [
              <>
                <Segmented label="Page size at this address" value={sizeShown} onChange={(size) => setChoice((c) => ({ ...c, size }))} options={SIZE_OPTIONS} />
                <Toggle label="Entry" value={!choice.unmapped} onChange={(on) => setChoice((c) => ({ ...c, unmapped: !on }))} off="Unmapped" on="Mapped" />
              </>,
            ]
          : []),
      ]}
    >
      <div className="ptt-stage stage-pad">
        <Box>
          <SectionTitle hint={`bits 63-48: ${hex((address >> 48n) & 0xffffn, 4)}${(address >> 48n) === (canonicalise(address) >> 48n) ? ' (copies bit 47)' : ' (should copy bit 47)'}`}>The address, split</SectionTitle>
          <BitStrip
            bits={bitsOf(address)}
            size="sm"
            toneOf={toneOf}
            groups={[
              { from: 0, to: 8, tone: 'orange', label: 'PML4' },
              { from: 9, to: 17, tone: 'amber', label: 'PDPT' },
              { from: 18, to: 26, tone: leafBits > 21 ? 'violet' : 'pink', label: leafBits > 21 ? 'offset' : 'PD' },
              { from: 27, to: 35, tone: leafBits > 12 ? 'violet' : 'sky', label: leafBits > 12 ? 'offset' : 'PT' },
              { from: 36, to: 47, tone: 'violet', label: 'offset' },
            ]}
            ariaLabel={`Virtual address ${hex(address)} as 48 bits`}
          />
          {error && <p className="ptt-refused" role="alert">{error} The old address is kept.</p>}
        </Box>
        <div className="ptt-walk" role="list" aria-label="The four table reads">
          {LEVELS.map((l, k) => {
            const step = result.steps[k];
            const reached = !!step && k < read;
            const state = reached ? (step.state === 'absent' ? 'bad' : 'ok') : step ? 'next' : 'idle';
            return (
              <div key={l.level}>
                {k > 0 && <p className="ptt-then" aria-hidden="true">then</p>}
                <div role="listitem" className={`ptt-row is-${state}${reached && k === read - 1 ? ' is-now' : ''}`}>
                  <b>{l.name}</b>
                  {step ? (
                    <span>
                      table {hex(step.table)}, index {step.index} ({hex(BigInt(step.index))}), entry at {hex(step.entryAddress)}
                      {reached ? (step.state === 'absent' ? ': not present, page fault' : step.state === 'page' ? `: frame ${hex(step.target! >> 12n)}, walk ends` : `: next table ${hex(step.target!)}`) : ''}
                    </span>
                  ) : (
                    <span>{result.ok || result.reason === 'not-present' ? 'not read: the walk ended above' : 'not read: the address is not canonical'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {result.ok ? (
          <p className="ptt-result is-ok">physical address {hex(result.physical)} = frame {hex(result.frame)} x 4096 + the {n(result.offsetBits)}-bit offset</p>
        ) : result.reason === 'not-canonical' ? (
          <p className="ptt-result is-bad">not canonical: bits 63-48 must copy bit 47; the canonical spelling of this 48-bit address is {hex(canonicalise(address & ((1n << 48n) - 1n)))}</p>
        ) : (
          <p className="ptt-result is-bad">page fault at the {result.steps[result.steps.length - 1].name} level: the entry is not present</p>
        )}
        {!covering && result.ok === false && result.reason === 'not-present' && <Hint tone="muted" block>No page is mapped here, so the controls for the mapping are not shown. An unmapped address is valid input: it walks to a fault.</Hint>}
        <Hint tone="muted" block>
          Each table is 4 KiB holding 512 eight-byte entries, and a table exists only where something is mapped. A 2 MiB page ends the walk at the PD (three references, 21 offset bits), a 1 GiB page at the PDPT (two references, 30 bits).
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">x86-64-style, with the present and frame fields only; real entries carry permission, accessed and dirty bits</Provenance>
          <Provenance kind="simulated" seed={2718}>about a dozen mappings from a seeded layout</Provenance>
          <Provenance kind="from-memory">5-level paging (LA57) adds one level, and the canonical-address rule is as on x86-64; verify against the Intel SDM or AMD APM paging chapters</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
