import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { cpi, DEPTH, firstCycle, pipeline, run, unpipelined, type CycleEvent, type Instr, type Machine, type PipelineOptions, type PipelineResult, type Row } from './model';

export interface PipeFrame extends Frame {
  /** Cycles shown so far: 0 = nothing fetched yet. */
  cycle: number;
}

export interface PipeRun {
  pipelined: boolean;
  rows: Row[];
  totalCycles: number;
  committed: number;
  /** null when not pipelined. */
  result: PipelineResult | null;
  /** The same program not pipelined, for the side-by-side count. */
  unpipelinedCycles: number;
}

export function simulate(program: readonly Instr[], start: Machine, opts: PipelineOptions, pipelined: boolean): PipeRun {
  const flat = unpipelined(program, start);
  if (!pipelined) return { pipelined, rows: flat.rows, totalCycles: flat.totalCycles, committed: flat.rows.length, result: null, unpipelinedCycles: flat.totalCycles };
  const r = pipeline(program, start, opts);
  return { pipelined, rows: r.rows, totalCycles: r.totalCycles, committed: r.committed, result: r, unpipelinedCycles: flat.totalCycles };
}

/** Fetch-to-write-back span of each completed instruction, in cycles. */
export function latencies(run: PipeRun): number[] {
  return run.rows.filter((r) => r.traceIndex !== null).map((r) => firstCycle(r, 'WB')! - firstCycle(r, 'IF')! + 1);
}

function cycleSay(run: PipeRun, program: readonly Instr[], c: number, ev: CycleEvent[], opts: PipelineOptions): ReactNode {
  const name = (row: number) => <code>{program[run.rows[row].pc].op}</code>;
  const parts: ReactNode[] = [];
  for (const e of ev) {
    if (e.kind === 'flush') {
      parts.push(
        <>
          {name(e.branchRow)} finished EX last cycle: <span className="hl">taken</span>. The {plural(e.flushed.length, 'instruction')} fetched behind it{' '}
          {e.flushed.length ? <>({e.flushed.map((r, i) => <span key={r}>{i ? ', ' : ''}{name(r)}</span>)}) </> : null}
          {e.flushed.length === 1 ? 'is' : 'are'} <span className="hl bad">flushed</span>, and IF fetches from <code>{program[e.targetPc].label}</code> instead.{' '}
        </>,
      );
    } else if (e.kind === 'data-stall') {
      const p = run.rows[e.producer];
      parts.push(
        e.load && opts.forwarding ? (
          <>
            {name(e.row)} waits in ID: <span className="hl violet">r{e.reg}</span> comes from {name(e.producer)}, which only has it at the end of MEM (cycle {firstCycle(p, 'MEM')}). Even forwarding can't send it back in time,
            so a bubble goes down the pipe.{' '}
          </>
        ) : (
          <>
            {name(e.row)} waits in ID: it needs <span className="hl violet">r{e.reg}</span>, and {name(e.producer)} only writes it back in cycle {firstCycle(p, 'WB')} (forwarding is off). A bubble goes down the pipe.{' '}
          </>
        ),
      );
    } else if (e.kind === 'port-stall') {
      parts.push(
        <>
          No fetch this cycle: {name(e.memRow)} is using the one shared memory port in MEM, so IF has to wait.{' '}
        </>,
      );
    } else if (e.kind === 'forward') {
      const f = e.forward;
      parts.push(
        <>
          {name(f.toRow)} gets <span className="hl violet">r{f.reg}</span> <span className="hl info">forwarded</span> from {name(f.fromRow)}'s {f.fromStage === 'EX' ? 'EX/MEM' : 'MEM/WB'} latch, not the register file, so it
          doesn't wait.{' '}
        </>,
      );
    } else if (e.kind === 'not-taken') {
      parts.push(<>{name(e.branchRow)} finished EX: not taken, so the instructions already fetched behind it were the right ones. Nothing lost.{' '}</>);
    }
  }
  if (parts.length === 0) {
    const fetched = ev.find((e) => e.kind === 'fetch');
    const done = ev.find((e) => e.kind === 'commit');
    if (fetched?.kind === 'fetch') parts.push(<>IF fetches {name(fetched.row)}. </>);
    if (done?.kind === 'commit') parts.push(<>{name(done.row)} writes back: done. </>);
    if (parts.length === 0) parts.push(<>The instructions already in the pipe move one stage on. </>);
  }
  return (
    <>
      Cycle {c}.{' '}
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </>
  );
}

function flatSay(run: PipeRun, program: readonly Instr[], c: number): ReactNode {
  const k = Math.floor((c - 1) / DEPTH);
  const row = run.rows[k];
  const stage = row.cells[c];
  const ins = program[row.pc];
  return (
    <>
      Cycle {c}. <code>{ins.op}</code> is in {stage?.kind === 'stage' ? stage.stage : '?'}. Nothing else runs: the next instruction isn't fetched until this one writes back.
    </>
  );
}

export function summarySay(run: PipeRun): ReactNode {
  const lat = latencies(run);
  const slowest = Math.max(...lat);
  const c = cpi(run.totalCycles, run.committed);
  if (!run.pipelined) {
    return (
      <>
        Not pipelined: {plural(run.committed, 'instruction')} × 5 cycles = <span className="hl">{run.totalCycles} cycles</span>, CPI {c.toFixed(2)}. Each stage's hardware sits idle 4 cycles out of 5. Switch Pipelining
        on to overlap them.
      </>
    );
  }
  const r = run.result!;
  const stalls = r.stalls.data + r.stalls.port;
  return (
    <>
      {plural(run.committed, 'instruction')} in <span className="hl">{run.totalCycles} cycles</span> = n + 4 + {plural(stalls, 'stall cycle')} + {plural(r.flushes, 'flush cycle')}, CPI {c.toFixed(2)} (not
      pipelined: {run.unpipelinedCycles}). Latency didn't shrink: each instruction still took at least 5 cycles from IF to WB{slowest > DEPTH ? <>, and the slowest took {slowest}</> : null}. Throughput did: once the
      pipe is full, one instruction finishes per cycle unless a hazard stalls it.
    </>
  );
}

export function pipeFrames(program: readonly Instr[], start: Machine, opts: PipelineOptions, pipelined: boolean, intro: ReactNode): { run: PipeRun; frames: PipeFrame[] } {
  const r = simulate(program, start, opts, pipelined);
  const rec = createRecorder<PipeFrame>({ cycle: 0 });
  rec.snap(intro, 1.4);
  for (let c = 1; c <= r.totalCycles; c++) {
    rec.snap(pipelined ? cycleSay(r, program, c, r.result!.events[c - 1], opts) : flatSay(r, program, c), undefined, { cycle: c });
  }
  rec.close(summarySay(r), 2);
  return { run: r, frames: rec.frames };
}

/** Final register values, for the "reordering changed nothing" readout. */
export const finalRegs = (program: readonly Instr[], start: Machine) => run(program, start).regs;
