import { useEffect, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { memoryCaption } from './captions';
import { INT_BYTES, makeWorld, memoryBytes, PAGE_BYTES, readLen, readPtr, sumArray, WINDOW_BYTES } from './memory';

const FIRST = { ptr: 0, len: 8 };
const BAD = { ptr: 65530, len: 4 };

/** Scene 3: JavaScript writes integers into linear memory, the module sums them, and moving ptr and len past the end traps. */
export function MemoryScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [world, setWorld] = useState(makeWorld);
  const [grows, setGrows] = useState(0);
  const [ptrText, setPtrText] = useState(String(FIRST.ptr));
  const [lenText, setLenText] = useState(String(FIRST.len));
  const [ptr, setPtr] = useState(FIRST.ptr);
  const [len, setLen] = useState(FIRST.len);
  const [windowStart, setWindowStart] = useState(0);
  const ptrParse = readPtr(ptrText);
  const lenParse = readLen(lenText);

  const setPair = (p: number, l: number) => {
    setPtrText(String(p));
    setLenText(String(l));
    setPtr(p);
    setLen(l);
    setWindowStart(Math.floor(p / WINDOW_BYTES) * WINDOW_BYTES);
  };
  const onPtr = (t: string) => {
    setPtrText(t);
    const p = readPtr(t);
    if (p.ok) setPtr(p.value);
  };
  const onLen = (t: string) => {
    setLenText(t);
    const p = readLen(t);
    if (p.ok) setLen(p.value);
  };

  const result = sumArray(world, ptr, len);
  const bytes = memoryBytes(world);
  const total = world.memory.buffer.byteLength;
  const maxWindow = Math.max(0, total - WINDOW_BYTES);
  const start = Math.min(windowStart, maxWindow);
  const shown = bytes.slice(start, start + WINDOW_BYTES);
  const detached = grows > 0;

  useEffect(() => {
    setCaption(memoryCaption({ ptr, len, result: result.engine, memoryLength: total, grows, firstLength: world.firstBuffer.byteLength }), { quiet: true });
  }, [setCaption, ptr, len, result.engine, total, world, grows]);

  const grow = () => {
    world.memory.grow(1);
    setGrows(grows + 1);
  };
  const regionTone = (i: number) => {
    const at = start + i;
    return at >= ptr && at < ptr + len * INT_BYTES ? ('info' as const) : undefined;
  };

  return (
    <StageFrame
      height={600}
      stats={
        <Stats>
          <Stat label={`sum_array(${ptr}, ${len})`} value={result.engine.ok ? String(result.engine.value) : result.engine.errorClass} color={result.engine.ok ? 'var(--ok)' : 'var(--bad)'} sub={result.engine.ok ? 'the real engine' : 'a trap: out-of-bounds load'} />
          <Stat label="Memory" value={`${total.toLocaleString('en-US')} bytes`} sub={`${total / PAGE_BYTES} page${total === PAGE_BYTES ? '' : 's'} of ${PAGE_BYTES.toLocaleString('en-US')}`} />
          <Stat label="The first view’s byteLength" value={detached ? world.firstBuffer.byteLength : total} color={detached ? 'var(--dim)' : undefined} sub={detached ? 'detached by memory.grow: make a fresh view' : 'still attached'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'the memory the call reads', shape: 'square' }, { color: 'var(--ok)', label: 'the real engine’s sum', shape: 'square' }, { color: 'var(--bad)', label: 'a trap', shape: 'square' }, { color: 'var(--dim)', label: 'a detached buffer', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Try" inline>
            <ChipButton tone="info" on={ptr === FIRST.ptr && len === FIRST.len} onClick={() => setPair(FIRST.ptr, FIRST.len)}>ptr 0, len 8</ChipButton>
            <ChipButton tone="orange" on={ptr === BAD.ptr && len === BAD.len} onClick={() => setPair(BAD.ptr, BAD.len)}>ptr 65530, len 4</ChipButton>
          </ControlGroup>
        </>,
        <>
          <TextField label="ptr" value={ptrText} onChange={onPtr} width={110} spellCheck={false} ariaLabel="ptr, 0 to 70,000" />
          <TextField label="len" value={lenText} onChange={onLen} width={80} spellCheck={false} ariaLabel="len, 0 to 64" />
          {!ptrParse.ok && <Hint tone="muted"><span role="alert">{ptrParse.error} Still using ptr {ptr}.</span></Hint>}
          {!lenParse.ok && <Hint tone="muted"><span role="alert">{lenParse.error} Still using len {len}.</span></Hint>}
        </>,
        <>
          <Slider label="Bytes shown from" value={start} min={0} max={maxWindow} step={WINDOW_BYTES} onChange={setWindowStart} />
          <Button onClick={grow}>Grow memory by one page</Button>
          <Button onClick={() => { setWorld(makeWorld()); setGrows(0); setPair(FIRST.ptr, FIRST.len); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="wa stage-pad">
        <Box variant="sunken">
          <SectionTitle hint={`16 bytes at a time, from address ${start}`}>Linear memory</SectionTitle>
          <ByteGrid bytes={shown} perRow={8} offsetBase={start} toneOf={regionTone} ariaLabel="A window onto linear memory" />
        </Box>
        <Hint tone="muted">Only numbers cross the boundary. JavaScript wrote sixteen 32-bit integers into memory through an Int32Array; strings and objects would have to be copied in as bytes first.</Hint>
        <ProvenanceRow>
          <Provenance kind="real">the sums, the trap and the grow all come from this browser’s own WebAssembly engine</Provenance>
          <Provenance kind="toy">the 95 bytes were assembled by hand; a trap shows its error class, not an engine-specific message</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
