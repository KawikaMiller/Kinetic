/**
 * The dispatch loop as the page shows it: the same logic as `stepVm` in vm.ts, written as the
 * few lines of JavaScript a VM is made of (fetch, switch on the opcode, execute). A test runs
 * this exact text as JavaScript and compares every trace with vm.ts, so the text on screen is
 * code that behaves the way the page's VM does.
 */
export const DISPATCH_SOURCE = `function step(vm, program) {
  if (vm.pc >= program.length) return fail(vm, 'pc ' + vm.pc + ' is past the end of the program: no HALT was reached');
  const [op, arg] = program[vm.pc];
  const stack = vm.stack;
  switch (op) {
    case 'PUSH':
      if (stack.length >= 32) return fail(vm, 'the stack is full (32 values): PUSH would make it 33');
      stack.push(arg); vm.pc++; break;
    case 'POP':
      if (!need(vm, op, 1)) return;
      stack.pop(); vm.pc++; break;
    case 'ADD': {
      if (!need(vm, op, 2)) return;
      const b = stack.pop(), a = stack.pop();
      stack.push(a + b); vm.pc++; break;
    }
    case 'SUB': {
      if (!need(vm, op, 2)) return;
      const b = stack.pop(), a = stack.pop();
      stack.push(a - b); vm.pc++; break;
    }
    case 'MUL': {
      if (!need(vm, op, 2)) return;
      const b = stack.pop(), a = stack.pop();
      stack.push(a * b); vm.pc++; break;
    }
    case 'LT': {
      if (!need(vm, op, 2)) return;
      const b = stack.pop(), a = stack.pop();
      stack.push(a < b ? 1 : 0); vm.pc++; break;
    }
    case 'LOAD':
      if (stack.length >= 32) return fail(vm, 'the stack is full (32 values): LOAD would make it 33');
      stack.push(vm.slots[arg]); vm.pc++; break;
    case 'STORE':
      if (!need(vm, op, 1)) return;
      vm.slots[arg] = stack.pop(); vm.pc++; break;
    case 'JMP':
      vm.pc = arg; break;
    case 'JZ':
      if (!need(vm, op, 1)) return;
      vm.pc = stack.pop() === 0 ? arg : vm.pc + 1; break;
    case 'PRINT':
      if (!need(vm, op, 1)) return;
      vm.out.push(stack.pop()); vm.pc++; break;
    case 'HALT':
      vm.status = 'halted'; break;
  }
  vm.steps++;
}

function need(vm, op, n) {
  if (vm.stack.length >= n) return true;
  fail(vm, op + ' needs ' + n + ' value' + (n === 1 ? '' : 's') + ', the stack has ' + vm.stack.length);
  return false;
}

function fail(vm, message) {
  vm.status = 'error';
  vm.error = message;
}`;

export const DISPATCH_LINES = DISPATCH_SOURCE.split('\n');

/** The lines of the snippet that run for an opcode: from its `case` to just before the next one (the fetch lines for no opcode). */
export function linesForOp(op: string): number[] {
  const start = DISPATCH_LINES.findIndex((l) => l.trim().startsWith(`case '${op}'`));
  if (start === -1) return [];
  const out: number[] = [];
  for (let i = start; i < DISPATCH_LINES.length; i++) {
    if (i > start && /^\s{4}(case|default)\b/.test(DISPATCH_LINES[i])) break;
    if (/^\s{2}\}$/.test(DISPATCH_LINES[i])) break;
    out.push(i);
  }
  return out;
}

/** The fetch lines every instruction runs first. */
export const FETCH_LINES = [0, 1, 2, 3, 4];
