import { useState } from 'react';
import { ArrayStrip, type ArrayCellState } from '../components/ArrayStrip';
import { BitStrip } from '../components/BitStrip';
import { CodePanel } from '../components/CodePanel';
import { HeapObject, heapFieldPort, heapRect, RefArrow, slotPort, VarSlot } from '../components/memory';
import { ResizablePane } from '../components/ResizablePane';
import { TruthTable } from '../components/TruthTable';
import { Button, TextArea } from '../components/ui';
import { usePageHeading } from '../components/usePageHeading';
import { chunkGroups, flipBit, fromBits, toBits, type Bit } from '../core/bits';
import { linearScale, logScale } from '../core/scale';
import { truthRowIndex } from '../core/truth';
import './DevKit.css';
import { DevKitSection as Section } from './DevKitSection';
import { DevKitTier2 } from './DevKitTier2';
import { DevKitTier2b } from './DevKitTier2b';
import { DevKitTier2c } from './DevKitTier2c';
import { DevKitTier3 } from './DevKitTier3';
import { DevKitTier3b } from './DevKitTier3b';
import { DevKitTier3c } from './DevKitTier3c';
import { DevKitTier3d } from './DevKitTier3d';
import { DevKitTier3e } from './DevKitTier3e';
import { DevKitTier3f } from './DevKitTier3f';

/**
 * Dev-only showcase of the Tier 1 shared components (#/dev/kit). Not linked from
 * the app and not included in production builds (see App.tsx).
 */
export function DevKit() {
  const heading = usePageHeading('Shared kit showcase');
  return (
    <div className="lesson devkit">
      <h1 ref={heading} tabIndex={-1}>
        Shared kit showcase
      </h1>
      <p className="muted">Dev only. Each block drives one shared component with realistic lesson data.</p>
      <Section title="BitStrip · 16-bit register with nibble brackets">
        <RegisterDemo />
      </Section>
      <Section title="BitStrip · float32 groups, UTF-8 prefix tones, rwx labels">
        <FloatDemo />
      </Section>
      <Section title="TruthTable · half adder, current row and a mismatch">
        <TruthDemo />
      </Section>
      <Section title="Memory kit · stack slots, heap objects, references">
        <MemoryDemo />
      </Section>
      <Section title="ArrayStrip · two pointers and a sliding window">
        <ArrayDemo />
      </Section>
      <Section title="ResizablePane · drag or use ←/→">
        <ResizeDemo />
      </Section>
      <Section title="CodePanel · click a line to toggle a breakpoint (renderLine + onLineClick)">
        <CodeDemo />
      </Section>
      <Section title="TextArea + core/scale">
        <TextAndScaleDemo />
      </Section>
      <DevKitTier2 />
      <DevKitTier2b />
      <DevKitTier2c />
      <DevKitTier3 />
      <DevKitTier3b />
      <DevKitTier3c />
      <DevKitTier3d />
      <DevKitTier3e />
      <DevKitTier3f />
    </div>
  );
}


function RegisterDemo() {
  const [bits, setBits] = useState<Bit[]>(() => toBits(0x2a7f, 16));
  const hex = (from: number, to: number) => fromBits(bits.slice(from, to + 1)).toString(16).toUpperCase();
  return (
    <>
      <BitStrip
        bits={bits}
        onToggle={(i) => setBits((b) => flipBit(b, i))}
        placeValues
        groups={chunkGroups(16, 4, { tone: 'violet', label: (_, from, to) => hex(from, to) })}
        toneOf={() => 'hi'}
        highlight={[15]}
        ariaLabel="16-bit register"
      />
      <p className="mono">
        {fromBits(bits)} = 0x{fromBits(bits).toString(16).toUpperCase()} = 0o{fromBits(bits).toString(8)}
      </p>
      <Button onClick={() => setBits((b) => toBits(fromBits(b) + 1, 16))}>+1</Button>
    </>
  );
}

function FloatDemo() {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, 0.1);
  const float = toBits(view.getUint32(0), 32);
  const utf8 = [...new TextEncoder().encode('é')].flatMap((byte) => toBits(byte, 8));
  const prefixLen = (byteIndex: number) => (byteIndex === 0 ? 3 : 2); // 110xxxxx 10xxxxxx
  const rwx = toBits(0o754, 9);
  return (
    <>
      <BitStrip
        bits={float}
        size="sm"
        groups={[
          { from: 0, to: 0, tone: 'bad', label: 'sign' },
          { from: 1, to: 8, tone: 'info', label: 'exponent' },
          { from: 9, to: 16, tone: 'violet', label: 'mantissa' },
          { from: 17, to: 24, tone: 'violet' },
          { from: 25, to: 31, tone: 'violet' },
        ]}
        ariaLabel="0.1 as float32"
      />
      <BitStrip
        bits={utf8}
        groups={chunkGroups(utf8.length, 8, { label: (i) => `byte ${i}` })}
        toneOf={(i) => ((i % 8) < prefixLen(Math.floor(i / 8)) ? 'dim' : 'info')}
        ariaLabel="é in UTF-8"
      />
      <BitStrip
        bits={rwx}
        size="lg"
        labelOf={(i) => 'rwx'[i % 3]}
        groups={chunkGroups(9, 3, { tone: 'hi', label: (i) => ['user', 'group', 'other'][i] })}
        ariaLabel="chmod 754"
      />
    </>
  );
}

function TruthDemo() {
  const [inputs, setInputs] = useState({ A: true, B: false });
  const vars = ['A', 'B'];
  return (
    <TruthTable
      vars={vars}
      format="10"
      trueTone="hi"
      currentTone="info"
      columns={[
        { label: 'sum (XOR)', fn: (r) => r.A !== r.B },
        { label: 'carry (AND)', fn: (r) => r.A && r.B },
        { label: 'A OR B', fn: (r) => r.A || r.B },
      ]}
      currentRow={truthRowIndex(vars, inputs)}
      mismatchRows={[1, 2]}
      onRowClick={(row) => setInputs({ A: row.A, B: row.B })}
    />
  );
}

function MemoryDemo() {
  const [freed, setFreed] = useState(false);
  const user = { x: 250, y: 20 };
  const tags = { x: 250, y: 120 };
  return (
    <>
      <svg viewBox="0 0 520 210" width="100%" style={{ maxWidth: 560 }}>
        <VarSlot at={{ x: 10, y: 30 }} name="count" value={3} tone="info" />
        <VarSlot at={{ x: 10, y: 70 }} name="a" isRef tone="violet" highlight />
        <VarSlot at={{ x: 10, y: 110 }} name="b" isRef tone="violet" />
        <VarSlot at={{ x: 10, y: 150 }} name="old" value="…" dead />
        <HeapObject at={user} w={180} title="{ } user" fields={[{ name: 'name', value: '"Ada"' }, { name: 'tags', isRef: true }]} />
        <HeapObject at={tags} w={180} title="[ ] array" fields={[{ name: '0', value: '"admin"' }]} variant={freed ? 'freed' : 'live'} />
        <HeapObject at={{ x: 450, y: 150 }} w={60} title="{ }" fields={[]} variant="collectable" tag="GC" />
        <RefArrow from={slotPort({ x: 10, y: 70 })} to={heapRect(user, 180, 2)} bend={-12} />
        <RefArrow from={slotPort({ x: 10, y: 110 })} to={heapRect(user, 180, 2)} bend={12} />
        <RefArrow from={heapFieldPort(user, 180, 1)} to={heapRect(tags, 180, 1)} bend={-30} dangling={freed} />
      </svg>
      <Button onClick={() => setFreed((f) => !f)}>{freed ? 'Re-allocate' : 'free(tags)'}</Button>
    </>
  );
}

function ArrayDemo() {
  const values = [1, 3, 4, 6, 8, 11, 13, 15, 18];
  const [l, setL] = useState(0);
  const [r, setR] = useState(values.length - 1);
  const state = (i: number): ArrayCellState => (i === l || i === r ? 'active' : i < l || i > r ? 'dim' : 'idle');
  const letters = 'abcabcbb'.split('');
  return (
    <>
      <ArrayStrip
        values={values}
        cellState={state}
        pointers={[
          { i: l, label: 'L', tone: 'info' },
          { i: r, label: 'R', tone: 'violet' },
        ]}
        ranges={[{ from: l, to: r }]}
        showIndex
        cellMax={56}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => setL((v) => Math.min(v + 1, r))}>L →</Button>
        <Button onClick={() => setR((v) => Math.max(v - 1, l))}>← R</Button>
        <Button onClick={() => (setL(0), setR(values.length - 1))}>Reset</Button>
      </div>
      <ArrayStrip
        values={letters}
        cellState={(i) => (i === 3 ? 'done' : i === 0 ? 'bad' : 'idle')}
        ranges={[
          { from: 1, to: 3, tone: 'hi' },
          { from: 0, to: 2, tone: 'violet', labels: ['best', ''] },
        ]}
        onCellClick={() => {}}
        cellMax={48}
        className="devkit-labelled"
      />
    </>
  );
}

function ResizeDemo() {
  const [w, setW] = useState(640);
  return (
    <ResizablePane min={320} max={1440} value={w} onChange={setW} label="Device width" height={120}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="cell" style={{ flex: '1 1 140px', padding: 10 }}>
            card {i + 1}
          </div>
        ))}
      </div>
    </ResizablePane>
  );
}

function TextAndScaleDemo() {
  const [text, setText] = useState('203.0.113.9 - - [10/Oct] "GET /api/users HTTP/1.1" 500\n198.51.100.4 - - [10/Oct] "GET / HTTP/1.1" 200');
  const lin = linearScale(0, 1, 0, 300);
  const lg = logScale(1e-9, 1e-1, 0, 300);
  return (
    <>
      <TextArea label="Test text" value={text} onChange={setText} rows={3} />
      <p className="mono">linear ticks: {lin.ticks(5).join(', ')} · log ticks: {lg.ticks(9).map((t) => t.toExponential(0)).join(', ')}</p>
      <p className="mono">log map(1e-5) = {lg.map(1e-5).toFixed(1)}px (midpoint of 300)</p>
    </>
  );
}

const DEMO_CODE = ['function total(items) {', '  let sum = 0;', '  for (const x of items) sum += x.price;', '  return sum;', '}'];

function CodeDemo() {
  const [breakpoints, setBreakpoints] = useState<number[]>([2]);
  const toggle = (i: number) => setBreakpoints((b) => (b.includes(i) ? b.filter((x) => x !== i) : [...b, i]));
  return (
    <CodePanel
      lines={DEMO_CODE}
      active={2}
      onLineClick={toggle}
      pressed={(i) => breakpoints.includes(i)}
      lineLabel={(i) => `Line ${i + 1}: ${breakpoints.includes(i) ? 'remove' : 'add'} breakpoint`}
      renderLine={(line, i) => (breakpoints.includes(i) ? <><span className="devkit-bp">●</span> {line}</> : line)}
    />
  );
}