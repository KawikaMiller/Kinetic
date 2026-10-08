import { AnimatedValue } from '../../components/AnimatedValue';
import { MemoryMap, type MemCell, type MemPointer, type MemRegion } from '../../components/memory';
import { Box, SectionTitle } from '../../components/Panel';
import { DATA_BASE, formatValue, STACK_TOP, type RunResult, type Variant } from './model';
import { hex, readMem, type Cpu, type Flag, type Reg64, type StepEffect } from '../../core/x86';

const SHOWN_REGS: Reg64[] = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rsp', 'rbp'];
const FLAGS: Flag[] = ['ZF', 'SF', 'CF', 'OF'];
/** Registers that may point into the data region, most telling first (one label per row). */
const POINTER_REGS: Reg64[] = ['rax', 'rcx', 'rdi'];

export function StatePanel({ run, k, effect, v }: { run: RunResult; k: number; effect: StepEffect | null; v: Variant }) {
  const cpu = run.cpus[k];
  const changed = new Set(effect?.wroteRegs ?? []);
  const ripChanged = effect !== null;
  return (
    <div className="isa-state">
      <Box className="isa-regs" role="group" aria-label="Registers and flags">
        <SectionTitle>registers</SectionTitle>
        <div className="isa-reg-grid">
          {SHOWN_REGS.map((r) => (
            <div key={r} className={`isa-reg ${changed.has(r) ? 'is-changed' : ''}`}>
              <span className="isa-reg-name">{r}</span>
              <AnimatedValue className="isa-reg-value" value={r === 'rsp' || r === 'rbp' ? hex(cpu.regs[r]) : formatValue(cpu.regs[r], v.unsignedTypes)} />
            </div>
          ))}
          <div className={`isa-reg ${ripChanged ? 'is-changed' : ''}`}>
            <span className="isa-reg-name">rip</span>
            <AnimatedValue className="isa-reg-value" value={cpu.halted ? `${hex(cpu.rip)} (caller)` : hex(cpu.rip)} />
          </div>
        </div>
        <div className="isa-flags" aria-label="Flags">
          {FLAGS.map((f) => {
            const read = effect?.readFlags.includes(f);
            const wrote = effect?.wroteFlags.includes(f);
            return (
              <span key={f} className={`isa-flag ${cpu.flags[f] ? 'is-set' : ''} ${read ? 'is-read' : wrote ? 'is-written' : ''}`}>
                {f} <b>{cpu.flags[f] ? 1 : 0}</b>
              </span>
            );
          })}
        </div>
      </Box>
      <div className="isa-maps">
        {run.data.length > 0 && <DataMap run={run} cpu={cpu} effect={effect} v={v} />}
        <StackMap cpu={cpu} />
      </div>
    </div>
  );
}

function DataMap({ run, cpu, effect, v }: { run: RunResult; cpu: Cpu; effect: StepEffect | null; v: Variant }) {
  const end = DATA_BASE + 8 * run.data.length;
  const regions: MemRegion[] = [{ from: DATA_BASE, to: end, label: run.data[0].label.startsWith('a[') ? `a[] · ${run.data.length} longs` : '*r · struct rect', tone: 'sky' }];
  const cells: MemCell[] = run.data.map((d) => ({ addr: d.addr, value: `${d.label} = ${formatValue(d.value, v.unsignedTypes)}` }));
  const seen = new Set<number>();
  const pointers: MemPointer[] = [];
  for (const r of POINTER_REGS) {
    const a = Number(cpu.regs[r]);
    if (a >= DATA_BASE && a <= end && !seen.has(a)) {
      seen.add(a);
      pointers.push({ addr: a, label: r, tone: 'muted' });
    }
  }
  const highlight = (effect?.readMem ?? []).map((m) => m.addr).filter((a) => a >= DATA_BASE && a < end);
  return (
    <div className="isa-map">
      <SectionTitle>data</SectionTitle>
      <MemoryMap regions={regions} cells={cells} pointers={pointers} highlight={highlight} ariaLabel="Data memory" />
    </div>
  );
}

function StackMap({ cpu }: { cpu: Cpu }) {
  const slot = STACK_TOP - 8;
  const live = Number(cpu.regs.rsp) <= slot;
  const ret = readMem(cpu.mem, slot, 64);
  const regions: MemRegion[] = [
    { from: STACK_TOP, to: STACK_TOP + 16, label: 'caller', tone: 'amber' },
    { from: slot, to: STACK_TOP, label: live ? 'return addr' : 'popped', tone: live ? 'violet' : 'dim' },
  ];
  const cells: MemCell[] = [{ addr: slot, value: hex(ret), tone: live ? 'violet' : 'dim' }];
  return (
    <div className="isa-map">
      <SectionTitle>stack (grows down)</SectionTitle>
      <MemoryMap regions={regions} cells={cells} pointers={[{ addr: Number(cpu.regs.rsp), label: 'rsp', tone: 'violet' }]} ariaLabel="Stack memory" />
    </div>
  );
}
