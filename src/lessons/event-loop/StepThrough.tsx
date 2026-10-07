import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import { SNIPPETS } from './sim';

const CHIP_SPRING = { type: 'spring', stiffness: 420, damping: 30 } as const;
/** How far a chip slides as it enters or leaves a queue / the stack, in px. */
const CHIP_SLIDE = 20;
const STACK_DROP = 14;

/** Step a snippet through the call stack, Web APIs, both task queues and the console. */
export function StepThrough({ picker }: { picker: ReactNode }) {
  const [snippetId, setSnippetId] = useState(SNIPPETS[0].id);
  const snippet = SNIPPETS.find((s) => s.id === snippetId)!;
  const frames = useMemo(() => buildFrames(snippet), [snippet]);
  const player = usePlayer(frames, { interval: 1500 });
  const f = player.frame;

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Running" value={f.phase === 'idle' ? '—' : f.phase} color={f.phase === 'microtasks' ? 'var(--violet)' : f.phase === 'macrotask' ? 'var(--info)' : undefined} />
          <Stat label="Microtasks" value={f.micro.length} color="var(--violet)" />
          <Stat label="Macrotasks" value={f.macro.length} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running now' },
            { color: 'var(--violet)', label: 'microtask (promises, await)' },
            { color: 'var(--info)', label: 'macrotask (timers, events)' },
            { color: 'var(--ok)', label: 'output' },
          ]}
        />
      }
      controls={
        <Controls>
          {picker}
          <Segmented
            label="Snippet"
            value={snippetId}
            onChange={setSnippetId}
            options={SNIPPETS.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Hint block>
            A simplified model. The snippets' output order is checked against real JavaScript, but timers here move to the queue
            only once the stack empties (real ones queue whenever they expire), there is one macrotask queue (browsers have
            several task sources and render between tasks), and Node's extra phases and process.nextTick are left out.
          </Hint>
        </Controls>
      }
    >
      <div className="el">
        <div className="el-code">
          <span className="el-label">code</span>
          <ol>
            {snippet.code.map((line, i) => (
              <li key={i} className={f.line === i ? 'on' : ''}>
                <span className="el-ln">{i + 1}</span>
                <code>{line}</code>
              </li>
            ))}
          </ol>
        </div>

        <div className="el-machine">
          <MachinePanel title="Call stack" hint="runs one thing at a time" focus={f.focus === 'stack'} className="el-stack">
            <Chips items={[...f.stack].reverse()} kind="stack" empty="empty" />
          </MachinePanel>
          <MachinePanel title="Web APIs" hint="timers run in the browser, not JS" focus={f.focus === 'apis'}>
            <Chips items={f.apis} kind="api" empty="no timers" />
          </MachinePanel>
          <MachinePanel title="Microtask queue" hint="promise callbacks · drained completely" focus={f.focus === 'micro'} className="el-micro">
            <Chips items={f.micro} kind="micro" empty="empty" row />
          </MachinePanel>
          <MachinePanel title="Macrotask queue" hint="timers, clicks, I/O · one per loop" focus={f.focus === 'macro'} className="el-macro">
            <Chips items={f.macro} kind="macro" empty="empty" row />
          </MachinePanel>
          <MachinePanel title="Console" hint="" focus={f.focus === 'out'} className="el-out">
            <Chips items={f.out} kind="out" empty="nothing logged yet" row numbered />
          </MachinePanel>
        </div>
      </div>
    </StageFrame>
  );
}

/** One part of the runtime (stack, queue, console), highlighted when the step touches it. */
function MachinePanel({ title, hint, focus, className = '', children }: { title: string; hint: string; focus: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={`el-box ${className} ${focus ? 'focus' : ''}`}>
      <header>
        <b>{title}</b>
        {hint && <span>{hint}</span>}
      </header>
      {children}
    </section>
  );
}

function Chips({ items, kind, empty, row, numbered }: { items: string[]; kind: string; empty: string; row?: boolean; numbered?: boolean }) {
  return (
    <div className={`el-chips ${row ? 'row' : ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.length === 0 && (
          <motion.span key="empty" className="el-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {empty}
          </motion.span>
        )}
        {items.map((it, i) => (
          <motion.span
            key={`${it}-${kind === 'out' ? i : ''}`}
            layout
            className={`el-chip ${kind} ${kind === 'stack' && i === 0 ? 'top' : ''}`}
            initial={{ opacity: 0, scale: 0.6, y: kind === 'stack' ? -STACK_DROP : 0, x: row ? CHIP_SLIDE : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: row ? -CHIP_SLIDE : 0 }}
            transition={CHIP_SPRING}
          >
            {numbered && <i>{i + 1}</i>}
            {it}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
