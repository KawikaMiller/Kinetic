import { ArrayStrip } from '../../components/ArrayStrip';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { plainTone } from '../../core/tone';
import { formatInstr, SLOT_NAMES, type Instr } from './lang';
import { STACK_LIMIT, type VmState } from './vm';

const STRIP_CELL_MAX = 46;

/** Listing, operand stack, slots and output of one state of the VM. Highlights the instruction about to run and what the last one moved. */
export function VmPanel({ program, state }: { program: readonly Instr[]; state: VmState }) {
  const { last } = state;
  const lineState = (i: number): LineState => {
    if (state.status === 'error' && i === state.pc) return 'bad';
    if (state.status === 'running' && i === state.pc) return 'now';
    if (state.status === 'halted' && last && i === last.pcBefore) return 'done';
    return 'idle';
  };
  const topIndex = state.stack.length - 1;
  const pushedFrom = state.stack.length - (last?.pushed.length ?? 0);
  return (
    <div className="bv-grid">
      <CodePanel
        title="Listing"
        lines={program.map((ins) => formatInstr(ins))}
        stateOf={lineState}
        trailing={(i) => (last?.jumped && i === last.pcBefore ? <span className="bv-jump">→ {state.pc}</span> : null)}
      />
      <Box variant="sunken" className="bv-machine">
        <SectionTitle hint={`top on the right, limit ${STACK_LIMIT}`}>Operand stack</SectionTitle>
        {state.stack.length === 0 ? (
          <span className="empty-note">empty</span>
        ) : (
          <ArrayStrip
            values={state.stack}
            cellState={(i) => (i === topIndex ? 'info' : 'idle')}
            cellTone={(i) => (i >= pushedFrom && i !== topIndex ? 'ok' : null)}
            cellMax={STRIP_CELL_MAX}
            fontSize={12}
          />
        )}
        <p className="bv-popped" aria-label="Values the last instruction popped">
          popped: {last && last.popped.length ? last.popped.join(', ') : 'none'}
        </p>
        <SectionTitle hint="four local slots">Slots</SectionTitle>
        <CellGrid
          rows={1}
          cols={SLOT_NAMES.length}
          size="md"
          colLabels={[...SLOT_NAMES]}
          cell={(_, c) => ({ text: state.slots[c], tone: plainTone(c), fill: 'tint' })}
          highlight={last?.stored != null ? [{ r: 0, c: last.stored, tone: 'ok' }] : []}
          ariaLabel="Slots a to d"
        />
        <ConsolePanel title="output" lines={[...state.out.map(String), ...(state.status === 'error' && state.error ? [{ text: state.error, tone: 'bad' as const }] : [])]} empty="nothing printed yet" />
      </Box>
    </div>
  );
}
