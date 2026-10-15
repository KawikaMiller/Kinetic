import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { SLOT_NAMES, type Instr } from './lang';
import { STEP_BUDGET, type VmState } from './vm';

const stackText = (stack: readonly number[]) => (stack.length ? `[${stack.join(', ')}]` : 'empty');

/** What the last instruction did, said from the state it left. */
export function lastText(s: VmState): string {
  const l = s.last;
  if (!l) return '';
  const { arg } = l.instr;
  const [top, second] = l.popped;
  switch (l.instr.op) {
    case 'PUSH': return `PUSH ${arg} puts ${arg} on the stack.`;
    case 'POP': return `POP discards ${top}.`;
    case 'ADD': return `ADD pops ${second} and ${top} and pushes ${l.pushed[0]}.`;
    case 'SUB': return `SUB pops ${top}, then ${second}, and pushes ${second} - ${top} = ${l.pushed[0]}.`;
    case 'MUL': return `MUL pops ${second} and ${top} and pushes ${l.pushed[0]}.`;
    case 'LT': return `LT pops ${top}, then ${second}, and pushes ${l.pushed[0]}: ${second} is ${l.pushed[0] === 1 ? '' : 'not '}less than ${top}.`;
    case 'LOAD': return `LOAD ${arg} copies slot ${SLOT_NAMES[arg!]} (${l.pushed[0]}) onto the stack.`;
    case 'STORE': return `STORE ${arg} pops ${top} into slot ${SLOT_NAMES[arg!]}.`;
    case 'JMP': return `JMP ${arg} sets pc to ${arg}.`;
    case 'JZ': return l.jumped ? `JZ ${arg} pops ${top}, which is zero, so pc jumps to ${arg}.` : `JZ ${arg} pops ${top}, which is not zero, so execution goes on at ${s.pc}.`;
    case 'PRINT': return `PRINT pops ${top} and prints it.`;
    case 'HALT': return `HALT stops the machine after ${plural(s.steps, 'instruction')}.`;
  }
}

/** The caption for one state of a run. */
export function stateCaption(s: VmState, program: readonly Instr[]): ReactNode {
  if (s.status === 'error') {
    return (
      <>
        <span className="hl bad wrap">{s.error}</span>. The machine stops with pc = {s.pc} and the stack {stackText(s.stack)}, after {plural(s.steps, 'instruction')}.
      </>
    );
  }
  if (s.status === 'budget') {
    return <>The program <span className="hl wrap">did not halt within {STEP_BUDGET.toLocaleString('en-US')} steps</span>: pc is {s.pc} and the stack {stackText(s.stack)}. That is where the run was cut off, not a proof that it loops.</>;
  }
  if (s.steps === 0) {
    return <>The listing has {plural(program.length, 'instruction')}. pc is 0 and the stack is empty. Step, or press play.</>;
  }
  const printed = s.out.length ? ` Output so far: ${s.out.join(' ')}.` : '';
  return <>{lastText(s)}{s.status === 'halted' ? printed : ` The stack is now ${stackText(s.stack)}.${printed}`}</>;
}
