import type { ReactNode } from 'react';
import { bytes as fmtBytes } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { BASE, hex, signedHex, type Input, type LinkResult, type Mode } from './link';
import type { Binding, LoadPlan, LoadStep } from './load';
import { FILE_SIZE, inputName } from './presets';

export interface Arrow {
  /** The object whose socket it leaves from. */
  from: string;
  symbol: string;
  /** The card (input index) it lands on, and the object there that defines it. */
  toObj: string;
}

export interface LinkFrame extends Frame {
  /** The input being read now (null before and after the scan). */
  input: number | null;
  /** Inputs read so far, and which archive members were pulled in. */
  read: number[];
  pulled: string[];
  skipped: number[];
  arrows: Arrow[];
  /** The socket being resolved this step. */
  current: { obj: string; symbol: string }[];
  /** Symbols reported undefined, and duplicate definitions (first and second file). */
  undefinedSyms: string[];
  duplicate: { symbol: string; first: string; second: string } | null;
  /** Console lines shown so far. */
  messages: string[];
  laidOut: boolean;
  patched: number;
  done: boolean;
}

const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const codeList = (xs: readonly string[]) => xs.map((x, i) => <span key={x}>{i ? (i === xs.length - 1 ? ' and ' : ', ') : ''}<code>{x}</code></span>);

/** Step through ld's work, from the events and the result the pure linker produced. */
export function linkFrames(inputs: readonly Input[], r: LinkResult, mode: Mode): LinkFrame[] {
  const rec = createRecorder<LinkFrame>(
    { input: null, read: [], pulled: [], skipped: [], arrows: [], current: [], undefinedSyms: [], duplicate: null, messages: [], laidOut: false, patched: 0, done: false },
    { transient: { current: [] } },
  );
  const libc = inputName(inputs.at(-1)!);
  rec.snap(
    <>gcc runs the linker, ld, over {codeList(inputs.slice(0, -1).map(inputName))}, then adds <code>-lc</code> ({libc}) at the end. ld reads them left to right.</>,
    1.4,
  );
  /** Who defines each symbol so far (object name), for arrows from later sockets. */
  const definer = new Map<string, string>();
  /** Sockets still open: symbol → objects that need it. */
  const open = new Map<string, string[]>();
  const arrowsFor = (symbol: string, toObj: string) => (open.get(symbol) ?? []).map((from) => ({ from, symbol, toObj }));

  const state = () => rec.get();
  for (const e of r.events) {
    if (e.k === 'read' || e.k === 'pull') {
      const obj = e.k === 'read' ? inputName(inputs[e.input]) : e.member;
      const fresh: Arrow[] = [];
      for (const s of e.resolved) {
        fresh.push(...arrowsFor(s, obj));
        open.delete(s);
      }
      for (const s of e.defines) if (!definer.has(s)) definer.set(s, obj);
      const already = e.needs.filter((s) => definer.has(s) && definer.get(s) !== obj);
      for (const s of already) fresh.push({ from: obj, symbol: s, toObj: definer.get(s)! });
      const stillOpen = e.needs.filter((s) => !definer.has(s));
      for (const s of stillOpen) open.set(s, [...(open.get(s) ?? []), obj]);
      const where = e.k === 'read' ? <>Read <code>{obj}</code></> : <>Search <code>{inputName(inputs[e.input])}</code>: its member <code>{obj}</code> defines {codeList(e.resolved)}, which {e.resolved.length > 1 ? 'are' : 'is'} undefined, so ld pulls it in</>;
      rec.snap(
        <>
          {where}. {e.k === 'read' && <>It defines {codeList(e.defines)}. </>}
          {e.resolved.length > 0 && e.k === 'read' && <>That resolves {codeList(e.resolved)} for {list([...new Set(fresh.filter((a) => e.resolved.includes(a.symbol)).map((a) => a.from))])}. </>}
          {already.length > 0 && <>It needs {codeList(already)}, already defined. </>}
          {stillOpen.length > 0 ? <>It needs {codeList(stillOpen)}: nothing defines {stillOpen.length > 1 ? 'them' : 'it'} yet, so {stillOpen.length > 1 ? 'they stay' : 'it stays'} undefined.</> : already.length === 0 && <>It needs nothing from other files.</>}
        </>,
        1.4,
        {
          input: e.input,
          read: [...new Set([...state().read, e.input])],
          pulled: e.k === 'pull' ? [...state().pulled, obj] : state().pulled,
          arrows: [...state().arrows, ...fresh],
          current: fresh.map((a) => ({ obj: a.from, symbol: a.symbol })),
        },
      );
    } else if (e.k === 'skip') {
      rec.snap(
        <>Search <code>{inputName(inputs[e.input])}</code>: {e.why}. ld moves on and never comes back to this archive.</>,
        1.4,
        { input: e.input, read: [...state().read, e.input], skipped: [...state().skipped, e.input] },
      );
    } else if (e.k === 'shared') {
      const fresh = e.resolved.flatMap((s) => arrowsFor(s, inputName(inputs[e.input])));
      for (const s of e.resolved) open.delete(s);
      rec.snap(
        e.resolved.length ? (
          <>
            <code>{inputName(inputs[e.input])}</code> exports {codeList(e.resolved)}. ld resolves {e.resolved.length > 1 ? 'them' : 'it'} to a PLT stub in the program and records{' '}
            <code>NEEDED {inputName(inputs[e.input])}</code>: the code itself stays in the shared library, for the loader to map at run time.
          </>
        ) : (
          <><code>{inputName(inputs[e.input])}</code>: nothing still undefined is something it exports.</>
        ),
        1.4,
        { input: e.input, read: [...state().read, e.input], arrows: [...state().arrows, ...fresh], current: fresh.map((a) => ({ obj: a.from, symbol: a.symbol })) },
      );
    } else if (e.k === 'duplicate') {
      const second = inputName(inputs[e.input]);
      rec.snap(
        <><code>{second}</code> defines <code>{e.symbol}</code> again: a multiple definition. The first one, in <code>{e.first}</code>, is orange, and the clash in <code>{second}</code> is red. ld will report it at the end, after reading the rest, and the link will fail.</>,
        1.6,
        { input: e.input, read: [...state().read, e.input], duplicate: { symbol: e.symbol, first: e.first, second } },
      );
    }
  }

  const undefinedSyms = [...new Set(r.events.filter((e) => e.k === 'undefined').map((e) => (e as { symbol: string }).symbol))];
  if (!r.ok) {
    rec.snap(
      undefinedSyms.length ? (
        <>End of the command line, and {codeList(undefinedSyms)} {undefinedSyms.length > 1 ? 'are' : 'is'} still undefined: an undefined reference. ld prints where each one is used and writes no program.</>
      ) : (
        <>End of the command line. Every symbol has a definition, but one has two, so the link fails and no program is written.</>
      ),
      2,
      { input: null, undefinedSyms, messages: r.messages },
    );
    rec.set({ done: true });
    rec.close(<>The link failed: {r.messages.at(-2)}. Fix the command line and link again.</>, 2);
    return rec.frames;
  }

  const textStart = r.layout.find((p) => p.section === '.text')!.addr;
  rec.snap(
    <>
      Every symbol is resolved. ld lays out the sections: {r.plt.length > 0 && <><code>.plt</code> at {hex(BASE.text)}, </>}<code>.text</code> from {hex(textStart)},{' '}
      <code>.rodata</code> at {hex(BASE.rodata)} and {r.plt.length > 0 && <><code>.got.plt</code> then </>}<code>.data</code> at {hex(BASE.data)}. Now every symbol has an address.
    </>,
    1.6,
    { input: null, laidOut: true },
  );
  r.patches.forEach((p, i) => {
    rec.snap(
      <>
        Patch <code>{p.obj}</code> <code>{p.reloc.section}+{hex(p.reloc.offset)}</code> ({p.reloc.what}): S + A − P = {hex(p.S)} + ({signedHex(p.reloc.addend)}) − {hex(p.P)} ={' '}
        {signedHex(p.value)}, written as {p.bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}.{p.viaPlt && ' S is the PLT stub, not printf itself.'}
      </>,
      1.6,
      { patched: i + 1 },
    );
  });
  rec.set({ done: true });
  rec.close(
    mode === 'dynamic' ? (
      <>Linked: <code>app</code>, about {fmtBytes(FILE_SIZE.dynamic, { base: 1000, dp: 0 })} (illustrative). printf&apos;s code is not in it: the loader maps <code>{r.needed.join(', ')}</code> when it runs.</>
    ) : (
      <>Linked: <code>app</code>, about {fmtBytes(FILE_SIZE.static, { base: 1000, dp: 0 })} (illustrative): printf, and the libc code it relies on, was copied in from <code>libc.a</code>.</>
    ),
    2,
  );
  return rec.frames;
}

/* ---------- loading ---------- */

export interface LoadFrame extends Frame {
  step: LoadStep;
}

const loadCaption = (s: LoadStep, plan: LoadPlan, mode: Mode, binding: Binding): ReactNode => {
  const libc = s.regions.find((g) => g.label === 'libc.so.6');
  switch (s.phase) {
    case 'exec':
      return (
        <>
          Run <code>./app</code>: the kernel reads the program headers and maps each segment with its permissions: headers r--, code r-x, read-only data r--, data rw-.
          It&apos;s <code>-no-pie</code>, so they land where ld put them. The stack goes at a random address (ASLR).
          {mode === 'static' && ' There is no interpreter, so it starts at the program\'s own entry point, _start (start-up code from crt1.o, left out of this simplified link).'}
        </>
      );
    case 'interp':
      return <>The program names an interpreter (<code>PT_INTERP</code>): <code>/lib64/ld-linux-x86-64.so.2</code>. The kernel maps it and starts running there, not at main.</>;
    case 'needed':
      return <>ld.so reads <code>NEEDED libc.so.6</code>, finds the file and maps it at a random address, {hex(libc!.from)} this run: ASLR. printf is at {hex(plan.printf)}.</>;
    case 'bind':
      return <><code>-z now</code>: ld.so looks printf up in libc.so.6 right away and writes {hex(plan.printf)} into <code>GOT[printf]</code>, before main runs.</>;
    case 'main':
      return mode === 'static' ? (
        <>The start-up code (<code>_start</code>, not shown) calls main, which calls <code>area(3, 4)</code>. Its call to printf is a direct call to code inside the program itself.</>
      ) : binding === 'lazy' ? (
        <>ld.so hands over to the program&apos;s start-up code, which calls main, then <code>area(3, 4)</code>. <code>GOT[printf]</code> still points back into <code>printf@plt</code>: nobody has looked printf up yet (lazy binding).</>
      ) : (
        <>ld.so hands over to the program&apos;s start-up code, which calls main, then <code>area(3, 4)</code>. <code>GOT[printf]</code> already holds printf&apos;s address.</>
      );
    case 'firstCall':
      return binding === 'lazy' ? (
        <>area calls <code>printf@plt</code>, which jumps through <code>GOT[printf]</code>. The first time, that leads to ld.so&apos;s resolver: it looks printf up, writes {hex(plan.printf)} into the slot and jumps there.</>
      ) : (
        <>area calls <code>printf@plt</code>, which jumps through <code>GOT[printf]</code> straight to printf in libc.so.6.</>
      );
    case 'printed': {
      const heap = s.regions.find((g) => g.label.endsWith('heap'));
      return (
        <>
          printf prints <code>{s.output.at(-1)}</code>. In glibc the first write to stdout allocates its buffer with malloc, so the heap appears, at {hex(heap!.from)} this run.
          {mode === 'dynamic' && binding === 'lazy' && ' Any later call to printf would jump straight through the GOT, no resolver.'}
        </>
      );
    }
  }
};

export function loadFrames(plan: LoadPlan, mode: Mode, binding: Binding): LoadFrame[] {
  return plan.steps.map((step) => ({ step, say: loadCaption(step, plan, mode, binding), hold: 1.6 }));
}
