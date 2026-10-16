import { useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { LogStream } from '../../components/LogStream';
import type { LogRow } from '../../components/logRows';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { mmioCaption } from './captions';
import {
  DEFAULT_ADDRESS, DEFAULT_SPACE, DEVICE_BASE, DEVICE_WINDOW_BYTES, MEM_MAX, PORT_MAX, REGISTERS, ROM_BASE, SLICES, SLICE_BYTES, access, deviceStatus, freshMachine, hex16, hex32, parseHex, regionOf, registerAddress,
  type Machine, type Outcome, type RegionKind, type Space,
} from './mmio';

const SPACE_OPTIONS = [{ value: 'mem' as const, label: 'Memory-mapped' }, { value: 'port' as const, label: 'Port-mapped' }];
const DEFAULT_VALUE = 0x01;

const REGION_TONE: Record<RegionKind, Tone> = { ram: 'sky', device: 'violet', rom: 'amber', unmapped: 'dim' };
const REGION_LABEL: Record<RegionKind, string> = { ram: 'RAM', device: 'device window (4 KB at the start)', rom: 'ROM', unmapped: 'nothing here' };
const sliceRegion = (s: number): RegionKind => regionOf(s * SLICE_BYTES);
const sliceOf = (addr: number) => Math.floor(addr / SLICE_BYTES);

const fmt = (space: Space, v: number) => (space === 'mem' ? hex32(v) : hex16(v));
const rulesFor = (space: Space) => (space === 'mem' ? { max: MEM_MAX, what: 'An address' } : { max: PORT_MAX, what: 'A port' });
const VALUE_RULES = { max: MEM_MAX, what: 'A value' };

const presets = (space: Space): { label: string; addr: number }[] => [
  ...REGISTERS.map((r) => ({ label: r.name, addr: registerAddress(r.name, space) })),
  ...(space === 'mem' ? [{ label: 'RAM 0x1000', addr: 0x1000 }, { label: 'ROM', addr: ROM_BASE }, { label: 'unmapped', addr: 0x5000_0000 }] : []),
];

const toneOf = (o: Outcome): Tone => (o.kind === 'unmapped' ? 'bad' : o.kind === 'cache' ? 'orange' : o.kind === 'device' || o.kind === 'port' ? 'violet' : 'muted');

export function MmioScene({ picker }: { picker: ReactNode }) {
  const [space, setSpace] = useState<Space>(DEFAULT_SPACE);
  const [cached, setCached] = useState(false);
  const [machine, setMachine] = useState<Machine>(freshMachine);
  const [addr, setAddr] = useState(DEFAULT_ADDRESS);
  const [addrText, setAddrText] = useState(hex32(DEFAULT_ADDRESS).slice(2));
  const [value, setValue] = useState(DEFAULT_VALUE);
  const [valueText, setValueText] = useState('01');
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Outcome | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);

  const reset = (nextSpace: Space) => {
    setSpace(nextSpace);
    const start = registerAddress('STATUS', nextSpace);
    setAddr(start);
    setAddrText(fmt(nextSpace, start).slice(2));
    setMachine(freshMachine());
    setLast(null);
    setRows([]);
    setError(null);
  };
  const choose = (a: number) => {
    setAddr(a);
    setAddrText(fmt(space, a).slice(2));
    setError(null);
  };
  const typeAddr = (text: string) => {
    setAddrText(text);
    const parsed = parseHex(text, rulesFor(space));
    if (parsed.ok) {
      setAddr(parsed.value);
      setError(null);
    } else setError(`${parsed.error} Keeping ${fmt(space, addr)}.`);
  };
  const typeValue = (text: string) => {
    setValueText(text);
    const parsed = parseHex(text, VALUE_RULES);
    if (parsed.ok) {
      setValue(parsed.value);
      setError(null);
    } else setError(`${parsed.error} Keeping ${hex32(value)}.`);
  };

  const run = (op: 'read' | 'write') => {
    const r = access(machine, { op, space, addr, value }, cached && space === 'mem');
    setMachine(r.m);
    setLast(r.out);
    const verb = space === 'mem' ? (op === 'read' ? 'load' : 'store') : op === 'read' ? 'in' : 'out';
    const shown = 'value' in r.out ? ` → ${hex32(r.out.value)}` : '';
    setRows((prev) => [...prev, { id: prev.length, at: `#${prev.length + 1}`, source: verb, sourceTone: toneOf(r.out), tone: toneOf(r.out) === 'bad' ? 'bad' : undefined, text: `${fmt(space, addr)}${op === 'write' ? ` ← ${hex32(value)}` : ''}${shown}: ${r.out.note}` }]);
  };

  const slice = sliceOf(addr);
  const cell = (r: number) => {
    const kind = sliceRegion(r);
    return { tone: REGION_TONE[kind], fill: kind === 'unmapped' ? ('outline' as const) : ('tint' as const), intensity: 0.4 };
  };

  return (
    <StageFrame
      height={420}
      intro={mmioCaption({ space, cached, machine, last })}
      introKey={[space, cached, machine, last]}
      stats={
        <Stats>
          <Stat label="Reads that reached the device" value={machine.deviceReads} color="var(--violet)" />
          <Stat label="Reads served by the cache" value={machine.cacheReads} color={machine.cacheReads > 0 ? 'var(--orange)' : undefined} sub={cached && space === 'mem' ? 'the device window is mapped cached' : 'the device window is uncached'} />
          <Stat label="Device says READY" value={deviceStatus(machine)} sub={machine.lastStatus === null ? 'no STATUS read yet' : `last STATUS read returned ${machine.lastStatus}`} color={machine.lastStatus !== null && machine.lastStatus !== deviceStatus(machine) ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'device register window', shape: 'square' },
            { color: 'var(--sky)', label: 'RAM', shape: 'square' },
            { color: 'var(--amber)', label: 'ROM', shape: 'square' },
            { color: 'var(--dim)', label: 'nothing mapped', shape: 'square' },
            { color: 'var(--hi)', label: 'the address you picked (ring)', shape: 'square' },
            { color: 'var(--bad)', label: 'a stale answer or a bus error', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="How the CPU names the device" value={space} onChange={reset} options={SPACE_OPTIONS} />
          {space === 'mem' && <Toggle label="Device window mapping" value={cached} onChange={setCached} off="Uncached" on="Cached" />}
        </>,
        <>
          <TextField label={space === 'mem' ? 'Address (hex)' : 'Port (hex)'} value={addrText} onChange={typeAddr} width={120} spellCheck={false} />
          <TextField label="Value (hex)" value={valueText} onChange={typeValue} width={100} spellCheck={false} />
          <Button variant="primary" onClick={() => run('read')}>{space === 'mem' ? 'Load (read)' : 'in (read)'}</Button>
          <Button onClick={() => run('write')}>{space === 'mem' ? 'Store (write)' : 'out (write)'}</Button>
          <Button onClick={() => reset(space)}>Reset the device</Button>
        </>,
        <>
          {presets(space).map((x) => <ChipButton key={x.label} tone="violet" on={addr === x.addr} onClick={() => choose(x.addr)}>{x.label}</ChipButton>)}
        </>,
      ]}
    >
      <div className="dma-stage stage-pad dma-mmio">
        <Box>
          <SectionTitle hint="16 slices of 256 MB; the number is where each slice starts. Click one to aim at its start">{space === 'mem' ? 'Physical address map' : 'Memory map (ports are not in it)'}</SectionTitle>
          <CellGrid
            rows={SLICES}
            cols={1}
            size={{ cell: 22 }}
            rowLabels={Array.from({ length: SLICES }, (_, s) => hex32(s * SLICE_BYTES))}
            rowSuffix={{ width: 190, render: (r) => REGION_LABEL[sliceRegion(r)] }}
            cell={cell}
            highlight={space === 'mem' ? [{ r: slice, c: 0, tone: 'hi' }] : []}
            onCellClick={space === 'mem' ? (r) => choose(r * SLICE_BYTES) : undefined}
            cellAriaLabel={(r) => `${hex32(r * SLICE_BYTES)}, ${REGION_LABEL[sliceRegion(r)]}`}
            ariaLabel="Physical address map in 16 slices"
          />
          <Hint tone="muted" block>
            {space === 'mem'
              ? `The device window is ${DEVICE_WINDOW_BYTES / 1024} KB at ${hex32(DEVICE_BASE)}: STATUS at +0, DATA at +4, CONTROL at +8.`
              : `Ports 0x0200 STATUS, 0x0201 DATA, 0x0202 CONTROL. An address typed here is a port number, not a memory address.`}
          </Hint>
        </Box>
        <Box>
          <SectionTitle hint="a STATUS read clears READY: a side effect, which is why the compiler must not skip or merge it">Access log</SectionTitle>
          <LogStream label="Accesses to the toy machine" rows={rows} maxHeight={170} follow max={40} empty="No access yet. Press Load twice with STATUS selected." />
          {error && <p className="dma-status" role="status">{error}</p>}
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">toy device, registers and addresses invented</Provenance>
          <Provenance kind="from-memory">x86 has separate in/out ports as well as memory-mapped I/O; many other architectures have only memory-mapped I/O (check your architecture manual)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
